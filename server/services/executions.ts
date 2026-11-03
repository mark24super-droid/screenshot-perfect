import { all, get, newId, nowIso, parseJson, run } from "../db";
import { AppError } from "../lib/errors";
import { assertExecutionLimit, getUsage } from "./usage";
import { enqueueExecution } from "../engine/queue";

interface ExecutionRow {
  id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id: string | null;
  status: string;
  mode: string;
  trigger_source: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_summary: string | null;
  is_demo: number;
  input_json: string | null;
  created_at: string;
}

interface StepRow {
  id: string;
  node_id: string;
  node_type: string;
  node_title: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  sanitized_input: string | null;
  sanitized_output: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt: number;
  seq: number;
}

const UNSAFE_RETRY_NODE_TYPES = new Set(["gmail.send_email", "google_sheets.add_row"]);

export function listExecutions(
  workspaceId: string,
  filters: {
    status?: string;
    workflowId?: string;
    from?: string;
    to?: string;
    mode?: string;
    limit: number;
    offset: number;
  },
) {
  const usage = getUsage(workspaceId);
  const historyStart = new Date(Date.now() - usage.historyDays * 86400000).toISOString();
  const conditions = ["e.workspace_id = ?", "e.started_at >= ?"];
  const params: unknown[] = [workspaceId, historyStart];

  if (filters.status && filters.status !== "all") {
    if (filters.status === "running") {
      conditions.push("e.status IN ('running','queued')");
    } else {
      conditions.push("e.status = ?");
      params.push(filters.status);
    }
  }
  if (filters.workflowId) {
    conditions.push("e.workflow_id = ?");
    params.push(filters.workflowId);
  }
  if (filters.from) {
    conditions.push("e.started_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("e.started_at <= ?");
    params.push(filters.to);
  }
  if (filters.mode === "live" || filters.mode === "simulation") {
    conditions.push("e.mode = ?");
    params.push(filters.mode);
  }

  const where = conditions.join(" AND ");
  const total = get<{ c: number }>(`SELECT COUNT(*) as c FROM executions e WHERE ${where}`, ...params)?.c ?? 0;
  const rows = all<
    ExecutionRow & { workflow_name: string; succeeded_steps: number; failed_steps: number; total_steps: number }
  >(
    `SELECT e.*, w.name as workflow_name,
            (SELECT COUNT(*) FROM execution_steps s WHERE s.execution_id = e.id AND s.status = 'succeeded') as succeeded_steps,
            (SELECT COUNT(*) FROM execution_steps s WHERE s.execution_id = e.id AND s.status = 'failed') as failed_steps,
            (SELECT COUNT(*) FROM execution_steps s WHERE s.execution_id = e.id) as total_steps
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE ${where}
      ORDER BY e.started_at DESC
      LIMIT ? OFFSET ?`,
    ...params,
    filters.limit,
    filters.offset,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      status: row.status,
      mode: row.mode,
      triggerSource: row.trigger_source,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      errorSummary: row.error_summary,
      isDemo: Boolean(row.is_demo),
      succeededSteps: Number(row.succeeded_steps) || 0,
      failedSteps: Number(row.failed_steps) || 0,
      totalSteps: Number(row.total_steps) || 0,
    })),
    total,
    limit: filters.limit,
    offset: filters.offset,
    historyDays: usage.historyDays,
    historyStart,
  };
}

export function getExecutionDetail(id: string, workspaceId: string) {
  const execution = get<ExecutionRow & { workflow_name: string; workflow_status: string }>(
    `SELECT e.*, w.name as workflow_name, w.status as workflow_status
       FROM executions e JOIN workflows w ON w.id = e.workflow_id
      WHERE e.id = ? AND e.workspace_id = ?`,
    id,
    workspaceId,
  );
  if (!execution) return null;
  const steps = all<StepRow>(
    "SELECT id, node_id, node_type, node_title, status, started_at, finished_at, duration_ms, sanitized_input, sanitized_output, error_code, error_message, attempt, seq FROM execution_steps WHERE execution_id = ? ORDER BY seq ASC",
    id,
  );
  const unsafeStep = steps.find(
    (s) => s.status === "succeeded" && execution.mode === "live" && UNSAFE_RETRY_NODE_TYPES.has(s.node_type),
  );
  const canRetry = execution.status === "failed" && !unsafeStep;
  let retryReason: string | null = null;
  if (execution.status !== "failed") retryReason = "Only failed executions can be retried.";
  else if (unsafeStep) {
    retryReason =
      "This live execution already completed an external action (email send or spreadsheet write). Retrying could duplicate it, so automatic retry is disabled.";
  }

  return {
    id: execution.id,
    workflowId: execution.workflow_id,
    workflowName: execution.workflow_name,
    workflowStatus: execution.workflow_status,
    workflowVersionId: execution.workflow_version_id,
    status: execution.status,
    mode: execution.mode,
    triggerSource: execution.trigger_source,
    startedAt: execution.started_at,
    finishedAt: execution.finished_at,
    durationMs: execution.duration_ms,
    errorSummary: execution.error_summary,
    isDemo: Boolean(execution.is_demo),
    input: parseJson<Record<string, unknown> | null>(execution.input_json, null),
    steps: steps.map((s) => ({
      id: s.id,
      nodeId: s.node_id,
      nodeType: s.node_type,
      nodeTitle: s.node_title,
      status: s.status,
      startedAt: s.started_at,
      finishedAt: s.finished_at,
      durationMs: s.duration_ms,
      input: parseJson<unknown>(s.sanitized_input, null),
      output: parseJson<unknown>(s.sanitized_output, null),
      errorCode: s.error_code,
      errorMessage: s.error_message,
      attempt: s.attempt,
      seq: s.seq,
    })),
    canRetry,
    retryReason,
  };
}

export function retryExecution(id: string, workspaceId: string) {
  const detail = getExecutionDetail(id, workspaceId);
  if (!detail) throw new AppError("execution_not_found", "Execution not found.", { status: 404 });
  if (!detail.canRetry) {
    throw new AppError("retry_not_safe", detail.retryReason ?? "This execution cannot be retried safely.", { status: 409 });
  }
  assertExecutionLimit(workspaceId);
  const original = get<ExecutionRow>("SELECT * FROM executions WHERE id = ?", id);
  if (!original) throw new AppError("execution_not_found", "Execution not found.", { status: 404 });

  const newExecutionId = newId("exe");
  const now = nowIso();
  run(
    `INSERT INTO executions (id, workspace_id, workflow_id, workflow_version_id, status, mode, trigger_source, started_at, is_demo, input_json, created_at)
     VALUES (?, ?, ?, ?, 'queued', ?, 'retry', ?, ?, ?, ?)`,
    newExecutionId,
    workspaceId,
    original.workflow_id,
    original.workflow_version_id,
    original.mode,
    now,
    original.is_demo,
    original.input_json,
    now,
  );
  enqueueExecution(newExecutionId);
  return { executionId: newExecutionId, status: "queued" as const, mode: original.mode };
}

export function cancelExecution(id: string, workspaceId: string) {
  const execution = get<{ status: string }>("SELECT status FROM executions WHERE id = ? AND workspace_id = ?", id, workspaceId);
  if (!execution) throw new AppError("execution_not_found", "Execution not found.", { status: 404 });
  if (!["queued", "running", "waiting"].includes(execution.status)) {
    throw new AppError("cannot_cancel", "This execution has already finished and cannot be cancelled.", { status: 409 });
  }
  run(
    "UPDATE executions SET status = 'cancelled', finished_at = ?, error_summary = 'Cancelled by the user.' WHERE id = ? AND workspace_id = ?",
    nowIso(),
    id,
    workspaceId,
  );
  return getExecutionDetail(id, workspaceId);
}
