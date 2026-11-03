// Server-only usage counting and plan-limit checks.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database, "public", "public", any, any>;

export interface UsageSnapshot {
  workflows: number;
  activeWorkflows: number;
  executionsThisMonth: number;
  failedExecutionsThisMonth: number;
  aiGenerationsThisMonth: number;
  limitWorkflows: number;
  limitMonthlyExecutions: number;
  limitAiGenerations: number;
}

/**
 * First moment of the current UTC month. Must stay identical to the database
 * window used by migration 0001 (`date_trunc('month', now())`, UTC) so the two
 * sides of the quota checks count the same period.
 */
export function monthStartUtc(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getUsageSnapshot(supabase: Db, workspaceId: string, planLimits: { workflows: number; monthlyExecutions: number; aiGenerations: number }): Promise<UsageSnapshot> {
  const monthStart = monthStartUtc();

  const [wfCount, activeCount, execCount, failCount, aiCount] = await Promise.all([
    supabase.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("workflows")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase
      .from("executions")
      .select("id, workflows!inner(workspace_id)", { count: "exact", head: true })
      .eq("workflows.workspace_id", workspaceId)
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("executions")
      .select("id, workflows!inner(workspace_id)", { count: "exact", head: true })
      .eq("workflows.workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("usage_records")
      .select("quantity", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("usage_type", "ai_generation")
      .gte("recorded_at", monthStart.toISOString()),
  ]);

  return {
    workflows: wfCount.count ?? 0,
    activeWorkflows: activeCount.count ?? 0,
    executionsThisMonth: execCount.count ?? 0,
    failedExecutionsThisMonth: failCount.count ?? 0,
    aiGenerationsThisMonth: aiCount.count ?? 0,
    limitWorkflows: planLimits.workflows,
    limitMonthlyExecutions: planLimits.monthlyExecutions,
    limitAiGenerations: planLimits.aiGenerations,
  };
}

export async function recordUsage(supabase: Db, workspaceId: string, usageType: string, quantity = 1) {
  // Usage rows can no longer be written as plain rows by clients (migration
  // 0001 revokes INSERT for authenticated); this trusted RPC is the single
  // writer. The generated Database type picks up `record_usage` on the next
  // `supabase gen types` run — until then a minimal structural cast keeps the
  // call site type-checked.
  const rpc = supabase as unknown as {
    rpc: (
      name: "record_usage",
      args: { _workspace_id: string; _usage_type: string; _quantity: number },
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await rpc.rpc("record_usage", {
    _workspace_id: workspaceId,
    _usage_type: usageType,
    _quantity: quantity,
  });
  if (error) console.error("usage record failed", error.message);
}
