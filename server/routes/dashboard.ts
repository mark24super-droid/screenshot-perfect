import { Router } from "express";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { all, get } from "../db";
import { monthBounds } from "../db";
import { listWorkflows } from "../services/workflows";
import { listExecutions } from "../services/executions";
import { getUsage } from "../services/usage";
import { connectionSummary } from "../services/google";
import { isAiConfigured } from "../config";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  requireAuth,
  asyncHandler((req, res) => {
    const { workspace, user } = req.auth!;
    const { start, end } = monthBounds();

    const totalAutomations = get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id = ?", workspace.id)?.c ?? 0;
    const activeAutomations =
      get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id = ? AND status = 'active'", workspace.id)?.c ?? 0;
    const executionsThisMonth =
      get<{ c: number }>(
        "SELECT COUNT(*) as c FROM executions WHERE workspace_id = ? AND created_at >= ? AND created_at < ?",
        workspace.id,
        start,
        end,
      )?.c ?? 0;
    const failedExecutions =
      get<{ c: number }>(
        "SELECT COUNT(*) as c FROM executions WHERE workspace_id = ? AND status = 'failed' AND created_at >= ? AND created_at < ?",
        workspace.id,
        start,
        end,
      )?.c ?? 0;

    const recentAutomations = listWorkflows(workspace.id).slice(0, 5);
    const activity = listExecutions(workspace.id, { limit: 6, offset: 0 });

    const integrations = [
      connectionSummary(workspace.id, "gmail"),
      connectionSummary(workspace.id, "google_sheets"),
    ];

    const pendingApproval = all<{ id: string; name: string }>(
      "SELECT id, name FROM workflows WHERE workspace_id = ? AND status IN ('draft','needs_configuration') ORDER BY updated_at DESC LIMIT 3",
      workspace.id,
    );

    ok(res, {
      stats: {
        totalAutomations,
        activeAutomations,
        executionsThisMonth,
        failedExecutions,
      },
      recentAutomations,
      recentActivity: activity.items,
      integrations,
      usage: getUsage(workspace.id),
      demoMode: workspace.isDemo,
      aiProviderConfigured: isAiConfigured(),
      onboardingCompleted: user.settings.onboardingCompleted,
      pendingApproval,
    });
  }),
);

dashboardRouter.get(
  "/recent-activity",
  requireAuth,
  asyncHandler((req, res) => {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
    const result = listExecutions(req.auth!.workspace.id, { limit, offset: 0 });
    ok(res, result);
  }),
);
