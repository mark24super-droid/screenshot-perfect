import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workflowDefinitionSchema, validateWorkflow, type WorkflowDefinition } from "@/lib/workflow-schema";
import { runWorkflow, sanitize, type EngineStepResult } from "@/lib/engine.server";
import { getPlan } from "@/lib/plans";
import { getUsageSnapshot, recordUsage } from "@/lib/usage.server";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string; claims: unknown };

async function requireWorkspace(context: Ctx) {
  const { supabase, userId } = context;
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !workspace) throw new Error("No workspace found for this account.");
  return workspace;
}

async function connectedIntegrations(supabase: Ctx["supabase"], userId: string): Promise<("google_mail" | "google_sheets")[]> {
  const { data } = await supabase
    .from("integrations")
    .select("provider, status")
    .eq("user_id", userId)
    .eq("status", "connected");
  return (data ?? []).map((r) => r.provider as "google_mail" | "google_sheets");
}

async function loadDefinition(supabase: Ctx["supabase"], workflowId: string): Promise<WorkflowDefinition> {
  const { data: version, error } = await supabase
    .from("workflow_versions")
    .select("id, definition")
    .eq("workflow_id", workflowId)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error || !version) throw new Error("Save the workflow first — there is no saved version to run yet.");
  return workflowDefinitionSchema.parse(version.definition);
}

async function recordSteps(
  supabase: Ctx["supabase"],
  executionId: string,
) {
  return async (node: { id: string; type: string }, result: { status: string; output: Record<string, unknown>; errorCode?: string; errorMessage?: string }, durationMs: number) => {
    await supabase.from("execution_steps").insert({
      execution_id: executionId,
      node_id: node.id,
      node_type: node.type,
      status: result.status,
      started_at: new Date(Date.now() - durationMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      input: null,
      output: sanitize(result.output),
      error_code: result.errorCode ?? null,
      error_message: result.errorMessage ?? null,
    });
  };
}

export const runWorkflowTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workflowId: z.string().uuid(),
        mode: z.enum(["simulation", "live"]).default("simulation"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as Ctx).supabase;
    const userId = (context as Ctx).userId;
    const workspace = await requireWorkspace(context as Ctx);

    const { data: workflow } = await supabase
      .from("workflows")
      .select("id, name, status")
      .eq("id", data.workflowId)
      .eq("workspace_id", workspace.id)
      .single();
    if (!workflow) throw new Error("Workflow not found.");

    const definition = await loadDefinition(supabase, data.workflowId);
    const connected = await connectedIntegrations(supabase, userId);
    const issues = validateWorkflow(definition, { connectedIntegrations: connected });
    const blocking = issues.filter((i) => i.level === "error");
    if (blocking.length > 0) {
      return { ok: false as const, validation: issues, executionId: null as string | null };
    }

    const plan = getPlan("free");
    const usage = await getUsageSnapshot(supabase, workspace.id, plan.limits);
    if (usage.executionsThisMonth >= usage.limitMonthlyExecutions) {
      return {
        ok: false as const,
        validation: [],
        executionId: null as string | null,
        limitError: `You've used all ${usage.limitMonthlyExecutions} executions for this month on the ${plan.name} plan. Upgrade for a higher allowance.`,
      };
    }

    const { data: execution, error: execError } = await supabase
      .from("executions")
      .insert({ workflow_id: data.workflowId, status: "running", mode: data.mode })
      .select("id")
      .single();
    if (execError || !execution) throw new Error(execError?.message ?? "Could not start the execution.");

    const record = await recordSteps(supabase, execution.id);
    const engineResult = await runWorkflow(definition, { mode: data.mode, userId, outputs: {} }, record);

    const finalStatus =
      engineResult.status === "succeeded"
        ? "succeeded"
        : engineResult.status === "partially_succeeded"
          ? "partially_succeeded"
          : "failed";

    const { error: updateError } = await supabase
      .from("executions")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        duration_ms: engineResult.steps.reduce((a, s) => a + s.durationMs, 0),
        error_summary: engineResult.errorSummary,
      })
      .eq("id", execution.id);
    if (updateError) console.error("execution update failed", updateError.message);

    await recordUsage(supabase, workspace.id, "execution");

    return {
      ok: true as const,
      validation: issues,
      executionId: execution.id as string,
      status: finalStatus,
      steps: engineResult.steps,
      mode: data.mode,
    };
  });

export const listExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["all", "succeeded", "failed", "running", "partially_succeeded"]).default("all"),
        workflowId: z.string().uuid().optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const supabase = (context as Ctx).supabase;
    let query = supabase
      .from("executions")
      .select("id, workflow_id, status, mode, started_at, finished_at, duration_ms, error_summary, workflows(name)")
      .order("started_at", { ascending: false })
      .range(data.page * data.pageSize, (data.page + 1) * data.pageSize - 1);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.workflowId) query = query.eq("workflow_id", data.workflowId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((e) => {
      const wf = Array.isArray(e.workflows) ? e.workflows[0] : e.workflows;
      return {
        id: e.id,
        workflowId: e.workflow_id,
        workflowName: wf?.name ?? "Unknown workflow",
        status: e.status,
        mode: e.mode,
        startedAt: e.started_at,
        finishedAt: e.finished_at,
        durationMs: e.duration_ms,
        errorSummary: e.error_summary,
      };
    });
  });

export const getExecution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const supabase = (context as Ctx).supabase;
    const { data: execution } = await supabase
      .from("executions")
      .select("id, workflow_id, workflow_version_id, status, mode, started_at, finished_at, duration_ms, error_summary, workflows(name)")
      .eq("id", data.id)
      .single();
    if (!execution) throw new Error("Execution not found.");

    const wf = Array.isArray(execution.workflows) ? execution.workflows[0] : execution.workflows;
    const { data: wfRow } = await supabase.from("workflows").select("workspace_id").eq("id", execution.workflow_id).single();
    if (!wfRow || wfRow.workspace_id !== workspace.id) throw new Error("Execution not found.");

    const { data: steps } = await supabase
      .from("execution_steps")
      .select("id, node_id, node_type, status, started_at, finished_at, duration_ms, output, error_code, error_message")
      .eq("execution_id", execution.id)
      .order("started_at", { ascending: true, nullsFirst: false });

    return {
      id: execution.id,
      workflowId: execution.workflow_id,
      workflowName: wf?.name ?? "Unknown workflow",
      status: execution.status,
      mode: execution.mode,
      startedAt: execution.started_at,
      finishedAt: execution.finished_at,
      durationMs: execution.duration_ms,
      errorSummary: execution.error_summary,
      steps: (steps ?? []).map((s) => ({
        id: s.id,
        nodeId: s.node_id,
        nodeType: s.node_type,
        status: s.status,
        durationMs: s.duration_ms,
        output: s.output,
        errorCode: s.error_code,
        errorMessage: s.error_message,
      })),
    };
  });

export const retryExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ executionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = (context as Ctx).supabase;
    const { data: execution } = await supabase
      .from("executions")
      .select("id, workflow_id")
      .eq("id", data.executionId)
      .single();
    if (!execution) throw new Error("Execution not found.");

    // Re-run against the same workflow's latest saved version (retry runs the
    // current definition — it never invents state from the old run).
    const result = await runWorkflowTest({ data: { workflowId: execution.workflow_id, mode: "simulation" }, context: context as never });
    return result;
  });

export type { EngineStepResult };
