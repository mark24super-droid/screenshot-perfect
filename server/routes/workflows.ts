import { Router } from "express";
import { z } from "zod";
import { asyncHandler, fail, ok, parsePagination } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { clientKey, rateLimit } from "../lib/rate-limit";
import {
  activateWorkflow,
  createExecution,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  getWorkflowDetail,
  latestVersion,
  listWorkflows,
  parseDefinition,
  pauseWorkflow,
  saveWorkflow,
  validateForMode,
} from "../services/workflows";
import { listExecutions } from "../services/executions";
import { generateWorkflowPlan, recordAiGeneration } from "../services/ai";
import { assertAiLimit } from "../services/usage";
import { workflowDefinitionSchema } from "@shared/workflow";

export const workflowsRouter = Router();

const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  description: z.string().max(500).optional(),
  definition: workflowDefinitionSchema.optional(),
});

const saveSchema = z.object({
  name: z.string().trim().min(1, "Give your automation a name.").max(120).optional(),
  description: z.string().max(500).optional(),
  definition: workflowDefinitionSchema.optional(),
});

const modeSchema = z.object({ mode: z.enum(["simulation", "live"]).default("simulation") });

function limitOrFail(req: Parameters<typeof clientKey>[0], res: Parameters<typeof fail>[0], suffix: string, limit: number): boolean {
  const result = rateLimit(clientKey(req, suffix), limit, 60_000);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfter));
    fail(res, 429, "rate_limited", "You are doing that too quickly. Please wait a moment.");
    return false;
  }
  return true;
}

workflowsRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : undefined;
    const items = listWorkflows(req.auth!.workspace.id, { status, search });
    ok(res, { items, total: items.length });
  }),
);

workflowsRouter.post(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const detail = createWorkflow({
      workspaceId: req.auth!.workspace.id,
      userId: req.auth!.user.id,
      name: body.name,
      description: body.description,
      definition: body.definition,
    });
    ok(res, detail, 201);
  }),
);

workflowsRouter.post(
  "/generate",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!limitOrFail(req, res, "ai-generate", 10)) return;
    const { prompt } = z.object({ prompt: z.string().trim().min(10).max(2000) }).parse(req.body);
    assertAiLimit(req.auth!.workspace.id);
    let success = false;
    try {
      const plan = await generateWorkflowPlan({
        prompt,
        workspaceId: req.auth!.workspace.id,
        userId: req.auth!.user.id,
      });
      success = true;
      recordAiGeneration(req.auth!.workspace.id, req.auth!.user.id, prompt, plan.source, true);
      ok(res, {
        plan,
        mode: plan.source === "provider" ? "ai" : "demo-generator",
        message:
          plan.source === "provider"
            ? "The AI prepared a workflow plan for your review. Nothing has been saved or activated."
            : "A demo workflow plan was generated without an AI provider. Review it carefully before saving.",
      });
    } catch (error) {
      if (success) throw error;
      recordAiGeneration(req.auth!.workspace.id, req.auth!.user.id, prompt, "error", false);
      throw error;
    }
  }),
);

workflowsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = getWorkflowDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "workflow_not_found", "Automation not found.");
      return;
    }
    ok(res, detail);
  }),
);

workflowsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler((req, res) => {
    const body = saveSchema.parse(req.body ?? {});
    const result = saveWorkflow({
      id: req.params.id,
      workspaceId: req.auth!.workspace.id,
      userId: req.auth!.user.id,
      name: body.name,
      description: body.description,
      definition: body.definition,
    });
    ok(res, { ...result.detail, save: { statusNote: result.statusNote, definitionChanged: result.definitionChanged, version: result.version } });
  }),
);

workflowsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler((req, res) => {
    deleteWorkflow(req.params.id, req.auth!.workspace.id);
    ok(res, { success: true });
  }),
);

workflowsRouter.post(
  "/:id/validate",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = getWorkflowDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "workflow_not_found", "Automation not found.");
      return;
    }
    const body = z
      .object({ definition: workflowDefinitionSchema.optional(), mode: z.enum(["simulation", "live"]).default("simulation") })
      .parse(req.body ?? {});
    const definition = body.definition ?? detail.definition;
    if (!definition) {
      fail(res, 422, "no_definition", "This automation has no saved definition yet.");
      return;
    }
    const validation = validateForMode(definition, req.auth!.workspace.id, body.mode);
    ok(res, { validation, mode: body.mode, connections: detail.connections });
  }),
);

workflowsRouter.post(
  "/:id/test",
  requireAuth,
  asyncHandler((req, res) => {
    if (!limitOrFail(req, res, "workflow-test", 20)) return;
    const body = z
      .object({
        mode: z.enum(["simulation", "live"]).default("simulation"),
        input: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});
    const detail = getWorkflowDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "workflow_not_found", "Automation not found.");
      return;
    }
    if (!detail.definition) {
      fail(res, 422, "no_definition", "Save the workflow before testing it.");
      return;
    }
    const validation = validateForMode(detail.definition, req.auth!.workspace.id, body.mode);
    if (!validation.valid) {
      fail(res, 422, "workflow_invalid", "Fix these issues before testing.", validation.errors);
      return;
    }
    const execution = createExecution({
      workflowId: req.params.id,
      workspaceId: req.auth!.workspace.id,
      mode: body.mode,
      triggerSource: "test",
      executionInput: body.input,
    });
    ok(res, execution, 202);
  }),
);

workflowsRouter.post(
  "/:id/run",
  requireAuth,
  asyncHandler((req, res) => {
    if (!limitOrFail(req, res, "workflow-run", 30)) return;
    const body = z
      .object({
        mode: z.enum(["simulation", "live"]).optional(),
        input: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});
    const detail = getWorkflowDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "workflow_not_found", "Automation not found.");
      return;
    }
    if (detail.status !== "active") {
      fail(res, 409, "workflow_not_active", "Activate this automation before running it.");
      return;
    }
    const mode = body.mode ?? (detail.runMode === "live" ? "live" : "simulation");
    if (detail.definition) {
      const validation = validateForMode(detail.definition, req.auth!.workspace.id, mode);
      if (!validation.valid) {
        fail(res, 422, "workflow_invalid", "Fix these issues before running.", validation.errors);
        return;
      }
    }
    const execution = createExecution({
      workflowId: req.params.id,
      workspaceId: req.auth!.workspace.id,
      mode,
      triggerSource: "manual",
      executionInput: body.input,
      requireActive: true,
    });
    ok(res, execution, 202);
  }),
);

workflowsRouter.post(
  "/:id/activate",
  requireAuth,
  asyncHandler((req, res) => {
    const body = modeSchema.parse(req.body ?? {});
    const detail = activateWorkflow(req.params.id, req.auth!.workspace.id, body.mode);
    ok(res, detail);
  }),
);

workflowsRouter.post(
  "/:id/pause",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = pauseWorkflow(req.params.id, req.auth!.workspace.id);
    ok(res, detail);
  }),
);

workflowsRouter.post(
  "/:id/duplicate",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = duplicateWorkflow(req.params.id, req.auth!.workspace.id, req.auth!.user.id);
    ok(res, detail, 201);
  }),
);

workflowsRouter.get(
  "/:id/executions",
  requireAuth,
  asyncHandler((req, res) => {
    const { limit, offset } = parsePagination(req, 20, 100);
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const result = listExecutions(req.auth!.workspace.id, {
      workflowId: req.params.id,
      status,
      limit,
      offset,
    });
    ok(res, result);
  }),
);

workflowsRouter.get(
  "/:id/versions",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = getWorkflowDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "workflow_not_found", "Automation not found.");
      return;
    }
    const version = latestVersion(req.params.id);
    const definition = parseDefinition(version?.definition_json);
    ok(res, { version: version?.version ?? 0, nodeCount: definition?.nodes.length ?? 0, updatedAt: detail.updatedAt });
  }),
);
