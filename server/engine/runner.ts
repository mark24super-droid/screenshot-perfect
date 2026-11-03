import { get, newId, nowIso, parseJson, run } from "../db";
import { providerStatus } from "../services/google";
import { validateDefinition, workflowDefinitionSchema, type WorkflowDefinition, type WorkflowNode } from "@shared/workflow";
import { getNodeDefinition } from "@shared/nodes";
import { AppError, sanitizeForLog, userMessageForError } from "../lib/errors";
import { getHandler } from "./handlers";
import { resolveConfig } from "./resolve";
import type { HandlerContext } from "./types";

const NODE_TIMEOUT_MS = 65_000;

interface ExecutionRow {
  id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id: string | null;
  status: string;
  mode: string;
  trigger_source: string;
  started_at: string;
  input_json: string | null;
}

function stepRow(executionId: string, node: WorkflowNode, status: string, seq: number, extra: Record<string, unknown> = {}): void {
  run(
    `INSERT INTO execution_steps (id, execution_id, node_id, node_type, node_title, status, started_at, finished_at, duration_ms, sanitized_input, sanitized_output, error_code, error_message, attempt, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("stp"),
    executionId,
    node.id,
    node.type,
    node.title || getNodeDefinition(node.type)?.title || node.type,
    status,
    (extra.startedAt as string) ?? null,
    (extra.finishedAt as string) ?? null,
    (extra.durationMs as number) ?? null,
    extra.input !== undefined ? JSON.stringify(sanitizeForLog(extra.input)) : null,
    extra.output !== undefined ? JSON.stringify(sanitizeForLog(extra.output)) : null,
    (extra.errorCode as string) ?? null,
    (extra.errorMessage as string) ?? null,
    (extra.attempt as number) ?? 1,
    seq,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("step_timeout", `“${label}” took too long and was stopped after ${Math.round(ms / 1000)} seconds.`, { status: 504 }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runExecution(executionId: string): Promise<void> {
  const execution = get<ExecutionRow>(
    "SELECT id, workspace_id, workflow_id, workflow_version_id, status, mode, trigger_source, started_at, input_json FROM executions WHERE id = ?",
    executionId,
  );
  if (!execution) return;
  if (["succeeded", "failed", "cancelled"].includes(execution.status)) return;

  const workflow = get<{ id: string; workspace_id: string; name: string }>(
    "SELECT id, workspace_id, name FROM workflows WHERE id = ?",
    execution.workflow_id,
  );
  const version = execution.workflow_version_id
    ? get<{ definition_json: string }>("SELECT definition_json FROM workflow_versions WHERE id = ?", execution.workflow_version_id)
    : get<{ definition_json: string }>(
        "SELECT definition_json FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT 1",
        execution.workflow_id,
      );

  const start = Date.now();
  run("UPDATE executions SET status = 'running' WHERE id = ? AND status IN ('queued', 'running')", executionId);

  if (!workflow || !version) {
    finishExecution(executionId, "failed", start, "The saved workflow version could not be found. Re-save the workflow and try again.");
    return;
  }

  const parsed = workflowDefinitionSchema.safeParse(parseJson(version.definition_json, null));
  if (!parsed.success) {
    finishExecution(executionId, "failed", start, "The saved workflow definition is invalid. Open the editor, fix the steps, and save again.");
    return;
  }
  const definition: WorkflowDefinition = parsed.data;
  const mode = execution.mode === "live" ? "live" : "simulation";

  const connectionStatus = {
    gmail: providerStatus(workflow.workspace_id, "gmail"),
    google_sheets: providerStatus(workflow.workspace_id, "google_sheets"),
    ai: "connected" as const,
  };

  const validation = validateDefinition(definition, {
    mode,
    checkIntegrations: mode === "live",
    connectionStatus,
  });

  if (!validation.valid) {
    const first = validation.errors[0];
    const triggerNode = definition.nodes[0];
    stepRow(
      executionId,
      {
        ...(triggerNode ?? { id: "validation", type: "workflow.validation", config: {}, position: { x: 0, y: 0 } }),
        id: "__validation__",
        type: "workflow.validation",
        title: "Workflow validation",
      },
      "failed",
      0,
      {
        startedAt: nowIso(),
        finishedAt: nowIso(),
        durationMs: 0,
        input: { mode },
        output: { errors: validation.errors },
        errorCode: first?.code ?? "validation_failed",
        errorMessage: first?.message ?? "Workflow validation failed.",
      },
    );
    finishExecution(executionId, "failed", start, first?.message ?? "Workflow validation failed.");
    return;
  }

  const order = validation.order;
  if (order.length === 0) {
    finishExecution(executionId, "failed", start, "The workflow has no executable steps. Add a trigger and try again.");
    return;
  }

  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));
  const context: Record<string, Record<string, unknown>> = {};
  const executed = new Set<string>();
  let failure: { message: string; code: string } | null = null;
  let cancelled = false;
  let stopReason: "condition" | null = null;
  let seq = 0;

  for (let index = 0; index < order.length; index++) {
    const nodeId = order[index];
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const current = get<{ status: string }>("SELECT status FROM executions WHERE id = ?", executionId);
    if (current?.status === "cancelled") {
      cancelled = true;
      break;
    }

    const handler = getHandler(node.type);
    if (!handler) {
      failure = { message: `No execution handler is registered for “${node.type}”.`, code: "handler_missing" };
      stepRow(executionId, node, "failed", seq++, {
        startedAt: nowIso(),
        finishedAt: nowIso(),
        durationMs: 0,
        input: node.config,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      executed.add(node.id);
      break;
    }

    const resolved = resolveConfig(node.config, context);
    const label = node.title || getNodeDefinition(node.type)?.title || node.type;
    const startedAt = nowIso();
    const stepStart = Date.now();
    let succeeded = false;
    let attempts = 0;
    let lastError: unknown = null;

    while (attempts < 2 && !succeeded) {
      attempts += 1;
      const ctx: HandlerContext = {
        mode,
        workspaceId: workflow.workspace_id,
        workflowId: workflow.id,
        executionId,
        node,
        config: resolved,
        rawConfig: node.config,
        context,
        triggerSource: execution.trigger_source,
        executionInput: parseJson(execution.input_json, null),
        log: () => undefined,
      };
      try {
        const output = await withTimeout(handler(ctx), NODE_TIMEOUT_MS, label);
        context[node.id] = output;
        stepRow(executionId, node, "succeeded", seq++, {
          startedAt,
          finishedAt: nowIso(),
          durationMs: Date.now() - stepStart,
          input: resolved,
          output,
          attempt: attempts,
        });
        succeeded = true;
        executed.add(node.id);
        if (node.type === "logic.filter" && output.passed === false) {
          stopReason = "condition";
        }
      } catch (error) {
        lastError = error;
        const retryable = error instanceof AppError && error.retryable;
        if (retryable && attempts < 2) {
          await sleep(500 * attempts);
          continue;
        }
        const message = userMessageForError(error);
        failure = { message: message.message, code: message.code };
        stepRow(executionId, node, "failed", seq++, {
          startedAt,
          finishedAt: nowIso(),
          durationMs: Date.now() - stepStart,
          input: resolved,
          errorCode: message.code,
          errorMessage: message.message,
          attempt: attempts,
        });
        executed.add(node.id);
      }
    }

    if (failure) break;
    if (stopReason) {
      break;
    }
    if (!succeeded) {
      const message = userMessageForError(lastError);
      failure = { message: message.message, code: message.code };
      break;
    }
  }

  // Record skipped steps so the timeline is complete.
  for (const nodeId of order) {
    if (executed.has(nodeId)) continue;
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    stepRow(executionId, node, "skipped", seq++, {
      startedAt: null,
      finishedAt: null,
      durationMs: 0,
      input: null,
      errorMessage: cancelled
        ? "Execution cancelled before this step ran."
        : stopReason === "condition"
          ? "Skipped because the filter condition was not met."
          : "Skipped because an earlier step failed.",
    });
  }

  if (cancelled) {
    finishExecution(executionId, "cancelled", start, "Execution cancelled.");
  } else if (failure) {
    finishExecution(executionId, "failed", start, failure.message);
  } else {
    finishExecution(executionId, "succeeded", start, null);
  }
}

function finishExecution(executionId: string, status: string, start: number, errorSummary: string | null): void {
  const finishedAt = nowIso();
  const duration = Math.max(0, Date.now() - start);
  run(
    "UPDATE executions SET status = ?, finished_at = ?, duration_ms = ?, error_summary = ? WHERE id = ?",
    status,
    finishedAt,
    duration,
    errorSummary,
    executionId,
  );
  const execution = get<{ workflow_id: string }>("SELECT workflow_id FROM executions WHERE id = ?", executionId);
  if (execution) {
    run(
      "UPDATE workflows SET last_run_at = ?, last_run_status = ? WHERE id = ?",
      finishedAt,
      status === "succeeded" ? "succeeded" : status,
      execution.workflow_id,
    );
  }
}
