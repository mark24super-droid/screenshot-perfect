import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeWorkflowDefinition, validateWorkflow, type WorkflowDefinition } from "@/lib/workflow-schema";
import { runWorkflow, sanitize, type EngineStepResult, type NodeRunOutput } from "@/lib/engine.server";
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

async function connectedIntegrations(
  supabase: Ctx["supabase"],
  userId: string,
): Promise<("google_mail" | "google_sheets")[]> {
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
  return normalizeWorkflowDefinition(version.definition);
}

/** Persists each node result as it completes so the UI can show live progress. */
function stepRecorder(supabase: Ctx["supabase"], executionId: string) {
  return async (
    node: { id: string; type: string },
    result: NodeRunOutput,
    durationMs: number,
    input: Record<string, unknown>,
    attempts: number,
  ) => {
    // The database enum has no "skipped" member. "cancelled" is the honest
    // persisted equivalent: the step was deliberately not executed.
    const persistedStatus = result.status === "skipped" ? "cancelled" : result.status;
    await supabase.from("execution_steps").insert({
      execution_id: executionId,
      node_id: node.id,
      node_type: node.type,
      status: persistedStatus,
      started_at: new Date(Date.now() - durationMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      input: sanitize(input),
      output: sanitize(result.output),
      error_code: result.errorCode ?? null,
      error_message:
        attempts > 1 && result.errorMessage
          ? `${result.errorMessage} (tried ${attempts} times)`
          : result.errorMessage ?? null,
    });
  };
}

interface ExecuteInput {
  workflowId: string;
  mode: "simulation" | "live";
  sampleInput?: Record<string, any> | undefined;
}

async function executeSavedWorkflow(
  context: Ctx,
  input: ExecuteInput,
): Promise<{
  ok: boolean;
  validation: ReturnType<typeof validateWorkflow>;
  executionId: string | null;
  status?: string | undefined;
  steps?: EngineStepResult[] | undefined;
  mode: "simulation" | "live";
  limitError?: string | undefined;
}> {
  const supabase = context.supabase;
  const userId = context.userId;
  const workspace = await requireWorkspace(context);

  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, name, status")
    .eq("id", input.workflowId)
    .eq("workspace_id", workspace.id)
    .single();
  if (!workflow) throw new Error("Workflow not found.");

  const { data: latestVersion } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", input.workflowId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const definition = await loadDefinition(supabase, input.workflowId);
  const connected = await connectedIntegrations(supabase, userId);
  // Simulations must be possible before any account is connected; live runs
  // are blocked unless every required integration is actually connected.
  const issues = validateWorkflow(definition, {
    connectedIntegrations: connected,
    requireIntegrations: input.mode === "live",
  });
  const blocking = issues.filter((i) => i.level === "error");
  if (blocking.length > 0) {
    return { ok: false, validation: issues, executionId: null, mode: input.mode };
  }

  const plan = getPlan("free");
  const usage = await getUsageSnapshot(supabase, workspace.id, plan.limits);
  if (usage.executionsThisMonth >= usage.limitMonthlyExecutions) {
    return {
      ok: false,
      validation: [],
      executionId: null,
      mode: input.mode,
      limitError: `You've used all ${usage.limitMonthlyExecutions} executions for this month on the ${plan.name} plan. Upgrade for a higher allowance.`,
    };
  }

  const { data: execution, error: execError } = await supabase
    .from("executions")
    .insert({
      workflow_id: input.workflowId,
      workflow_version_id: latestVersion?.id ?? null,
      status: "running",
      mode: input.mode,
      trigger_payload: input.sampleInput ? sanitize(input.sampleInput) : null,
    })
    .select("id")
    .single();
  if (execError || !execution) throw new Error(execError?.message ?? "Could not start the execution.");

  const engineResult = await runWorkflow(
    definition,
    { mode: input.mode, userId, outputs: {}, input: input.sampleInput },
    stepRecorder(supabase, execution.id),
  );

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
    ok: true,
    validation: issues,
    executionId: execution.id as string,
    status: finalStatus,
    steps: engineResult.steps,
    mode: input.mode,
  };
}

export const runWorkflowTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workflowId: z.string().uuid(),
        mode: z.enum(["simulation", "live"]).default("simulation"),
        sampleInput: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return executeSavedWorkflow(context as Ctx, {
      workflowId: data.workflowId,
      mode: data.mode,
      sampleInput: data.sampleInput,
    });
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
      .select(
        "id, workflow_id, status, mode, started_at, finished_at, duration_ms, error_summary, workflows!inner(name, workspace_id)",
      )
      .eq("workflows.workspace_id", workspace.id)
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
      .select(
        "id, workflow_id, workflow_version_id, status, mode, trigger_payload, started_at, finished_at, duration_ms, error_summary, workflows!inner(name, workspace_id)",
      )
      .eq("id", data.id)
      .single();
    if (!execution) throw new Error("Execution not found.");

    const wf = Array.isArray(execution.workflows) ? execution.workflows[0] : execution.workflows;
    if (!wf || wf.workspace_id !== workspace.id) throw new Error("Execution not found.");

    const { data: steps } = await supabase
      .from("execution_steps")
      .select("id, node_id, node_type, status, started_at, finished_at, duration_ms, input, output, error_code, error_message")
      .eq("execution_id", execution.id)
      .order("started_at", { ascending: true, nullsFirst: false });

    return {
      id: execution.id,
      workflowId: execution.workflow_id,
      workflowName: wf?.name ?? "Unknown workflow",
      status: execution.status,
      mode: execution.mode,
      triggerPayload: execution.trigger_payload,
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
        input: s.input,
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
    const workspace = await requireWorkspace(context as Ctx);
    const { data: execution } = await supabase
      .from("executions")
      .select("id, workflow_id, mode, trigger_payload, workflows!inner(workspace_id)")
      .eq("id", data.executionId)
      .single();
    if (!execution) throw new Error("Execution not found.");
    const wf = Array.isArray(execution.workflows) ? execution.workflows[0] : execution.workflows;
    if (!wf || wf.workspace_id !== workspace.id) throw new Error("Execution not found.");

    // Retry uses the same mode and payload as the original run, against the
    // latest saved definition. It never invents state from the old execution.
    return executeSavedWorkflow(context as Ctx, {
      workflowId: execution.workflow_id,
      mode: execution.mode === "live" ? "live" : "simulation",
      sampleInput:
        execution.trigger_payload && typeof execution.trigger_payload === "object"
          ? (execution.trigger_payload as Record<string, unknown>)
          : undefined,
    });
  });

export type { EngineStepResult };
