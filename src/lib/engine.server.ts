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
  NODE_SPECS,
  type WorkflowDefinition,
  type WorkflowNode,
  type NodeType,
} from "@/lib/workflow-schema";

export const NODE_TIMEOUT_MS = 30_000;
export const MAX_NODES = 25;
export const MAX_RETRIES = 2;

export type StepStatus = "succeeded" | "failed" | "waiting" | "skipped";

export interface NodeRunOutput {
  status: StepStatus;
  output: Record<string, any>;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export interface RunContext {
  mode: "simulation" | "live";
  userId: string;
  /** Outputs of completed nodes, used to resolve {{node.field}} variables. */
  outputs: Record<string, Record<string, any>>;
  /** Optional payload supplied by the user when testing a manual trigger. */
  input?: Record<string, any> | undefined;
}

type NodeHandler = (node: WorkflowNode, ctx: RunContext) => Promise<NodeRunOutput>;

const ok = (output: Record<string, unknown>): NodeRunOutput => ({ status: "succeeded", output });
const waiting = (message: string): NodeRunOutput => ({ status: "waiting", output: {}, errorMessage: message });
const failed = (message: string, code = "node_failed"): NodeRunOutput => ({ status: "failed", output: {}, errorCode: code, errorMessage: message });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseSampleInput(config: Record<string, unknown>): Record<string, unknown> {
  const raw = config["sampleInput"];
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
// AI node helpers (real AI calls when a provider is configured; simulation
// falls back to deterministic, clearly labelled results)
// ---------------------------------------------------------------------------

/** Deterministic extractor used in simulation mode when no AI provider is set. */
export function demoExtract(source: string, fields: string[]): Record<string, string> {
  const email = source.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0] ?? "";
  const amount = source.match(/(?:[$€£]\s?)?\d[\d,]*\.\d{2}/)?.[0] ?? "";
  const invoice = source.match(/\b(?:INV|INVOICE)[-\s#:]*([A-Z0-9][A-Z0-9-]{2,})/i)?.[0] ?? "";
  const date =
    source.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    source.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)?.[0] ??
    "";
  const subject = source.split("\n")[0]?.slice(0, 120) ?? "";
  const out: Record<string, string> = {};
  for (const field of fields) {
    const key = field.toLowerCase();
    if (key.includes("email") || key.includes("sender") || key.includes("recipient")) out[field] = email;
    else if (key.includes("amount") || key.includes("total") || key.includes("price") || key.includes("cost")) out[field] = amount;
    else if (key.includes("invoice")) out[field] = invoice;
    else if (key.includes("date") || key.includes("due")) out[field] = date;
    else if (key.includes("subject") || key.includes("title")) out[field] = subject;
    else out[field] = "";
  }
  return out;
}

export function demoSummary(source: string, maxWords: number): string {
  const words = source.replace(/\s+/g, " ").trim().split(" ");
  const limit = Math.max(10, Math.min(maxWords, 200));
  if (words.length <= limit) return words.join(" ");
  return words.slice(0, limit).join(" ") + "…";
}

async function aiCall(
  prompt: string,
  schema: Record<string, unknown>,
  ctx: RunContext,
  demo: () => Record<string, unknown>,
): Promise<NodeRunOutput> {
  try {
    const text = await runStructuredCompletion({
      input: prompt,
      schemaName: "flowmate_ai_node",
      jsonSchema: schema,
      maxOutputTokens: 1500,
    });
    return { status: "succeeded", output: JSON.parse(text) as Record<string, unknown> };
  } catch (err) {
    // When no AI provider is configured, simulation mode still needs to be
    // useful. The result is deterministic and explicitly marked simulated.
    if (err instanceof AiUnavailableError && ctx.mode === "simulation") {
      return ok({ ...demo(), simulated: true, ai_fallback: true });
    }
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
  "manual.trigger": async (node, ctx) => {
    const sample = ctx.input ?? parseSampleInput(node.config);
    return ok({ ...sample, sample, simulated: ctx.mode === "simulation" });
  },
  "schedule.trigger": async (node, ctx) => {
    const sample = ctx.input ?? parseSampleInput(node.config);
    return ok({
      ...sample,
      sample,
      simulated: ctx.mode === "simulation",
      note: "Scheduled runs happen on demand until background scheduling ships.",
    });
  },
  "gmail.new_email": async (node, ctx) => {
    if (ctx.mode === "simulation") return ok({ ...SIM_EMAIL, simulated: true });
    const res = await fetchLatestEmail(ctx.userId, typeof node.config["filter"] === "string" ? node.config["filter"] : "");
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Gmail connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "gmail.send_email": async (node, ctx) => {
    const to = String(resolveTemplate(node.config["to"], ctx.outputs) ?? "");
    const subject = String(resolveTemplate(node.config["subject"], ctx.outputs) ?? "");
    const body = String(resolveTemplate(node.config["body"], ctx.outputs) ?? "");
    const cc = String(resolveTemplate(node.config["cc"], ctx.outputs) ?? "");
    const bcc = String(resolveTemplate(node.config["bcc"], ctx.outputs) ?? "");
    if (ctx.mode === "simulation") {
      return ok({
        sent: true,
        message_id: "sim_" + Math.abs(hash(to + subject)).toString(16),
        simulated: true,
        to,
        subject,
      });
    }
    const res = await sendEmail(ctx.userId, to, subject, body, cc, bcc);
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Gmail connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.new_row": async (node, ctx) => {
    if (ctx.mode === "simulation") return ok({ row: SIM_ROW, row_number: 42, simulated: true });
    const res = await fetchLatestSheetRow(ctx.userId, str(node.config["spreadsheetId"]), str(node.config["worksheet"]));
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.add_row": async (node, ctx) => {
    const row = resolveTemplate(node.config["row"], ctx.outputs) as Record<string, unknown> | string | undefined;
    const values = typeof row === "string" ? { value: row } : row ?? {};
    if (ctx.mode === "simulation") {
      return ok({
        row_number: (Math.abs(hash(JSON.stringify(values))) % 900) + 10,
        simulated: true,
        values,
      });
    }
    const res = await appendSheetRow(ctx.userId, str(node.config["spreadsheetId"]), str(node.config["worksheet"]), values);
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "google_sheets.find_row": async (node, ctx) => {
    const value = String(resolveTemplate(node.config["value"], ctx.outputs) ?? "");
    if (ctx.mode === "simulation") {
      const row = { ...SIM_ROW };
      row[str(node.config["column"]) ?? "key"] = value;
      return ok({ found: true, row, simulated: true });
    }
    const res = await findSheetRow(
      ctx.userId,
      str(node.config["spreadsheetId"]),
      str(node.config["worksheet"]),
      str(node.config["column"]) ?? "",
      value,
    );
    if (res.kind === "ok") return ok(res.data);
    if (res.kind === "not_connected") return waiting(res.message);
    if (res.kind === "reconnect_required") return waiting("Your Google Sheets connection needs to be renewed. Reconnect it on the Integrations page.");
    return failed(res.message, "provider_error");
  },
  "ai.summarize": async (node, ctx) => {
    const source = String(resolveTemplate(node.config["source"], ctx.outputs) ?? "");
    if (!source.trim()) return waiting("The source text is empty, so there is nothing to summarize yet.");
    const style = str(node.config["style"]) === "bullet-points" ? "concise bullet points" : "one short paragraph";
    const maxWords = Number(node.config["maxLength"]) > 0 ? Number(node.config["maxLength"]) : 120;
    const result = await aiCall(
      `Summarize the following text as ${style} of at most ${maxWords} words. Plain text only.\n\n---\n${source.slice(0, 8000)}\n---`,
      {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
      ctx,
      () => ({ summary: demoSummary(source, maxWords) }),
    );
    const summary = result.output["summary"];
    return { ...result, output: { ...result.output, summary } };
  },
  "ai.extract": async (node, ctx) => {
    const source = String(resolveTemplate(node.config["source"], ctx.outputs) ?? "");
    if (!source.trim()) return waiting("The source text is empty, so there is nothing to extract from yet.");
    const fields = Array.isArray(node.config["fields"]) ? node.config["fields"].map(String) : [];
    if (!fields.length) return failed("No fields configured to extract.", "config_missing");
    const properties: Record<string, { type: "string" }> = {};
    for (const f of fields) properties[f] = { type: "string" };
    const result = await aiCall(
      `Extract these fields from the text. Return "" for a field you cannot find.\nFields: ${fields.join(", ")}\n\n---\n${source.slice(0, 8000)}\n---`,
      { type: "object", properties, required: fields, additionalProperties: false },
      ctx,
      () => demoExtract(source, fields),
    );
    if (result.status !== "succeeded") return result;
    // Expose both the flat fields and a `data` object so templates can use
    // either {{extract_1.amount}} or {{extract_1.data.amount}}.
    return { ...result, output: { ...result.output, data: { ...result.output } } };
  },
  "logic.filter": async (node, ctx) => {
    const rawValue = resolveTemplate(node.config["field"], ctx.outputs);
    const value = rawValue === undefined || rawValue === null ? "" : typeof rawValue === "object" ? JSON.stringify(rawValue) : String(rawValue);
    const operator = str(node.config["operator"]) ?? "contains";
    const compare = String(resolveTemplate(node.config["value"], ctx.outputs) ?? "");
    let passed = false;
    switch (operator) {
      case "contains":
        passed = value.toLowerCase().includes(compare.toLowerCase());
        break;
      case "equals":
        passed = value === compare;
        break;
      case "not_empty":
        passed = value.trim().length > 0;
        break;
      case "greater_than": {
        const a = Number(value);
        const b = Number(compare);
        passed = !Number.isNaN(a) && !Number.isNaN(b) && a > b;
        break;
      }
      case "less_than": {
        const a = Number(value);
        const b = Number(compare);
        passed = !Number.isNaN(a) && !Number.isNaN(b) && a < b;
        break;
      }
      default:
        passed = value.trim().length > 0;
    }
    if (!passed) {
      return {
        status: "skipped",
        output: { passed, value },
        errorMessage: "Condition not met — the rest of this branch was skipped.",
      };
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

/**
 * Kahn topological sort restricted to nodes reachable from the first trigger.
 * This guarantees a node never runs before all of its available inputs.
 */
export function executionOrder(definition: WorkflowDefinition): WorkflowNode[] {
  const { nodes, edges } = definition;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trigger = nodes.find((n) => isTriggerType(n.type));
  if (!trigger) return [];

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, 0);
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }

  // Reachability from the trigger — unreachable nodes never execute.
  const reachable = new Set<string>();
  const stack = [trigger.id];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const next of adjacency.get(id) ?? []) stack.push(next);
  }

  const order: WorkflowNode[] = [];
  const queue = nodes
    .filter((n) => reachable.has(n.id) && (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0 && reachable.has(next)) queue.push(next);
    }
  }
  return order.slice(0, MAX_NODES);
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
  input: Record<string, any>;
  output: Record<string, any>;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  attempts: number;
}

export interface EngineRunResult {
  status: "succeeded" | "partially_succeeded" | "failed";
  steps: EngineStepResult[];
  errorSummary: string | null;
}

export type StepRecorder = (
  node: WorkflowNode,
  result: NodeRunOutput,
  durationMs: number,
  input: Record<string, any>,
  attempts: number,
) => Promise<void>;

/** Retry only transient failures, with bounded attempts and linear backoff. */
function isRetryable(result: NodeRunOutput): boolean {
  return result.status === "failed" && (result.errorCode === "provider_error" || result.errorCode === "node_exception");
}

/**
 * Runs the workflow against the handler registry. `recordStep` persists each
 * step result as soon as it completes so the UI can show progress.
 */
export async function runWorkflow(
  definition: WorkflowDefinition,
  ctx: RunContext,
  recordStep?: StepRecorder,
): Promise<EngineRunResult> {
  const order = executionOrder(definition);
  if (order.length === 0) {
    return { status: "failed", steps: [], errorSummary: "This workflow has no trigger, so it cannot run." };
  }

  const steps: EngineStepResult[] = [];
  const outputs: Record<string, Record<string, unknown>> = {};
  const runCtx: RunContext = { ...ctx, outputs };
  const statuses = new Map<string, StepStatus>();
  const blocked = new Set<string>();
  const incoming = new Map<string, string[]>();
  for (const e of definition.edges) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  }

  let sawWaiting = false;

  for (const node of order) {
    const label = NODE_SPECS[node.type]?.label ?? node.type;

    // A node runs when at least one predecessor completed successfully. If
    // every branch into it was skipped, this node is skipped too.
    const parents = incoming.get(node.id) ?? [];
    if (parents.length > 0) {
      const hasLiveParent = parents.some((p) => statuses.get(p) === "succeeded" && !blocked.has(p) && statuses.has(p));
      if (!hasLiveParent) {
        const skipped: NodeRunOutput = {
          status: "skipped",
          output: {},
          errorMessage: "Skipped because the branch that feeds this step did not continue.",
        };
        const step = toStep(node, label, skipped, 0, {}, 0);
        steps.push(step);
        statuses.set(node.id, "skipped");
        blocked.add(node.id);
        await recordStep?.(node, skipped, 0, {}, 0);
        continue;
      }
    }

    const handler = HANDLERS[node.type];
    if (!handler) {
      const result: NodeRunOutput = failed(`No handler registered for ${node.type}.`, "unregistered_node");
      steps.push(toStep(node, label, result, 0, {}, 0));
      await recordStep?.(node, result, 0, {}, 0);
      return { status: "failed", steps, errorSummary: result.errorMessage ?? null };
    }

    const resolvedInput = (resolveTemplate(node.config, outputs) ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();
    let result: NodeRunOutput = failed("Node did not run.", "node_exception");
    let attempts = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      attempts = attempt + 1;
      try {
        result = await withTimeout(handler(node, runCtx), NODE_TIMEOUT_MS, label);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown node failure";
        result = failed(message, "node_exception");
      }
      if (!isRetryable(result)) break;
      if (attempt < MAX_RETRIES) await sleep(300 * (attempt + 1));
    }

    const durationMs = Date.now() - startedAt;
    steps.push(toStep(node, label, result, durationMs, resolvedInput, attempts));
    await recordStep?.(node, result, durationMs, resolvedInput, attempts);

    statuses.set(node.id, result.status);
    if (result.status === "succeeded") {
      outputs[node.id] = result.output;
    } else if (result.status === "skipped") {
      blocked.add(node.id);
    } else if (result.status === "waiting") {
      sawWaiting = true;
      break; // a waiting node stops the chain; results are shown honestly
    } else {
      return { status: "failed", steps, errorSummary: result.errorMessage ?? null };
    }
  }

  const anySkipped = steps.some((s) => s.status === "skipped");
  const status = sawWaiting || anySkipped ? "partially_succeeded" : "succeeded";
  return {
    status,
    steps,
    errorSummary: sawWaiting
      ? "Stopped at a node waiting for a connection or input."
      : anySkipped
        ? "A condition stopped part of the workflow before every action ran."
        : null,
  };
}

function toStep(
  node: WorkflowNode,
  label: string,
  result: NodeRunOutput,
  durationMs: number,
  input: Record<string, any>,
  attempts: number,
): EngineStepResult {
  return {
    nodeId: node.id,
    nodeType: node.type,
    nodeLabel: label,
    status: result.status,
    durationMs,
    input: sanitize(input) as Record<string, unknown>,
    output: sanitize(result.output) as Record<string, unknown>,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    attempts,
  };
}

const SENSITIVE_KEYS = /token|secret|password|authorization|api[-_]?key|cookie/i;

/** Truncate long strings and redact credential-like keys. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object" && depth < 6) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, 50)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}
