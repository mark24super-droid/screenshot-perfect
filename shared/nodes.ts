/**
 * Central node registry shared by the client editor and the server execution
 * engine. Only node types listed here can ever be created or executed.
 * The AI is never allowed to invent node types outside of this allowlist.
 */

export type NodeKind = "trigger" | "action";
export type NodeCategory = "trigger" | "email" | "spreadsheet" | "ai" | "logic" | "utility";
export type ProviderId = "gmail" | "google_sheets" | "ai";
export type FieldType = "text" | "textarea" | "select" | "number" | "mapping";

export interface NodeFieldOption {
  value: string;
  label: string;
}

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: NodeFieldOption[];
  min?: number;
  max?: number;
  defaultValue?: string | number;
  supportsVariables?: boolean;
}

export interface NodeOutput {
  key: string;
  label: string;
  description?: string;
}

export interface NodeDefinition {
  type: string;
  title: string;
  description: string;
  kind: NodeKind;
  category: NodeCategory;
  icon: string;
  provider?: ProviderId;
  fields: NodeField[];
  outputs: NodeOutput[];
  /** True when the node can only run with deterministic simulated adapters. */
  demoOnly?: boolean;
  /** Human readable note shown in the node picker / inspector. */
  availabilityNote?: string;
  summarize: (config: Record<string, unknown>) => string;
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  email: "Email",
  spreadsheet: "Spreadsheets",
  ai: "AI Tools",
  logic: "Logic",
  utility: "Utilities",
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gmail: "Gmail",
  google_sheets: "Google Sheets",
  ai: "FlowMate AI",
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: "manual.trigger",
    title: "Manual Trigger",
    description: "Start the workflow on demand or with sample input.",
    kind: "trigger",
    category: "trigger",
    icon: "Play",
    fields: [],
    outputs: [
      { key: "triggered_at", label: "Triggered at" },
      { key: "input", label: "Manual input" },
    ],
    summarize: () => "Runs when you press Test or Run.",
  },
  {
    type: "schedule.trigger",
    title: "Schedule Trigger",
    description: "Run automatically on a recurring schedule (UTC).",
    kind: "trigger",
    category: "trigger",
    icon: "Clock",
    fields: [
      {
        key: "frequency",
        label: "Frequency",
        type: "select",
        required: true,
        defaultValue: "daily",
        options: [
          { value: "hourly", label: "Every hour" },
          { value: "daily", label: "Every day" },
          { value: "weekly", label: "Every week" },
        ],
      },
      {
        key: "time",
        label: "Time (UTC, HH:MM)",
        type: "text",
        required: true,
        defaultValue: "09:00",
        placeholder: "09:00",
        help: "Used for daily and weekly schedules. Times are stored in UTC.",
      },
      {
        key: "dayOfWeek",
        label: "Day of week",
        type: "select",
        defaultValue: "1",
        options: [
          { value: "1", label: "Monday" },
          { value: "2", label: "Tuesday" },
          { value: "3", label: "Wednesday" },
          { value: "4", label: "Thursday" },
          { value: "5", label: "Friday" },
          { value: "6", label: "Saturday" },
          { value: "0", label: "Sunday" },
        ],
      },
    ],
    outputs: [{ key: "scheduled_at", label: "Scheduled at" }],
    summarize: (c) =>
      c.frequency === "hourly"
        ? "Runs every hour (UTC)."
        : c.frequency === "weekly"
          ? `Runs weekly on day ${str(c.dayOfWeek, "1")} at ${str(c.time, "09:00")} UTC.`
          : `Runs daily at ${str(c.time, "09:00")} UTC.`,
  },
  {
    type: "gmail.new_email",
    title: "Gmail: New Email",
    description: "Use the latest matching email as the workflow trigger.",
    kind: "trigger",
    category: "email",
    icon: "Mail",
    provider: "gmail",
    availabilityNote:
      "Live mode reads the newest matching message. Continuous inbox watching is not implemented; schedule this workflow to poll.",
    fields: [
      {
        key: "query",
        label: "Gmail search query",
        type: "text",
        required: true,
        defaultValue: "is:unread",
        placeholder: "is:unread subject:invoice",
        help: "Standard Gmail search syntax, e.g. is:unread subject:invoice.",
      },
      {
        key: "label",
        label: "Only emails with label",
        type: "text",
        placeholder: "Invoices",
      },
    ],
    outputs: [
      { key: "subject", label: "Subject" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "snippet", label: "Snippet" },
      { key: "body", label: "Body" },
      { key: "received_at", label: "Received at" },
      { key: "message_id", label: "Message ID" },
    ],
    summarize: (c) => `New Gmail email matching “${str(c.query, "is:unread")}”.`,
  },
  {
    type: "gmail.send_email",
    title: "Gmail: Send Email",
    description: "Send an email from the connected Gmail account.",
    kind: "action",
    category: "email",
    icon: "Send",
    provider: "gmail",
    fields: [
      {
        key: "to",
        label: "To",
        type: "text",
        required: true,
        placeholder: "customer@example.com or {{gmail_new_email.from}}",
        supportsVariables: true,
      },
      {
        key: "subject",
        label: "Subject",
        type: "text",
        required: true,
        placeholder: "Your request was received",
        supportsVariables: true,
      },
      {
        key: "body",
        label: "Message body",
        type: "textarea",
        required: true,
        placeholder: "Hi {{ai_extract.name}}, thanks for reaching out…",
        supportsVariables: true,
      },
      {
        key: "cc",
        label: "CC (optional)",
        type: "text",
        placeholder: "team@example.com",
        supportsVariables: true,
      },
      {
        key: "bcc",
        label: "BCC (optional)",
        type: "text",
        placeholder: "archive@example.com",
        supportsVariables: true,
      },
    ],
    outputs: [
      { key: "message_id", label: "Message ID" },
      { key: "status", label: "Status" },
    ],
    summarize: (c) => `Send an email to ${str(c.to, "(recipient not set)")}.`,
  },
  {
    type: "gmail.search_emails",
    title: "Gmail: Get Recent Emails",
    description: "Read recent matching emails for summaries or reports.",
    kind: "action",
    category: "email",
    icon: "Inbox",
    provider: "gmail",
    fields: [
      {
        key: "query",
        label: "Gmail search query",
        type: "text",
        required: true,
        defaultValue: "newer_than:1d",
        placeholder: "newer_than:1d is:unread",
      },
      {
        key: "maxResults",
        label: "Maximum emails",
        type: "number",
        required: true,
        defaultValue: 10,
        min: 1,
        max: 25,
      },
    ],
    outputs: [
      { key: "messages", label: "Emails" },
      { key: "count", label: "Email count" },
      { key: "combined_text", label: "Combined text" },
    ],
    summarize: (c) => `Read up to ${str(c.maxResults, "10")} emails matching “${str(c.query, "newer_than:1d")}”.`,
  },
  {
    type: "google_sheets.new_row",
    title: "Google Sheets: New Row",
    description: "Use a new spreadsheet row as the workflow trigger.",
    kind: "trigger",
    category: "spreadsheet",
    icon: "Table2",
    provider: "google_sheets",
    demoOnly: true,
    availabilityNote:
      "New-row watching requires Google Drive push channels and is only available in simulation mode in this release.",
    fields: [
      {
        key: "spreadsheetId",
        label: "Spreadsheet ID or URL",
        type: "text",
        required: true,
        placeholder: "1AbC… or https://docs.google.com/spreadsheets/d/…",
      },
      {
        key: "sheetName",
        label: "Worksheet name",
        type: "text",
        required: true,
        placeholder: "Leads",
      },
    ],
    outputs: [
      { key: "row", label: "Row values" },
      { key: "rowIndex", label: "Row index" },
    ],
    summarize: (c) => `A new row is added to ${str(c.sheetName, "the sheet")}.`,
  },
  {
    type: "google_sheets.add_row",
    title: "Google Sheets: Add Row",
    description: "Append a row to a connected spreadsheet.",
    kind: "action",
    category: "spreadsheet",
    icon: "PlusSquare",
    provider: "google_sheets",
    fields: [
      {
        key: "spreadsheetId",
        label: "Spreadsheet ID or URL",
        type: "text",
        required: true,
        placeholder: "1AbC… or full Google Sheets URL",
      },
      {
        key: "sheetName",
        label: "Worksheet name",
        type: "text",
        required: true,
        placeholder: "Sheet1",
      },
      {
        key: "mapping",
        label: "Column → value",
        type: "mapping",
        required: true,
        help: "Values support variables such as {{ai_extract.invoice_number}}.",
        supportsVariables: true,
      },
    ],
    outputs: [
      { key: "updatedRange", label: "Updated range" },
      { key: "rowIndex", label: "Row index" },
    ],
    summarize: (c) => `Append a row to ${str(c.sheetName, "the sheet")}.`,
  },
  {
    type: "google_sheets.find_row",
    title: "Google Sheets: Find Row",
    description: "Look up a row by matching a column value.",
    kind: "action",
    category: "spreadsheet",
    icon: "Search",
    provider: "google_sheets",
    fields: [
      {
        key: "spreadsheetId",
        label: "Spreadsheet ID or URL",
        type: "text",
        required: true,
        placeholder: "1AbC… or full Google Sheets URL",
      },
      {
        key: "sheetName",
        label: "Worksheet name",
        type: "text",
        required: true,
        placeholder: "Sheet1",
      },
      {
        key: "column",
        label: "Column header",
        type: "text",
        required: true,
        placeholder: "Email",
      },
      {
        key: "value",
        label: "Value to match",
        type: "text",
        required: true,
        placeholder: "{{ai_extract.email}}",
        supportsVariables: true,
      },
    ],
    outputs: [
      { key: "found", label: "Found (true/false)" },
      { key: "row", label: "Matching row" },
      { key: "rowIndex", label: "Row index" },
    ],
    summarize: (c) => `Find a row where ${str(c.column, "column")} matches.`,
  },
  {
    type: "ai.summarize",
    title: "AI: Summarize Text",
    description: "Summarize text from an earlier step.",
    kind: "action",
    category: "ai",
    icon: "Sparkles",
    provider: "ai",
    fields: [
      {
        key: "text",
        label: "Source text",
        type: "textarea",
        required: true,
        placeholder: "{{gmail_new_email.body}}",
        supportsVariables: true,
        help: "Reference an earlier node with {{node_id.field}}.",
      },
      {
        key: "style",
        label: "Summary style",
        type: "select",
        required: true,
        defaultValue: "concise",
        options: [
          { value: "concise", label: "Concise paragraph" },
          { value: "bullets", label: "Bullet points" },
          { value: "detailed", label: "Detailed summary" },
        ],
      },
      {
        key: "maxLength",
        label: "Maximum length (characters)",
        type: "number",
        defaultValue: 600,
        min: 100,
        max: 4000,
      },
      {
        key: "outputVariable",
        label: "Output variable name",
        type: "text",
        defaultValue: "summary",
        help: "Reference later as {{this_node_id.summary}}.",
      },
    ],
    outputs: [
      { key: "summary", label: "Summary" },
      { key: "source_length", label: "Source length" },
    ],
    summarize: (c) => `Summarize text (${str(c.style, "concise")}).`,
  },
  {
    type: "ai.extract",
    title: "AI: Extract Structured Data",
    description: "Extract named fields from text into structured data.",
    kind: "action",
    category: "ai",
    icon: "Braces",
    provider: "ai",
    fields: [
      {
        key: "text",
        label: "Source text",
        type: "textarea",
        required: true,
        placeholder: "{{gmail_new_email.body}}",
        supportsVariables: true,
      },
      {
        key: "fields",
        label: "Fields to extract (comma separated)",
        type: "text",
        required: true,
        defaultValue: "name, email, company, message",
        placeholder: "invoice_number, amount, due_date",
      },
      {
        key: "outputVariable",
        label: "Output prefix",
        type: "text",
        defaultValue: "extracted",
        help: "Each field becomes available as {{node_id.field_name}}.",
      },
    ],
    outputs: [
      { key: "extracted", label: "Extracted object" },
      { key: "fields_found", label: "Fields found" },
    ],
    summarize: (c) => `Extract ${str(c.fields, "fields")}.`,
  },
  {
    type: "logic.filter",
    title: "Filter / Condition",
    description: "Continue only when a condition is true.",
    kind: "action",
    category: "logic",
    icon: "Filter",
    fields: [
      {
        key: "left",
        label: "Value",
        type: "text",
        required: true,
        placeholder: "{{ai_extract.amount}}",
        supportsVariables: true,
      },
      {
        key: "operator",
        label: "Operator",
        type: "select",
        required: true,
        defaultValue: "exists",
        options: [
          { value: "exists", label: "exists and is not empty" },
          { value: "equals", label: "equals" },
          { value: "not_equals", label: "does not equal" },
          { value: "contains", label: "contains" },
          { value: "greater_than", label: "is greater than" },
          { value: "less_than", label: "is less than" },
        ],
      },
      {
        key: "right",
        label: "Compare to",
        type: "text",
        placeholder: "1000",
        supportsVariables: true,
      },
    ],
    outputs: [
      { key: "passed", label: "Passed (true/false)" },
      { key: "value", label: "Checked value" },
    ],
    summarize: (c) => `Continue when value ${str(c.operator, "exists")} ${str(c.right, "")}`.trim(),
  },
  {
    type: "utility.delay",
    title: "Delay",
    description: "Wait briefly before the next step (max 60 seconds).",
    kind: "action",
    category: "utility",
    icon: "Timer",
    fields: [
      {
        key: "seconds",
        label: "Seconds",
        type: "number",
        required: true,
        defaultValue: 5,
        min: 1,
        max: 60,
      },
    ],
    outputs: [{ key: "waited_ms", label: "Waited (ms)" }],
    summarize: (c) => `Wait ${str(c.seconds, "5")} seconds.`,
  },
];

export const NODE_TYPES = NODE_DEFINITIONS.map((d) => d.type);

const REGISTRY = new Map(NODE_DEFINITIONS.map((d) => [d.type, d]));

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return REGISTRY.get(type);
}

export function isSupportedNodeType(type: string): boolean {
  return REGISTRY.has(type);
}

export function isTriggerType(type: string): boolean {
  return REGISTRY.get(type)?.kind === "trigger";
}

export function defaultConfigFor(type: string): Record<string, unknown> {
  const def = REGISTRY.get(type);
  if (!def) return {};
  const config: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.defaultValue !== undefined) config[field.key] = field.defaultValue;
    else if (field.type === "mapping") config[field.key] = [{ column: "", value: "" }];
  }
  return config;
}

export function providerForNode(type: string): ProviderId | undefined {
  return REGISTRY.get(type)?.provider;
}

export function requiredIntegrationsForTypes(types: string[]): ProviderId[] {
  const set = new Set<ProviderId>();
  for (const t of types) {
    const p = providerForNode(t);
    if (p) set.add(p);
  }
  return [...set];
}

export function nodeSummary(type: string, config: Record<string, unknown>): string {
  const def = REGISTRY.get(type);
  if (!def) return "Unknown step";
  try {
    return def.summarize(config || {});
  } catch {
    return def.description;
  }
}

/** Available output keys for variable autocomplete. */
export function nodeOutputKeys(type: string): string[] {
  const def = REGISTRY.get(type);
  if (!def) return [];
  const keys = def.outputs.map((o) => o.key);
  if (type === "ai.extract") {
    keys.push("name", "email", "company", "message", "invoice_number", "amount", "due_date", "date");
  }
  return keys;
}
