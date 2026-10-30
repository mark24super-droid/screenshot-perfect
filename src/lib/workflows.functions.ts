import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  workflowDefinitionSchema,
  validateWorkflow,
  integrationForWorkflow,
  isTriggerType,
  type WorkflowDefinition,
} from "@/lib/workflow-schema";
import { getPlan } from "@/lib/plans";
import { getUsageSnapshot } from "@/lib/usage.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string; claims: unknown };

async function requireWorkspace(context: Ctx) {
  const { supabase, userId } = context;
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name")
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

async function getPlanForUser(supabase: Ctx["supabase"], userId: string) {
  // Single plan tier for now; loaded from a subscription table when billing ships.
  void supabase; void userId;
  return getPlan("free");
}

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { data: workflows, error } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .select("id, name, description, status, trigger_type, updated_at, created_at")
      .eq("workspace_id", workspace.id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (workflows ?? []).map((w) => w.id);
    const { data: execs } = ids.length
      ? await (context.supabase as Ctx["supabase"]).from("executions").select("workflow_id, status, started_at").in("workflow_id", ids).order("started_at", { ascending: false })
      : { data: [] as { workflow_id: string; status: string; started_at: string }[] };

    const byWorkflow = new Map<string, { status: string; started_at: string }[]>();
    for (const e of execs ?? []) {
      const list = byWorkflow.get(e.workflow_id) ?? [];
      if (list.length < 20) list.push({ status: e.status, started_at: e.started_at });
      byWorkflow.set(e.workflow_id, list);
    }

    return (workflows ?? []).map((w) => {
      const runs = byWorkflow.get(w.id) ?? [];
      const finished = runs.filter((r) => r.status === "succeeded" || r.status === "failed");
      const rate = finished.length ? Math.round((finished.filter((r) => r.status === "succeeded").length / finished.length) * 100) : null;
      return {
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        triggerType: w.trigger_type,
        updatedAt: w.updated_at,
        createdAt: w.created_at,
        lastRunAt: runs[0]?.started_at ?? null,
        lastRunStatus: runs[0]?.status ?? null,
        successRate: rate,
      };
    });
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { data: workflow, error } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .select("*")
      .eq("id", data.id)
      .eq("workspace_id", workspace.id)
      .single();
    if (error || !workflow) throw new Error("Workflow not found.");
    const { data: version } = await (context.supabase as Ctx["supabase"])
      .from("workflow_versions")
      .select("id, version, definition")
      .eq("workflow_id", workflow.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const definition = workflowDefinitionSchema.parse(version?.definition ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    const connected = await connectedIntegrations(context.supabase as Ctx["supabase"], context.userId);
    const issues = validateWorkflow(definition, { connectedIntegrations: connected });

    const { data: lastExecution } = await (context.supabase as Ctx["supabase"])
      .from("executions")
      .select("id, status, mode, started_at, finished_at, duration_ms, error_summary")
      .eq("workflow_id", workflow.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      version: version?.version ?? 0,
      versionId: version?.id ?? null,
      definition,
      validation: issues,
      connectedIntegrations: connected,
      lastExecution: lastExecution
        ? { id: lastExecution.id, status: lastExecution.status, mode: lastExecution.mode, startedAt: lastExecution.started_at, durationMs: lastExecution.duration_ms, errorSummary: lastExecution.error_summary }
        : null,
    };
  });

export const createWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).default(""),
        definition: workflowDefinitionSchema.optional(),
        status: z.enum(["draft", "needs_configuration"]).default("draft"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const plan = await getPlanForUser(context.supabase as Ctx["supabase"], context.userId);
    const usage = await getUsageSnapshot(context.supabase as Ctx["supabase"], workspace.id, plan.limits);
    if (usage.workflows >= usage.limitWorkflows) {
      throw new Error(`You've reached the ${plan.name} plan limit of ${usage.limitWorkflows} workflows. Upgrade to save more.`);
    }

    const trigger = data.definition?.nodes.find((n) => isTriggerType(n.type));
    const { data: workflow, error } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .insert({
        workspace_id: workspace.id,
        name: data.name,
        description: data.description,
        status: data.status,
        trigger_type: trigger?.type ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.definition) {
      const { error: vErr } = await (context.supabase as Ctx["supabase"]).from("workflow_versions").insert({
        workflow_id: workflow.id,
        version: 1,
        definition: data.definition,
        created_by: context.userId,
      });
      if (vErr) throw new Error(vErr.message);
    }
    return { id: workflow.id as string };
  });

const saveInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  definition: workflowDefinitionSchema,
});

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { data: workflow } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .select("id, active_version_id")
      .eq("id", data.id)
      .eq("workspace_id", workspace.id)
      .single();
    if (!workflow) throw new Error("Workflow not found.");

    const { data: latest } = await (context.supabase as Ctx["supabase"])
      .from("workflow_versions")
      .select("id, version")
      .eq("workflow_id", data.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const nextVersion = (latest?.version ?? 0) + 1;

    const { data: version, error } = await (context.supabase as Ctx["supabase"])
      .from("workflow_versions")
      .insert({ workflow_id: data.id, version: nextVersion, definition: data.definition, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const connected = await connectedIntegrations(context.supabase as Ctx["supabase"], context.userId);
    const issues = validateWorkflow(data.definition, { connectedIntegrations: connected });
    const blocking = issues.filter((i) => i.level === "error");
    const trigger = data.definition.nodes.find((n) => isTriggerType(n.type));

    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), trigger_type: trigger?.type ?? null };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    // An active workflow whose new save has blocking errors moves to
    // needs_configuration; drafts that validate cleanly stay visible as ready.
    const { data: current } = await (context.supabase as Ctx["supabase"]).from("workflows").select("status").eq("id", data.id).single();
    if (current?.status !== "active" && current?.status !== "paused") {
      update.status = blocking.length === 0 ? "needs_configuration" : "needs_configuration";
    }
    const { error: uErr } = await (context.supabase as Ctx["supabase"]).from("workflows").update(update).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    return { versionId: version.id as string, version: nextVersion, issues };
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { error } = await (context.supabase as Ctx["supabase"]).from("workflows").delete().eq("id", data.id).eq("workspace_id", workspace.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { data: source } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .select("name, description, trigger_type")
      .eq("id", data.id)
      .eq("workspace_id", workspace.id)
      .single();
    if (!source) throw new Error("Workflow not found.");
    const { data: version } = await (context.supabase as Ctx["supabase"])
      .from("workflow_versions")
      .select("definition")
      .eq("workflow_id", data.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const plan = await getPlanForUser(context.supabase as Ctx["supabase"], context.userId);
    const usage = await getUsageSnapshot(context.supabase as Ctx["supabase"], workspace.id, plan.limits);
    if (usage.workflows >= usage.limitWorkflows) {
      throw new Error(`You've reached the ${plan.name} plan limit of ${usage.limitWorkflows} workflows.`);
    }

    const { data: created, error } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .insert({
        workspace_id: workspace.id,
        name: `${source.name} (copy)`,
        description: source.description,
        status: "draft",
        trigger_type: source.trigger_type,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (version?.definition) {
      await (context.supabase as Ctx["supabase"]).from("workflow_versions").insert({
        workflow_id: created.id,
        version: 1,
        definition: version.definition,
        created_by: context.userId,
      });
    }
    return { id: created.id as string };
  });

export const renameWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { error } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .update({ name: data.name, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("workspace_id", workspace.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), action: z.enum(["activate", "pause"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const { data: workflow } = await (context.supabase as Ctx["supabase"])
      .from("workflows")
      .select("id, status, active_version_id")
      .eq("id", data.id)
      .eq("workspace_id", workspace.id)
      .single();
    if (!workflow) throw new Error("Workflow not found.");

    if (data.action === "pause") {
      const { error } = await (context.supabase as Ctx["supabase"]).from("workflows").update({ status: "paused" }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, status: "paused" };
    }

    // Activate: validate the active version; block on any error.
    if (!workflow.active_version_id) {
      throw new Error("Save the workflow before activating it.");
    }
    const { data: version } = await (context.supabase as Ctx["supabase"])
      .from("workflow_versions")
      .select("definition")
      .eq("id", workflow.active_version_id)
      .single();
    if (!version) throw new Error("Save the workflow before activating it.");
    const definition = workflowDefinitionSchema.parse(version.definition);
    const connected = await connectedIntegrations(context.supabase as Ctx["supabase"], context.userId);
    const issues = validateWorkflow(definition, { connectedIntegrations: connected });
    const blocking = issues.filter((i) => i.level === "error");
    if (blocking.length > 0) {
      throw new Error(`Fix ${blocking.length} problem${blocking.length > 1 ? "s" : ""} first: ${blocking[0].message}`);
    }
    const { error } = await (context.supabase as Ctx["supabase"]).from("workflows").update({ status: "active" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, status: "active" };
  });

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const plan = await getPlanForUser(context.supabase as Ctx["supabase"], context.userId);
    const supabase = context.supabase as Ctx["supabase"];

    const [usage, recentWorkflows, recentExecutions, integrations, templates] = await Promise.all([
      getUsageSnapshot(supabase, workspace.id, plan.limits),
      supabase.from("workflows").select("id, name, status, trigger_type, updated_at").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }).limit(5),
      supabase
        .from("executions")
        .select("id, workflow_id, status, mode, started_at, duration_ms, workflows(name)")
        .order("started_at", { ascending: false })
        .limit(8),
      supabase.from("integrations").select("provider, status").eq("user_id", context.userId),
      supabase.from("templates").select("slug, name, description, category, definition").eq("is_published", true).limit(4),
    ]);

    return {
      workspaceName: workspace.name,
      usage,
      planName: plan.name,
      recentWorkflows: (recentWorkflows.data ?? []).map((w) => ({ id: w.id, name: w.name, status: w.status, triggerType: w.trigger_type, updatedAt: w.updated_at })),
      recentExecutions: (recentExecutions.data ?? []).map((e) => {
        const wf = Array.isArray(e.workflows) ? e.workflows[0] : e.workflows;
        return {
          id: e.id,
          workflowName: wf?.name ?? "Unknown workflow",
          status: e.status,
          mode: e.mode,
          startedAt: e.started_at,
          durationMs: e.duration_ms,
        };
      }),
      integrations: {
        google_mail: (integrations.data ?? []).find((i) => i.provider === "google_mail")?.status ?? "not_connected",
        google_sheets: (integrations.data ?? []).find((i) => i.provider === "google_sheets")?.status ?? "not_connected",
      },
      quickTemplates: (templates.data ?? []).map((t) => ({ slug: t.slug, name: t.name, description: t.description, category: t.category })),
    };
  });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Ctx["supabase"])
      .from("templates")
      .select("slug, name, description, category, complexity, definition")
      .eq("is_published", true)
      .order("name");
    return (data ?? []).map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: t.category,
      complexity: t.complexity,
      definition: t.definition as WorkflowDefinition,
    }));
  });

export const instantiateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const workspace = await requireWorkspace(context as Ctx);
    const supabase = context.supabase as Ctx["supabase"];
    const { data: template } = await supabase.from("templates").select("name, description, definition").eq("slug", data.slug).eq("is_published", true).single();
    if (!template) throw new Error("Template not found.");

    const plan = await getPlanForUser(supabase, context.userId);
    const usage = await getUsageSnapshot(supabase, workspace.id, plan.limits);
    if (usage.workflows >= usage.limitWorkflows) {
      throw new Error(`You've reached the ${plan.name} plan limit of ${usage.limitWorkflows} workflows.`);
    }

    const definition = workflowDefinitionSchema.parse(template.definition);
    const trigger = definition.nodes.find((n) => isTriggerType(n.type));
    const { data: workflow, error } = await supabase
      .from("workflows")
      .insert({
        workspace_id: workspace.id,
        name: template.name,
        description: template.description,
        status: "draft",
        trigger_type: trigger?.type ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("workflow_versions").insert({
      workflow_id: workflow.id,
      version: 1,
      definition,
      created_by: context.userId,
    });
    return { id: workflow.id as string };
  });

export function integrationsForDefinition(definition: WorkflowDefinition) {
  return integrationForWorkflow(definition);
}
