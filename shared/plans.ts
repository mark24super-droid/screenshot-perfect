/**
 * Central plan configuration. Adjust limits here (or through the values below)
 * without touching billing or dashboard code. No plan promises unlimited usage.
 */
export type PlanId = "free" | "pro" | "business";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  limits: {
    workflows: number;
    executionsPerMonth: number;
    aiGenerationsPerMonth: number;
    historyDays: number;
    connections: number;
  };
  features: string[];
  highlighted?: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For trying your first automation.",
    priceMonthlyUsd: 0,
    limits: {
      workflows: 3,
      executionsPerMonth: 100,
      aiGenerationsPerMonth: 20,
      historyDays: 7,
      connections: 2,
    },
    features: [
      "3 saved automations",
      "100 executions per month",
      "20 AI workflow generations per month",
      "Gmail and Google Sheets integrations",
      "7 days of execution history",
      "Simulation mode with sample data",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For freelancers and small teams running daily automations.",
    priceMonthlyUsd: 19,
    limits: {
      workflows: 25,
      executionsPerMonth: 2500,
      aiGenerationsPerMonth: 300,
      historyDays: 90,
      connections: 5,
    },
    features: [
      "25 saved automations",
      "2,500 executions per month",
      "300 AI workflow generations per month",
      "90 days of execution history",
      "Node-level execution logs",
      "Priority validation feedback",
    ],
    highlighted: true,
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For growing teams with shared workspaces.",
    priceMonthlyUsd: 49,
    limits: {
      workflows: 100,
      executionsPerMonth: 15000,
      aiGenerationsPerMonth: 1500,
      historyDays: 365,
      connections: 10,
    },
    features: [
      "100 saved automations",
      "15,000 executions per month",
      "1,500 AI workflow generations per month",
      "365 days of execution history",
      "Shared workspace foundations",
      "Priority support is not yet offered",
    ],
  },
};

export const PLAN_LIST = [PLANS.free, PLANS.pro, PLANS.business];

export function planById(id: string | null | undefined): PlanDefinition {
  if (id === "pro" || id === "business" || id === "free") return PLANS[id];
  return PLANS.free;
}

export interface UsageSnapshot {
  plan: PlanDefinition;
  workflows: { used: number; limit: number };
  executions: { used: number; limit: number };
  aiGenerations: { used: number; limit: number };
  connections: { used: number; limit: number };
  periodStart: string;
  periodEnd: string;
  historyDays: number;
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}
