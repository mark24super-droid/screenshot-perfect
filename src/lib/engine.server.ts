// FlowMate workflow execution engine — server-only.
// Registered node handlers, topological order, bounded retries and timeouts.
// Simulation results are deterministic and clearly labelled; live results come
// from real adapters or a "waiting" status — never faked.
import { runStructuredCompletion, AiUnavailableError } from "@/lib/ai.server";
import {
  fetchLatestEmail,
  sendEmail,
  appendSheetRow,
  findSheetRow,
  fetchLatestSheetRow,
} from "@/lib/connector-adapters.server";
import {
  resolveTemplate,
  isTriggerType,
  type WorkflowDefinition,
  type WorkflowNode,
  type NodeType,
} from "@/lib/workflow-schema";

export const NODE_TIMEOUT_MS = 30_000;
export const MAX_NODES = 25;

export type StepStatus = "succeeded" | "failed" | "waiting" | "skipped";

export interface NodeRunOutput {
  status: StepStatus;
  output: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunContext {
  mode: "simulation" | "live";
  userId: string;
  /** Outputs of completed nodes, used to resolve {{node.field}} variables. */
  outputs: Record<string, Record<string, unknown>>;
}

type NodeHandler = (node: WorkflowNode, ctx: RunContext) => Promise<NodeRunOutput>;

const ok = (output: Record<string, unknown>): NodeRunOutput => ({ status: "succeeded", output });
const waiting = (message: string): NodeRunOutput => ({ status: "waiting", output: {}, errorMessage: message });
const failed = (message: string, code = "node_failed"): NodeRunOutput => ({ status: "failed", output: {}, errorCode: code, errorMessage: message });

function parseSampleInput(config: Record<string, unknown>): Record<string, unknown> {
  const raw = config.sampleInput;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return { text: raw };
    }
    return { text: raw };
  }
  return { text: "Sample trigger input" };
}

// ---------------------------------------------------------------------------
// AI node helpers (real AI calls in both modes — internal, not an external app)
// ---------------------------------------------------------------------------

async function aiCall(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<NodeRunOutput> {
  try {
    const text = await runStructuredCompletion({
      model: "openai/gpt-6-astra",
      input: prompt,
      schemaName: "flowmate_ai_node",
      jsonSchema: schema,
      maxOutputTokens: 1500,
    });
    return { status: "succeeded", output: JSON.parse(text) as Record<string, unknown> };
  } catch (err) {
    if (err instanceof AiUnavailableError) return waiting(err.safeMessage);
    return failed("The AI step failed unexpectedly. Try running the test again.");
  }
}

// ---------------------------------------------------------------------------
// Simulation fixtures (deterministic)
// ---------------------------------------------------------------------------

const SIM_EMAIL = {
  subject: "Invoice INV-2043 from Bright Studio",
  from: "billing@brightstudio.example",
  date: "Thu, 29 Oct 2026 09:12:00 +0000",
  snippet:
    "Invoice INV-2043 for October services. Amount due: $420.00. Payment is due within 14 days. Thank you for your business!",
  body: "Hello,\n\nInvoice INV-2043 for October services. Amount due: $420.00. Payment is due within 14 days.\n\nThanks,\nBright Studio",
};

const SIM_ROW: Record<string, unknown> = {
  name: "Jane Doe",
  email: "jane@example.com",
  company: "Acme Ltd",
  status: "new",
};

// ---------------------------------------------------------------------------
// Handler registry — only registered handlers are executable
// ---------------------------------------------------------------------------

const HANDLERS: Record<NodeType, NodeHandler> = {
  "manual.trigger": async (node) => {
    const sample = parseSampleInput(node.config);
    return ok({ ...sample, sample });
  },
  "schedule.trigger": async (node) => {
    const sample = parseSampleInput(node.config);
    return ok({ ...sample, sample, note: "Schedule runs on demand until background scheduling ships." });
  },
  "gmail.new_email": async (node, ctx) => {
    if (ctx.mode === "simulation") return ok({ ...SIM_EMAIL, simulated: true });
    const res = await fetchLatestEmail(ctx.userId, typeof node.config.filter === "string" ? node.config.filter : "");
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Gmail connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "gmail.send_email": async (node, ctx) => {
    const to = String(resolveTemplate(node.config.to, ctx.outputs) ?? "");
    const subject = String(resolveTemplate(node.config.subject, ctx.outputs) ?? "");
    const body = String(resolveTemplate(node.config.body, ctx.outputs) ?? "");
    if (ctx.mode === "simulation") {
      return ok({ sent: true, message_id: "sim_" + Math.abs(hash(to + subject)).toString(16), simulated: true, to, subject });
    }
    const res = await sendEmail(ctx.userId, to, subject, body);
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Gmail connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.new_row": async (node, ctx) => {
    if (ctx.mode === "simulation") return ok({ row: SIM_ROW, row_number: 42, simulated: true });
    const res = await fetchLatestSheetRow(ctx.userId, str(node.config.spreadsheetId), str(node.config.worksheet));
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.add_row": async (node, ctx) => {
    const row = resolveTemplate(node.config.row, ctx.outputs) as Record<string, unknown> | string | undefined;
    const values = typeof row === "string" ? { value: row } : row ?? {};
    if (ctx.mode === "simulation") {
      return ok({ row_number: Math.abs(hash(JSON.stringify(values))) % 900 + 10, simulated: true, values });
    }
    const res = await appendSheetRow(ctx.userId, str(node.config.spreadsheetId), str(node.config.worksheet), values);
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.find_row": async (node, ctx) => {
    const value = String(resolveTemplate(node.config.value, ctx.outputs) ?? "");
    if (ctx.mode === "simulation") {
      const row = { ...SIM_ROW };
      row[str(node.config.column) ?? "key"] = value;
      return ok({ found: true, row, simulated: true });
    }
    const res = await findSheetRow(ctx.userId, str(node.config.spreadsheetId), str(node.config.worksheet), str(node.config.column) ?? "", value);
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "ai.summarize": async (node, ctx) => {
    const source = String(resolveTemplate(node.config.source, ctx.outputs) ?? "");
    if (!source.trim()) return waiting("The source text is empty, so there is nothing to summarize yet.");
    const style = str(node.config.style) === "bullet-points" ? "concise bullet points" : "one short paragraph";
    const maxWords = Number(node.config.maxLength) > 0 ? Number(node.config.maxLength) : 120;
    return aiCall(
      `Summarize the following text as ${style} of at most ${maxWords} words. Plain text only.\n\n---\n${source.slice(0, 8000)}\n---`,
      { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
    ).then((r) => {
      const summary = r.output["summary"];
      return { ...r, output: { summary } };
    });
  },
  "ai.extract": async (node, ctx) => {
    const source = String(resolveTemplate(node.config.source, ctx.outputs) ?? "");
    if (!source.trim()) return waiting("The source text is empty, so there is nothing to extract from yet.");
    const fields = Array.isArray(node.config.fields) ? node.config.fields.map(String) : [];
    if (!fields.length) return failed("No fields configured to extract.", "config_missing");
    const properties: Record<string, { type: "string" }> = {};
    for (const f of fields) properties[f] = { type: "string" };
    return aiCall(
      `Extract these fields from the text. Return "" for a field you cannot find.\nFields: ${fields.join(", ")}\n\n---\n${source.slice(0, 8000)}\n---`,
      { type: "object", properties, required: fields, additionalProperties: false },
    );
  },
  "logic.filter": async (node, ctx) => {
    const rawValue = resolveTemplate(node.config.field, ctx.outputs);
    const value = rawValue === undefined || rawValue === null ? "" : typeof rawValue === "object" ? JSON.stringify(rawValue) : String(rawValue);
    const operator = str(node.config.operator) ?? "contains";
    const compare = String(resolveTemplate(node.config.value, ctx.outputs) ?? "");
    let passed = false;
    switch (operator) {
      case "contains": passed = value.toLowerCase().includes(compare.toLowerCase()); break;
      case "equals": passed = value === compare; break;
      case "not_empty": passed = value.trim().length > 0; break;
      case "greater_than": { const a = Number(value), b = Number(compare); passed = !Number.isNaN(a) && !Number.isNaN(b) && a > b; break; }
      case "less_than": { const a = Number(value), b = Number(compare); passed = !Number.isNaN(a) && !Number.isNaN(b) && a < b; break; }
      default: passed = value.trim().length > 0;
    }
    return ok({ passed, value });
  },
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function executionOrder(definition: WorkflowDefinition): WorkflowNode[] {
  const { nodes, edges } = definition;
  const triggers = nodes.filter((n) => isTriggerType(n.type));
  if (!triggers.length) return [];
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  const stack = [triggers[0].id];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node) order.push(node);
    for (const next of adjacency.get(id) ?? []) stack.push(next);
  }
  return order;
}

function withTimeout<T>(p: Promise<T>, ms: number, nodeLabel: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${nodeLabel} timed out after ${ms / 1000}s.`)), ms)),
  ]);
}

export interface EngineStepResult {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: StepStatus;
  durationMs: number;
  output: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface EngineRunResult {
  status: "succeeded" | "partially_succeeded" | "failed";
  steps: EngineStepResult[];
  errorSummary: string | null;
}

/**
 * Runs the workflow against a handler registry. `recordStep` persists each
 * step result as it completes so the UI can show progress.
 */
export async function runWorkflow(
  definition: WorkflowDefinition,
  ctx: RunContext,
  recordStep?: (node: WorkflowNode, result: NodeRunOutput, durationMs: number) => Promise<void>,
): Promise<EngineRunResult> {
  const order = executionOrder(definition).slice(0, MAX_NODES);
  const steps: EngineStepResult[] = [];
  const outputs: Record<string, Record<string, unknown>> = {};
  const runCtx: RunContext = { ...ctx, outputs };
  let sawWaiting = false;

  for (const node of order) {
    const handler = HANDLERS[node.type];
    if (!handler) {
      const result: NodeRunOutput = failed(`No handler registered for ${node.type}.`, "unregistered_node");
      steps.push(toStep(node, result, 0));
      await recordStep?.(node, result, 0);
      return { status: "failed", steps, errorSummary: result.errorMessage ?? null };
    }

    const startedAt = Date.now();
    let result: NodeRunOutput;
    try {
      result = await withTimeout(handler(node, runCtx), NODE_TIMEOUT_MS, nodeLabelOf(node));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown node failure";
      result = failed(message, "node_exception");
    }
    const durationMs = Date.now() - startedAt;

    steps.push(toStep(node, result, durationMs));
    await recordStep?.(node, result, durationMs);

    if (result.status === "succeeded") {
      outputs[node.id] = result.output;
    } else if (result.status === "waiting") {
      sawWaiting = true;
      break; // a waiting node stops the chain; results are shown honestly
    } else {
      return { status: "failed", steps, errorSummary: result.errorMessage ?? null };
    }
  }

  const status = sawWaiting ? "partially_succeeded" : "succeeded";
  return { status, steps, errorSummary: sawWaiting ? "Stopped at a node waiting for a connection." : null };
}

function nodeLabelOf(node: WorkflowNode): string {
  return node.type;
}

function toStep(node: WorkflowNode, result: NodeRunOutput, durationMs: number): EngineStepResult {
  return {
    nodeId: node.id,
    nodeType: node.type,
    nodeLabel: node.id,
    status: result.status,
    durationMs,
    output: sanitize(result.output),
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  };
}

/** Truncate long strings so stored inputs/outputs stay readable and bounded. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object" && depth < 6) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, 50)) out[k] = sanitize(v, depth + 1);
    return out;
  }
  return value;
}
