import { get, monthBounds } from "../db";
import { planById, type UsageSnapshot } from "@shared/plans";
import { AppError } from "../lib/errors";

export function workspacePlan(workspaceId: string) {
  const row = get<{ plan: string }>("SELECT plan FROM workspaces WHERE id = ?", workspaceId);
  return planById(row?.plan);
}

export function getUsage(workspaceId: string): UsageSnapshot {
  const plan = workspacePlan(workspaceId);
  const { start, end } = monthBounds();
  const workflows = get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id = ?", workspaceId)?.c ?? 0;
  const executions =
    get<{ c: number }>(
      "SELECT COUNT(*) as c FROM executions WHERE workspace_id = ? AND created_at >= ? AND created_at < ?",
      workspaceId,
      start,
      end,
    )?.c ?? 0;
  const aiGenerations =
    get<{ c: number }>(
      "SELECT COUNT(*) as c FROM ai_generations WHERE workspace_id = ? AND created_at >= ? AND created_at < ?",
      workspaceId,
      start,
      end,
    )?.c ?? 0;
  const connections =
    get<{ c: number }>(
      "SELECT COUNT(*) as c FROM integration_connections WHERE workspace_id = ? AND status IN ('connected','demo','error')",
      workspaceId,
    )?.c ?? 0;

  return {
    plan,
    workflows: { used: workflows, limit: plan.limits.workflows },
    executions: { used: executions, limit: plan.limits.executionsPerMonth },
    aiGenerations: { used: aiGenerations, limit: plan.limits.aiGenerationsPerMonth },
    connections: { used: connections, limit: plan.limits.connections },
    periodStart: start,
    periodEnd: end,
    historyDays: plan.limits.historyDays,
  };
}

export function assertWorkflowLimit(workspaceId: string): void {
  const usage = getUsage(workspaceId);
  if (usage.workflows.used >= usage.workflows.limit) {
    throw new AppError(
      "usage_limit_reached",
      `Your ${usage.plan.name} plan allows ${usage.workflows.limit} saved automations. Delete an automation or switch plans in Billing.`,
      { status: 429 },
    );
  }
}

export function assertExecutionLimit(workspaceId: string): void {
  const usage = getUsage(workspaceId);
  if (usage.executions.used >= usage.executions.limit) {
    throw new AppError(
      "usage_limit_reached",
      `You have reached the ${usage.plan.name} plan limit of ${usage.executions.limit} executions this month. Usage resets on ${new Date(usage.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.`,
      { status: 429 },
    );
  }
}

export function assertAiLimit(workspaceId: string): void {
  const usage = getUsage(workspaceId);
  if (usage.aiGenerations.used >= usage.aiGenerations.limit) {
    throw new AppError(
      "usage_limit_reached",
      `You have used all ${usage.aiGenerations.limit} AI workflow generations included in the ${usage.plan.name} plan this month. You can still build manually or switch plans.`,
      { status: 429 },
    );
  }
}
