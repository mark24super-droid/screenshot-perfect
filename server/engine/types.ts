import type { WorkflowNode } from "@shared/workflow";

export interface HandlerContext {
  mode: "simulation" | "live";
  workspaceId: string;
  workflowId: string;
  executionId: string;
  node: WorkflowNode;
  /** Node config with {{variables}} already resolved. */
  config: Record<string, unknown>;
  /** Raw config as saved (for mapping shape when needed). */
  rawConfig: Record<string, unknown>;
  context: Record<string, Record<string, unknown>>;
  triggerSource: string;
  executionInput: unknown;
  log: (message: string, data?: Record<string, unknown>) => void;
}

export type NodeHandler = (ctx: HandlerContext) => Promise<Record<string, unknown>>;

export const SAMPLE_MANUAL_INPUT = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  company: "Brightside Co.",
  message:
    "Hi, I'm Jordan from Brightside Co. We received invoice INV-2043 for $1,280.00 due 2026-11-15 and need help automating the intake. My email is jordan@example.com.",
  text: "Invoice INV-2043 from Northwind Traders for $1,280.00 is due on 2026-11-15. Contact billing@northwind.example with questions.",
};

export const SAMPLE_EMAIL = {
  subject: "Invoice INV-2043 from Northwind Traders",
  from: "billing@northwind.example",
  to: "you@example.com",
  snippet: "Please find invoice INV-2043 for $1,280.00 due 2026-11-15.",
  body: "Hi,\n\nPlease find invoice INV-2043 from Northwind Traders for $1,280.00, due 2026-11-15. Let us know if you need anything else.\n\nThanks,\nNorthwind billing",
  received_at: new Date("2026-10-30T09:12:00.000Z").toISOString(),
  message_id: "demo-msg-2043",
};

export const SAMPLE_EMAILS = [
  {
    subject: "Invoice question from Northwind",
    from: "billing@northwind.example",
    snippet: "Could you confirm the amount on invoice INV-2043?",
  },
  {
    subject: "Meeting follow-up",
    from: "sam@example.com",
    snippet: "Thanks for the call — I'll send the revised brief tomorrow.",
  },
  {
    subject: "Product newsletter",
    from: "news@example.com",
    snippet: "This week: new templates and a faster editor.",
  },
];
