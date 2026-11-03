import { all, get, newId, nowIso, parseJson, run, transaction } from "../db";
import {
  normalizeDefinition,
  validateDefinition,
  workflowDefinitionSchema,
  type IntegrationStatus,
  type ValidationResult,
  type WorkflowDefinition,
} from "@shared/workflow";
import { getNodeDefinition, isTriggerType, requiredIntegrationsForTypes } from "@shared/nodes";
import { AppError } from "../lib/errors";
import { providerStatus, type GoogleProvider } from "./google";
import { assertExecutionLimit, assertWorkflowLimit } from "./usage";
import { enqueueExecution } from "../engine/queue";

export interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: string;
  trigger_type: string | null;
  active_version_id: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  version: number;
  definition_json: string;
  created_at: string;
}

export function getWorkflowRow(id: string, workspaceId: string): WorkflowRow | undefined {
  return get<WorkflowRow>(
    `SELECT id, workspace_id, name, description, status, trigger_type, active_version_id, last_run_at, last_run_status, metadata_json, created_at, updated_at
       FROM workflows WHERE id = ? AND workspace_id = ?`,
    id,
    workspaceId,
  );
}

export function latestVersion(workflowId: string): VersionRow | undefined {
  return get<VersionRow>(
    "SELECT id, version, definition_json, created_at FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT 1",
    workflowId,
  );
}

export function parseDefinition(json: string | null | undefined): WorkflowDefinition | null {
  if (!json) return null;
  const parsed = workflowDefinitionSchema.safeParse(parseJson(json, null));
  return parsed.success ? parsed.data : null;
}

export function connectionStatuses(workspaceId: string): Record<GoogleProvider, IntegrationStatus> {
  return {
    gmail: providerStatus(workspaceId, "gmail"),
    google_sheets: providerStatus(workspaceId, "google_sheets"),
  };
}

export function validateForMode(
  definition: WorkflowDefinition,
  workspaceId: string,
  mode: "live" | "simulation",
): ValidationResult {
  return validateDefinition(definition, {
    mode,
    checkIntegrations: mode === "live",
    connectionStatus: connectionStatuses(workspaceId),
  });
}

function triggerLabel(definition: WorkflowDefinition | null): string {
  const trigger = definition?.nodes.find((n) => isTriggerType(n.type));
  return trigger ? getNodeDefinition(trigger.type)?.title ?? trigger.type : "No trigger";
}

function integrationLabels(definition: WorkflowDefinition | null) {
  if (!definition) return [];
  return requiredIntegrationsForTypes(definition.nodes.map((n) => n.type));
}

export function executionStatsFor(workflowIds: string[]): Map<string, { total: number; succeeded: number; failed: number }> {
  const map = new Map<string, { total: number; succeeded: number; failed: number }>();
  if (workflowIds.length === 0) return map;
  const placeholders = workflowIds.map(() => "?").join(",");
  const rows = all<{ workflow_id: string; total: number; succeeded: number; failed: number }>(
    `SELECT workflow_id,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as succeeded,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM executions
      WHERE workflow_id IN (${placeholders})
      GROUP BY workflow_id`,
    ...workflowIds,
  );
  for (const row of rows) {
    map.set(row.workflow_id, {
      total: Number(row.total) || 0,
      succeeded: Number(row.succeeded) || 0,
      failed: Number(row.failed) || 0,
    });
  }
  return map;
}

export function listWorkflows(workspaceId: string, filters: { search?: string; status?: string } = {}) {
  let sql = `SELECT id, workspace_id, name, description, status, trigger_type, active_version_id, last_run_at, last_run_status, metadata_json, created_at, updated_at
               FROM workflows WHERE workspace_id = ?`;
  const params: unknown[] = [workspaceId];
  if (filters.status && filters.status !== "all") {
    sql += " AND status = ?";
    params.push(filters.status);
  }
  if (filters.search) {
    sql += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = all<WorkflowRow>(sql, ...params);
  const stats = executionStatsFor(rows.map((r) => r.id));
  const versions = new Map<string, WorkflowDefinition | null>();
  for (const row of rows) {
    versions.set(row.id, parseDefinition(latestVersion(row.id)?.definition_json));
  }
  return rows.map((row) => {
    const definition = versions.get(row.id) ?? null;
    const stat = stats.get(row.id);
    const successRate = stat && stat.total > 0 ? Math.round((stat.succeeded / stat.total) * 100) : null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      triggerType: row.trigger_type,
      triggerLabel: triggerLabel(definition),
      integrations: integrationLabels(definition),
      nodeCount: definition?.nodes.length ?? 0,
      lastRunAt: row.last_run_at,
      lastRunStatus: row.last_run_status,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      successRate,
      runCount: stat?.total ?? 0,
      failedCount: stat?.failed ?? 0,
    };
  });
}

export function getWorkflowDetail(id: string, workspaceId: string) {
  const row = getWorkflowRow(id, workspaceId);
  if (!row) return null;
  const version = latestVersion(id);
  const definition = parseDefinition(version?.definition_json);
  const connections = connectionStatuses(workspaceId);
  const validation = definition
    ? validateDefinition(definition, { mode: "simulation", connectionStatus: connections })
    : null;
  const liveValidation = definition
    ? validateDefinition(definition, { mode: "live", checkIntegrations: true, connectionStatus: connections })
    : null;
  const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
  const stats = executionStatsFor([id]).get(id);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    triggerType: row.trigger_type,
    triggerLabel: triggerLabel(definition),
    definition,
    version: version?.version ?? 0,
    versionId: version?.id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    metadata,
    runMode: metadata.runMode === "live" ? "live" : "simulation",
    connections,
    validation,
    liveValidation,
    requiredIntegrations: definition ? requiredIntegrationsForTypes(definition.nodes.map((n) => n.type)) : [],
    stats: stats ?? { total: 0, succeeded: 0, failed: 0 },
    workspaceId,
  };
}

const DEFAULT_DEFINITION: WorkflowDefinition = {
  version: 1,
  nodes: [
    {
      id: "trigger_1",
      type: "manual.trigger",
      title: "Manual trigger",
      config: {},
      position: { x: 80, y: 140 },
    },
  ],
  edges: [],
};

export function createWorkflow(input: {
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string;
  definition?: unknown;
}) {
  assertWorkflowLimit(input.workspaceId);
  let definition: WorkflowDefinition;
  if (input.definition) {
    const parsed = workflowDefinitionSchema.safeParse(input.definition);
    if (!parsed.success) {
      throw new AppError("invalid_definition", "The workflow definition is invalid.", { status: 422, details: parsed.error.issues });
    }
    definition = normalizeDefinition(parsed.data);
  } else {
    definition = DEFAULT_DEFINITION;
  }

  const trigger = definition.nodes.find((n) => isTriggerType(n.type));
  const now = nowIso();
  const workflowId = newId("wf");
  const versionId = newId("wfv");
  const name = (input.name?.trim() || "Untitled automation").slice(0, 120);

  transaction(() => {
    run(
      `INSERT INTO workflows (id, workspace_id, name, description, status, trigger_type, active_version_id, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, '{}', ?, ?)`,
      workflowId,
      input.workspaceId,
      name,
      (input.description ?? "").slice(0, 500),
      trigger?.type ?? null,
      versionId,
      now,
      now,
    );
    run(
      "INSERT INTO workflow_versions (id, workflow_id, version, definition_json, created_at, created_by) VALUES (?, ?, 1, ?, ?, ?)",
      versionId,
      workflowId,
      JSON.stringify(definition),
      now,
      input.userId,
    );
  });
  return getWorkflowDetail(workflowId, input.workspaceId);
}

export function saveWorkflow(input: {
  id: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string;
  definition?: unknown;
}) {
  const row = getWorkflowRow(input.id, input.workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });

  let definition: WorkflowDefinition | null = null;
  if (input.definition !== undefined) {
    const parsed = workflowDefinitionSchema.safeParse(input.definition);
    if (!parsed.success) {
      throw new AppError("invalid_definition", "The workflow contains invalid data and was not saved.", {
        status: 422,
        details: parsed.error.issues,
      });
    }
    definition = normalizeDefinition(parsed.data);
  }

  const latest = latestVersion(input.id);
  const name = input.name !== undefined ? input.name.trim().slice(0, 120) : row.name;
  if (!name) throw new AppError("invalid_name", "Give your automation a name before saving.", { status: 422 });
  const description = input.description !== undefined ? input.description.slice(0, 500) : row.description;

  let versionNumber = latest?.version ?? 0;
  let versionId = latest?.id ?? null;
  const definitionChanged =
    definition !== null && JSON.stringify(definition) !== JSON.stringify(parseDefinition(latest?.definition_json));

  const nextDefinition = definition ?? parseDefinition(latest?.definition_json) ?? DEFAULT_DEFINITION;
  const trigger = nextDefinition.nodes.find((n) => isTriggerType(n.type));

  let status = row.status;
  let statusNote: string | null = null;
  if (row.status === "active") {
    const live = validateForMode(nextDefinition, input.workspaceId, "live");
    if (!live.valid) {
      status = "needs_configuration";
      statusNote = "This automation was active. The latest changes introduced blocking errors, so it is now paused as Needs configuration.";
    }
  }

  const now = nowIso();
  transaction(() => {
    if (definitionChanged && definition) {
      versionNumber += 1;
      versionId = newId("wfv");
      run(
        "INSERT INTO workflow_versions (id, workflow_id, version, definition_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        versionId,
        input.id,
        versionNumber,
        JSON.stringify(definition),
        now,
        input.userId,
      );
    }
    run(
      `UPDATE workflows SET name = ?, description = ?, status = ?, trigger_type = ?, active_version_id = ?, updated_at = ? WHERE id = ?`,
      name,
      description,
      status,
      trigger?.type ?? null,
      versionId,
      now,
      input.id,
    );
  });

  return { detail: getWorkflowDetail(input.id, input.workspaceId), statusNote, definitionChanged, version: versionNumber };
}

export function activateWorkflow(id: string, workspaceId: string, mode: "live" | "simulation") {
  const row = getWorkflowRow(id, workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });
  const version = latestVersion(id);
  const definition = parseDefinition(version?.definition_json);
  if (!definition) throw new AppError("invalid_definition", "Save a valid workflow before activating it.", { status: 422 });
  if (definition.nodes.length < 2) {
    throw new AppError("no_actions", "Add at least one action step before activating this automation.", { status: 422 });
  }
  const validation = validateForMode(definition, workspaceId, mode);
  if (!validation.valid) {
    throw new AppError("workflow_invalid", "Fix the blocking issues before activating this automation.", {
      status: 422,
      details: validation.errors,
    });
  }
  const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
  const now = nowIso();
  run(
    "UPDATE workflows SET status = 'active', metadata_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
    JSON.stringify({ ...metadata, runMode: mode, scheduleAnchor: now }),
    now,
    id,
    workspaceId,
  );
  return getWorkflowDetail(id, workspaceId);
}

export function pauseWorkflow(id: string, workspaceId: string) {
  const row = getWorkflowRow(id, workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });
  run("UPDATE workflows SET status = 'paused', updated_at = ? WHERE id = ? AND workspace_id = ?", nowIso(), id, workspaceId);
  return getWorkflowDetail(id, workspaceId);
}

export function deleteWorkflow(id: string, workspaceId: string) {
  const row = getWorkflowRow(id, workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });
  run("DELETE FROM workflows WHERE id = ? AND workspace_id = ?", id, workspaceId);
}

export function duplicateWorkflow(id: string, workspaceId: string, userId: string) {
  const row = getWorkflowRow(id, workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });
  assertWorkflowLimit(workspaceId);
  const version = latestVersion(id);
  const definition = parseDefinition(version?.definition_json);
  if (!definition) throw new AppError("invalid_definition", "This automation has no saved definition to duplicate.", { status: 422 });
  const now = nowIso();
  const newWorkflowId = newId("wf");
  const newVersionId = newId("wfv");
  transaction(() => {
    run(
      `INSERT INTO workflows (id, workspace_id, name, description, status, trigger_type, active_version_id, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, '{}', ?, ?)`,
      newWorkflowId,
      workspaceId,
      `${row.name} (copy)`.slice(0, 120),
      row.description,
      row.trigger_type,
      newVersionId,
      now,
      now,
    );
    run(
      "INSERT INTO workflow_versions (id, workflow_id, version, definition_json, created_at, created_by) VALUES (?, ?, 1, ?, ?, ?)",
      newVersionId,
      newWorkflowId,
      JSON.stringify(definition),
      now,
      userId,
    );
  });
  return getWorkflowDetail(newWorkflowId, workspaceId);
}

export function createExecution(input: {
  workflowId: string;
  workspaceId: string;
  mode: "live" | "simulation";
  triggerSource: string;
  executionInput?: unknown;
  requireActive?: boolean;
}) {
  const row = getWorkflowRow(input.workflowId, input.workspaceId);
  if (!row) throw new AppError("workflow_not_found", "Automation not found.", { status: 404 });
  if (input.requireActive && row.status !== "active") {
    throw new AppError("workflow_not_active", "Activate this automation before running it.", { status: 409 });
  }
  const version = latestVersion(input.workflowId);
  if (!version) throw new AppError("no_version", "This automation has no saved version yet. Save it first.", { status: 409 });
  assertExecutionLimit(input.workspaceId);

  const workspace = get<{ is_demo: number }>("SELECT is_demo FROM workspaces WHERE id = ?", input.workspaceId);
  const executionId = newId("exe");
  const now = nowIso();
  transaction(() => {
    run(
      `INSERT INTO executions (id, workspace_id, workflow_id, workflow_version_id, status, mode, trigger_source, started_at, is_demo, input_json, created_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
      executionId,
      input.workspaceId,
      input.workflowId,
      version.id,
      input.mode,
      input.triggerSource,
      now,
      workspace?.is_demo ?? 0,
      input.executionInput ? JSON.stringify(input.executionInput).slice(0, 20000) : null,
      now,
    );
    enqueueExecution(executionId);
  });
  return { executionId, status: "queued" as const, mode: input.mode, workflowId: input.workflowId };
}
