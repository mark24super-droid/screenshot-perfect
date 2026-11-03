import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/plans";
import { monthStartUtc } from "@/lib/usage.server";

// Migration 0001 seeds the plan_limits table that database-level quota
// policies read. If TypeScript limits change without re-seeding (or vice
// versa), the app and the database would enforce two different limits.
// This test keeps the two sources honest.
describe("plan limits sync between app and database", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0001_plan_limits_and_usage_integrity.sql"),
    "utf8",
  );

  /** Extracts the seeded limits from `insert into public.plan_limits ...` lines. */
  function seeded(planId: string): { workflows: number; monthlyExecutions: number; aiGenerations: number } | null {
    const m = sql.match(new RegExp(`\\('${planId}', (\\d+), (\\d+), (\\d+)\\)`));
    if (!m) return null;
    return {
      workflows: Number(m[1]),
      monthlyExecutions: Number(m[2]),
      aiGenerations: Number(m[3]),
    };
  }

  it("every app plan has a seeded database row", () => {
    for (const plan of PLANS) {
      expect(seeded(plan.id), `plan_limits row for '${plan.id}'`).toEqual({
        workflows: plan.limits.workflows,
        monthlyExecutions: plan.limits.monthlyExecutions,
        aiGenerations: plan.limits.aiGenerations,
      });
    }
  });

  it("does not seed plans that the app does not know", () => {
    expect(sql.match(/\('(free|pro|business)', \d+, \d+, \d+\)/g)).toHaveLength(PLANS.length);
  });

  it("blocks client writes on the integrity-related columns and tables", () => {
    // usage records cannot be forged
    expect(sql).toContain("revoke insert on public.usage_records from authenticated;");
    // counting columns cannot be tampered with
    expect(sql).toContain("revoke update (workflow_id, workflow_version_id, started_at) on public.executions from authenticated;");
    expect(sql).toContain("revoke update (workspace_id) on public.workflows from authenticated;");
    // the plan column cannot be self-upgraded
    expect(sql).toContain("revoke insert (plan_id) on public.workspaces from authenticated;");
    expect(sql).toContain("revoke update (plan_id) on public.workspaces from authenticated;");
  });

  it("adds quota policies without touching existing RLS isolation rules", () => {
    expect(sql).toContain("create policy \"workflows count against plan\"");
    expect(sql).toContain("create policy \"executions count against plan\"");
    expect(sql).not.toMatch(/disable row level security/);
    expect(sql).not.toMatch(/force row level security off/i);
  });
});
