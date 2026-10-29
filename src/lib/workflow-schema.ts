import { z } from "zod";

/**
 * Workflow definitions are structured data only — never executable code.
 * Node types come from a fixed allowlist; the AI generator can only emit
 * these types and this shape.
 */

export const NODE_TYPES = [
  "manual.trigger",
  "schedule.trigger",
  "gmail.new_email",
  "gmail.send_email",
  "google_sheets.new_row",
  "google_sheets.add_row",
  "google_sheets.find_row",
  "ai.summarize",
  "ai.extract",
  "logic.filter",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const nodeTypeSchema = z.enum(NODE_TYPES);

export const nodeConfigSchema = z.record(z.string(), z.unknown());

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/, "Node ids may contain letters, numbers and underscores only"),
  type: nodeTypeSchema,
  config: nodeConfigSchema.default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(96),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1).max(25),
  edges: z.array(workflowEdgeSchema).max(40).default([]),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number().min(0.1).max(3) })
    .default({ x: 0, y: 0, zoom: 1 }),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export function isTriggerType(type: NodeType): boolean {
  return type.endsWith(".trigger");
}

export function nodeProvider(type: NodeType): "flowmate" | "google_mail" | "google_sheets" {
  if (type.startsWith("gmail.")) return "google_mail";
  if (type.startsWith("google_sheets.")) return "google_sheets";
  return "flowmate";
}

export function requiredIntegrationForNode(type: NodeType): "google_mail" | "google_sheets" | null {
  const provider = nodeProvider(type);
  return provider === "flowmate" ? null : provider;
}

/** Variable reference syntax: {{node_id.field}} */
export function parseVariableRefs(value: unknown): { nodeId: string; field: string }[] {
  const refs: { nodeId: string; field: string }[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\}\}/g)) {
        refs.push({ nodeId: m[1], field: m[2] });
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return refs;
}

/** Output fields each node type can produce, used to validate variable references. */
export const NODE_OUTPUT_FIELDS: Record<NodeType, (field: string) => boolean> = {
  "manual.trigger": (f) => ["text", "sample"].includes(f) || true,
  "schedule.trigger": () => true,
  "gmail.new_email": (f) => ["subject", "from", "body", "date", "snippet"].includes(f),
  "gmail.send_email": (f) => ["message_id", "sent"].includes(f),
  "google_sheets.new_row": (f) => f === "row" || f === "row_number",
  "google_sheets.add_row": (f) => f === "row_number",
  "google_sheets.find_row": (f) => f === "row" || f === "found",
  "ai.summarize": (f) => f === "summary",
  "ai.extract": (f) => f === "data" || /^[a-zA-Z0-9_]+$/.test(f),
  "logic.filter": (f) => f === "passed" || f === "value",
};

export interface ValidationIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
}

export interface ValidateOptions {
  connectedIntegrations?: ("google_mail" | "google_sheets")[];
}

/**
 * Full structural + configuration validation. Errors block activation and
 * live test runs; warnings only inform.
 */
export function validateWorkflow(
  definition: WorkflowDefinition,
  options: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, edges } = definition;

  if (nodes.length === 0) {
    issues.push({ level: "error", message: "Add at least one node to this workflow." });
    return issues;
  }

  const triggers = nodes.filter((n) => isTriggerType(n.type));
  if (triggers.length === 0) {
    issues.push({ level: "error", message: "Add a trigger node — workflows need a way to start." });
  }
  if (triggers.length > 1) {
    for (const t of triggers.slice(1)) {
      issues.push({ level: "error", nodeId: t.id, message: "Only one trigger is supported per workflow. Remove this trigger." });
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  if (nodeIds.size !== nodes.length) {
    issues.push({ level: "error", message: "Two nodes share the same id. Re-add one of the duplicated nodes." });
  }

  // Edges reference existing nodes; no self loops.
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({ level: "error", message: `A connection starts from a deleted node (${edge.source}).` });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({ level: "error", message: `A connection points at a deleted node (${edge.target}).` });
    }
    if (edge.source === edge.target) {
      issues.push({ level: "error", nodeId: edge.source, message: "A node is connected to itself. Remove that connection." });
    }
  }

  // Cycle detection via DFS.
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]): boolean => {
    const s = state.get(id);
    if (s === 2) return false;
    if (s === 1) {
      issues.push({ level: "error", nodeId: id, message: "This workflow contains a loop. Remove the connection that creates it." });
      return true;
    }
    state.set(id, 1);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next, [...path, id])) return true;
    }
    state.set(id, 2);
    return false;
  };
  for (const n of nodes) visit(n.id, []);

  // Reachability from trigger.
  if (triggers.length === 1) {
    const reachable = new Set<string>();
    const stack = [triggers[0].id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      for (const next of adjacency.get(cur) ?? []) stack.push(next);
    }
    for (const n of nodes) {
      if (!reachable.has(n.id)) {
        issues.push({ level: "warning", nodeId: n.id, message: "This node is not connected to the trigger, so it will not run." });
      }
    }
  }

  // Per-node required fields + variable references.
  for (const node of nodes) {
    const spec = NODE_SPECS[node.type];
    if (!spec) {
      issues.push({ level: "error", nodeId: node.id, message: `Unsupported node type: ${node.type}.` });
      continue;
    }
    for (const field of spec.requiredFields ?? []) {
      const v = node.config[field.key];
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `${spec.label} is missing a value for “${field.label}”.`,
        });
      }
    }
    if (node.type === "ai.extract") {
      const fields = node.config.fields;
      if (!Array.isArray(fields) || fields.length === 0) {
        issues.push({ level: "error", nodeId: node.id, message: "AI Extract needs at least one field to extract." });
      } else if (fields.some((f) => typeof f !== "string" || !/^[a-zA-Z0-9_]+$/.test(f))) {
        issues.push({ level: "error", nodeId: node.id, message: "Extract field names may contain letters, numbers and underscores only." });
      }
    }
    for (const ref of parseVariableRefs(node.config)) {
      if (!nodeIds.has(ref.nodeId)) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `${spec.label} uses {{${ref.nodeId}.${ref.field}}} but there is no node with that id.`,
        });
      } else {
        const producer = nodes.find((n) => n.id === ref.nodeId)!;
        if (!isTriggerType(producer.type) && producer.id === node.id) {
          issues.push({ level: "error", nodeId: node.id, message: "A node cannot reference its own output." });
        } else if (!NODE_OUTPUT_FIELDS[producer.type]?.(ref.field)) {
          issues.push({
            level: "warning",
            nodeId: node.id,
            message: `${spec.label} references {{${ref.nodeId}.${ref.field}}}, which that node may not produce. Double-check the field name.`,
          });
        }
      }
    }
    // Integration connectivity.
    const integration = requiredIntegrationForNode(node.type);
    if (integration && options.connectedIntegrations && !options.connectedIntegrations.includes(integration)) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: `${spec.label} needs the ${INTEGRATION_LABELS[integration]} integration, which is not connected yet.`,
      });
    }
  }

  return issues;
}

export const INTEGRATION_LABELS: Record<"google_mail" | "google_sheets", string> = {
  google_mail: "Gmail",
  google_sheets: "Google Sheets",
};

export function integrationForWorkflow(definition: WorkflowDefinition): ("google_mail" | "google_sheets")[] {
  const set = new Set<("google_mail" | "google_sheets")>();
  for (const node of definition.nodes) {
    const i = requiredIntegrationForNode(node.type);
    if (i) set.add(i);
  }
  return [...set];
}

/** Resolve {{node.field}} references against collected outputs. Returns null when unresolvable. */
export function resolveTemplate(value: unknown, outputs: Record<string, Record<string, unknown>>): unknown {
  if (typeof value === "string") {
    const full = value.match(/^\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\}\}$/);
    if (full) {
      const v = outputs[full[1]]?.[full[2]];
      return v ?? "";
    }
    return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, id, field) => {
      const v = outputs[id]?.[field];
      if (v === undefined || v === null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplate(v, outputs));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplate(v, outputs);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Node metadata registry (client-safe): labels, categories, config fields.
// ---------------------------------------------------------------------------

export type ConfigFieldType = "text" | "textarea" | "select" | "fields" | "mapping" | "number";

export interface ConfigFieldSpec {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  help?: string;
}

export type NodeCategory = "triggers" | "email" | "spreadsheets" | "ai" | "logic" | "utilities";

export interface NodeSpec {
  type: NodeType;
  label: string;
  short: string;
  category: NodeCategory;
  kind: "trigger" | "action";
  requiredFields?: ConfigFieldSpec[];
  fields?: ConfigFieldSpec[];
}

export const NODE_SPECS: Record<NodeType, NodeSpec> = {
  "manual.trigger": {
    type: "manual.trigger",
    label: "Manual Trigger",
    short: "Start this workflow on demand with sample data.",
    category: "triggers",
    kind: "trigger",
    fields: [
      { key: "sampleInput", label: "Sample input", type: "textarea", placeholder: '{"text": "hello"}', help: "JSON passed to the workflow when it runs manually." },
    ],
  },
  "schedule.trigger": {
    type: "schedule.trigger",
    label: "Schedule Trigger",
    short: "Runs on demand for now — scheduled background runs are coming.",
    category: "triggers",
    kind: "trigger",
    fields: [
      { key: "interval", label: "Interval", type: "select", options: ["daily", "hourly", "weekly"] },
    ],
  },
  "gmail.new_email": {
    type: "gmail.new_email",
    label: "Gmail: New Email",
    short: "Picks up an email and exposes its subject, sender and body.",
    category: "email",
    kind: "trigger",
    fields: [{ key: "filter", label: "Search filter", type: "text", placeholder: "e.g. has:attachment" }],
  },
  "gmail.send_email": {
    type: "gmail.send_email",
    label: "Gmail: Send Email",
    short: "Sends an email from your connected Gmail account.",
    category: "email",
    kind: "action",
    requiredFields: [
      { key: "to", label: "Recipient", type: "text", required: true, placeholder: "name@example.com" },
      { key: "subject", label: "Subject", type: "text", required: true },
    ],
    fields: [
      { key: "to", label: "Recipient", type: "text", required: true, placeholder: "name@example.com", help: "Supports variables like {{trigger_1.email}}" },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "body", label: "Message", type: "textarea", required: true },
    ],
  },
  "google_sheets.new_row": {
    type: "google_sheets.new_row",
    label: "Google Sheets: New Row",
    short: "Watches a spreadsheet and exposes newly added rows.",
    category: "spreadsheets",
    kind: "trigger",
    requiredFields: [{ key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true }],
    fields: [{ key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true }],
  },
  "google_sheets.add_row": {
    type: "google_sheets.add_row",
    label: "Google Sheets: Add Row",
    short: "Appends a row with mapped values to a spreadsheet.",
    category: "spreadsheets",
    kind: "action",
    requiredFields: [{ key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true }],
    fields: [
      { key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true },
      { key: "worksheet", label: "Worksheet", type: "text", placeholder: "Sheet1" },
      { key: "row", label: "Column values", type: "mapping", help: "Map column names to values or variables like {{extract_1.sender}}" },
    ],
  },
  "google_sheets.find_row": {
    type: "google_sheets.find_row",
    label: "Google Sheets: Find Row",
    short: "Looks up a row by column value.",
    category: "spreadsheets",
    kind: "action",
    requiredFields: [
      { key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true },
      { key: "column", label: "Column", type: "text", required: true },
      { key: "value", label: "Value", type: "text", required: true },
    ],
    fields: [
      { key: "spreadsheet", label: "Spreadsheet name", type: "text", required: true },
      { key: "worksheet", label: "Worksheet", type: "text", placeholder: "Sheet1" },
      { key: "column", label: "Column", type: "text", required: true },
      { key: "value", label: "Value", type: "text", required: true },
    ],
  },
  "ai.summarize": {
    type: "ai.summarize",
    label: "AI: Summarize Text",
    short: "Condenses text into a short summary.",
    category: "ai",
    kind: "action",
    requiredFields: [{ key: "source", label: "Source text", type: "textarea", required: true }],
    fields: [
      { key: "source", label: "Source text", type: "textarea", required: true, help: "e.g. {{gmail_new.body}} or plain text" },
      { key: "style", label: "Style", type: "select", options: ["paragraph", "bullet-points"] },
      { key: "maxLength", label: "Max words", type: "number" },
      { key: "outputVariable", label: "Output variable name", type: "text", placeholder: "summary" },
    ],
  },
  "ai.extract": {
    type: "ai.extract",
    label: "AI: Extract Structured Data",
    short: "Pulls structured fields out of text.",
    category: "ai",
    kind: "action",
    requiredFields: [{ key: "source", label: "Source text", type: "textarea", required: true }],
    fields: [
      { key: "source", label: "Source text", type: "textarea", required: true },
      { key: "fields", label: "Fields to extract", type: "fields", help: "Add field names like invoice_number, amount" },
    ],
  },
  "logic.filter": {
    type: "logic.filter",
    label: "Filter / Condition",
    short: "Stops the workflow unless a condition holds.",
    category: "logic",
    kind: "action",
    requiredFields: [
      { key: "field", label: "Field", type: "text", required: true },
      { key: "value", label: "Compare with", type: "text", required: true },
    ],
    fields: [
      { key: "field", label: "Field", type: "text", required: true, help: "e.g. {{trigger_1.email}}" },
      { key: "operator", label: "Operator", type: "select", options: ["contains", "equals", "not_empty", "greater_than", "less_than"] },
      { key: "value", label: "Compare with", type: "text", required: true },
    ],
  },
};

export const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  triggers: "Triggers",
  email: "Email",
  spreadsheets: "Spreadsheets",
  ai: "AI Tools",
  logic: "Logic",
  utilities: "Utilities",
};

export function categoryNodeTypes(category: NodeCategory): NodeType[] {
  return NODE_TYPES.filter((t) => NODE_SPECS[t].category === category);
}

/** Layout nodes in a simple top-down chain when no positions exist. */
export function autoLayout(definition: WorkflowDefinition): WorkflowDefinition {
  const { nodes, edges } = definition;
  const triggers = nodes.filter((n) => isTriggerType(n.type));
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);

  const depth = new Map<string, number>();
  const visit = (id: string, d: number, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    const cur = depth.get(id) ?? 0;
    if (d > cur) depth.set(id, d);
    for (const next of adjacency.get(id) ?? []) visit(next, d + 1, seen);
  };
  for (const t of triggers.length ? triggers : nodes.slice(0, 1)) visit(t.id, 0, new Set());

  const byDepth = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), n.id]);
  }
  const positioned = nodes.map((n) => {
    if (n.position) return n;
    const d = depth.get(n.id) ?? 0;
    const column = (byDepth.get(d) ?? []).indexOf(n.id);
    return { ...n, position: { x: 420 * d, y: 140 * column + 80 } };
  });
  return { ...definition, nodes: positioned };
}
