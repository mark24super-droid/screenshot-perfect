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

export async function getUsageSnapshot(supabase: Db, workspaceId: string, planLimits: { workflows: number; monthlyExecutions: number; aiGenerations: number }): Promise<UsageSnapshot> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [wfCount, execCount, failCount, aiCount] = await Promise.all([
    supabase.from("workflows").select("id, status", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("executions")
      .select("id", { count: "exact", head: true })
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("executions")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("usage_records")
      .select("quantity", { count: "exact", head: true })
      .eq("usage_type", "ai_generation")
      .gte("recorded_at", monthStart.toISOString()),
  ]);

  return {
    workflows: wfCount.count ?? 0,
    activeWorkflows: 0,
    executionsThisMonth: execCount.count ?? 0,
    failedExecutionsThisMonth: failCount.count ?? 0,
    aiGenerationsThisMonth: aiCount.count ?? 0,
    limitWorkflows: planLimits.workflows,
    limitMonthlyExecutions: planLimits.monthlyExecutions,
    limitAiGenerations: planLimits.aiGenerations,
  };
}

export async function recordUsage(supabase: Db, workspaceId: string, usageType: string, quantity = 1) {
  const { error } = await supabase.from("usage_records").insert({ workspace_id: workspaceId, usage_type: usageType, quantity });
  if (error) console.error("usage record failed", error.message);
}
