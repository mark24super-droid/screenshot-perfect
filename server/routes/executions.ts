import { Router } from "express";
import { asyncHandler, fail, ok, parsePagination } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { cancelExecution, getExecutionDetail, listExecutions, retryExecution } from "../services/executions";

export const executionsRouter = Router();

executionsRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const { limit, offset } = parsePagination(req, 20, 100);
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const workflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const mode = typeof req.query.mode === "string" ? req.query.mode : undefined;
    const result = listExecutions(req.auth!.workspace.id, { status, workflowId, from, to, mode, limit, offset });
    ok(res, result);
  }),
);

executionsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = getExecutionDetail(req.params.id, req.auth!.workspace.id);
    if (!detail) {
      fail(res, 404, "execution_not_found", "Execution not found.");
      return;
    }
    ok(res, detail);
  }),
);

executionsRouter.post(
  "/:id/retry",
  requireAuth,
  asyncHandler((req, res) => {
    const result = retryExecution(req.params.id, req.auth!.workspace.id);
    ok(res, result, 202);
  }),
);

executionsRouter.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler((req, res) => {
    const detail = cancelExecution(req.params.id, req.auth!.workspace.id);
    ok(res, detail);
  }),
);
