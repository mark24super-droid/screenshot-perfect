export interface PlanDefinition {
  id: "free" | "pro" | "business";
  name: string;
  priceLabel: string;
  tagline: string;
  limits: {
    workflows: number;
    monthlyExecutions: number;
    aiGenerations: number;
    integrations: number;
  };
  features: string[];
}

/**
 * Central, configurable plan limits. No unlimited promises: every number is a
 * hard cap the app checks before running workflows or generating with AI.
 * Adjust values here to change pricing-page copy and enforcement together.
 */
export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    tagline: "Try automation with real limits, not fake demos.",
    limits: { workflows: 3, monthlyExecutions: 50, aiGenerations: 25, integrations: 2 },
    features: [
      "3 saved workflows",
      "50 workflow executions per month",
      "25 AI workflow generations per month",
      "Gmail and Google Sheets integrations",
      "Simulation mode and execution history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$19",
    tagline: "For freelancers and small teams running automations daily.",
    limits: { workflows: 25, monthlyExecutions: 1000, aiGenerations: 300, integrations: 5 },
    features: [
      "25 saved workflows",
      "1,000 workflow executions per month",
      "300 AI workflow generations per month",
      "Advanced execution history",
      "Everything in Free",
    ],
  },
  {
    id: "business",
    name: "Business",
    priceLabel: "$49",
    tagline: "Higher limits for growing teams. Contact us for details.",
    limits: { workflows: 100, monthlyExecutions: 10000, aiGenerations: 2000, integrations: 10 },
    features: [
      "100 saved workflows",
      "10,000 workflow executions per month",
      "2,000 AI workflow generations per month",
      "Shared workspaces",
      "Everything in Pro",
    ],
  },
];

export const DEFAULT_PLAN: PlanDefinition = PLANS[0];

export function getPlan(id: string | null | undefined): PlanDefinition {
  return PLANS.find((p) => p.id === id) ?? DEFAULT_PLAN;
}
