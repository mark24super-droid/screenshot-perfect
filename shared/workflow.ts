import { z } from "zod";
import {
  getNodeDefinition,
  isSupportedNodeType,
  isTriggerType,
  providerForNode,
  requiredIntegrationsForTypes,
  type ProviderId,
} from "./nodes";

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  config: z.record(z.unknown()).default({}),
  position: positionSchema.default({ x: 0, y: 0 }),
  title: z.string().max(120).optional(),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  label: z.string().max(60).optional(),
});

export const viewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().min(0.1).max(2.5),
});

export const workflowDefinitionSchema = z.object({
  version: z.literal(1).default(1),
  nodes: z.array(workflowNodeSchema).max(60),
  edges: z.array(workflowEdgeSchema).max(80),
  viewport: viewportSchema.optional(),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowViewport = z.infer<typeof viewportSchema>;

export type IntegrationStatus = "connected" | "demo" | "setup_required" | "disconnected" | "error";

export interface ValidationIssue {
  severity?: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  requiredIntegrations: ProviderId[];
  triggerId: string | null;
  order: string[];
  nodeCount: number;
}

export interface ValidateOptions {
  mode?: "live" | "simulation";
  connectionStatus?: Partial<Record<ProviderId, IntegrationStatus>>;
  checkIntegrations?: boolean;
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractVariableRefs(value: string): Array<{ nodeId: string; path: string; raw: string }> {
  const refs: Array<{ nodeId: string; path: string; raw: string }> = [];
  if (typeof value !== "string") return refs;
  for (const match of value.matchAll(VARIABLE_RE)) {
    refs.push({ nodeId: match[1], path: match[2], raw: match[0] });
  }
  return refs;
}

/** Replace {{node.path}} references with values from the execution context. */
export function interpolate(template: string, context: Record<string, unknown>): string {
  if (typeof template !== "string") return "";
  return template.replace(VARIABLE_RE, (_full, nodeId: string, path: string) => {
    const value = getByPath(context[nodeId], path);
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }
    return String(value);
  });
}

export function getByPath(source: unknown, path: string): unknown {
  if (source === undefined || source === null) return undefined;
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return undefined;
  }
  return current;
}

export function hasVariables(value: unknown): boolean {
  return typeof value === "string" && /\{\{[^}]+\}\}/.test(value);
}

/** Keep only allowlisted config keys and primitive / mapping values. */
export function sanitizeNodeConfig(type: string, raw: unknown): Record<string, unknown> {
  const def = getNodeDefinition(type);
  if (!def) return {};
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const output: Record<string, unknown> = {};
  for (const field of def.fields) {
    const value = input[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === "mapping") {
      if (Array.isArray(value)) {
        output[field.key] = value
          .slice(0, 40)
          .map((row) => {
            const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
            return {
              column: typeof r.column === "string" ? r.column.slice(0, 120) : "",
              value: typeof r.value === "string" ? r.value.slice(0, 2000) : "",
            };
          })
          .filter((r) => r.column || r.value);
      }
      continue;
    }
    if (field.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) output[field.key] = n;
      continue;
    }
    if (field.type === "select") {
      if (typeof value === "string" && (!field.options || field.options.some((o) => o.value === value))) {
        output[field.key] = value;
      }
      continue;
    }
    if (typeof value === "string") output[field.key] = value.slice(0, 8000);
  }
  return output;
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function findTrigger(def: WorkflowDefinition): WorkflowNode | undefined {
  return def.nodes.find((n) => isSupportedNodeType(n.type) && isTriggerType(n.type));
}

/** Deterministic topological order. Returns null when a cycle exists. */
export function topologicalOrder(def: WorkflowDefinition): string[] | null {
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of def.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of def.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const positionIndex = new Map(def.nodes.map((n, i) => [n.id, i]));
  const queue = def.nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || (positionIndex.get(a.id) ?? 0) - (positionIndex.get(b.id) ?? 0))
    .map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const target of adjacency.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return order.length === def.nodes.length ? order : null;
}

export function validateDefinition(def: WorkflowDefinition, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const mode = options.mode ?? "simulation";
  const trigger = findTrigger(def);
  const order = topologicalOrder(def) ?? [];
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const e of def.edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  if (def.nodes.length === 0) {
    errors.push({ code: "empty_workflow", message: "Add a trigger and at least one step to build this automation." });
  }

  for (const node of def.nodes) {
    if (!isSupportedNodeType(node.type)) {
      errors.push({
        code: "unsupported_node",
        message: `Unsupported step type “${node.type}”. Only allowlisted FlowMate steps can run.`,
        nodeId: node.id,
      });
    }
  }

  const triggers = def.nodes.filter((n) => isTriggerType(n.type));
  if (triggers.length === 0) {
    errors.push({ code: "missing_trigger", message: "Add a trigger — every workflow needs one starting point." });
  } else if (triggers.length > 1) {
    errors.push({
      code: "multiple_triggers",
      message: "Only one trigger is supported per workflow in this release. Remove the extra trigger.",
      nodeId: triggers[1].id,
    });
  }

  const seenIds = new Set<string>();
  for (const node of def.nodes) {
    if (seenIds.has(node.id)) {
      errors.push({ code: "duplicate_node_id", message: `Duplicate step id “${node.id}”.`, nodeId: node.id });
    }
    seenIds.add(node.id);
  }

  for (const edge of def.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      errors.push({
        code: "dangling_edge",
        message: "A connection points to a step that no longer exists. Delete and recreate the connection.",
      });
      continue;
    }
    if (edge.source === edge.target) {
      errors.push({ code: "self_loop", message: "A step cannot connect to itself.", nodeId: edge.source });
    }
    const sourceNode = nodeMap.get(edge.source)!;
    if (isTriggerType(edge.target) && sourceNode && !isTriggerType(sourceNode.type)) {
      errors.push({
        code: "edge_into_trigger",
        message: "A trigger must be the first step and cannot receive connections.",
        nodeId: edge.target,
      });
    }
  }

  for (const [sourceId, edges] of outgoing) {
    if (edges.length > 1) {
      errors.push({
        code: "branching_unsupported",
        message: "Branching is not supported yet. Each step can connect to one next step.",
        nodeId: sourceId,
      });
    }
  }

  if (!topologicalOrder(def) && def.nodes.length > 0) {
    errors.push({
      code: "cycle",
      message: "The workflow contains a cycle. Loops are not supported in this release.",
    });
  }

  if (trigger && order.length > 0) {
    for (const node of def.nodes) {
      if (node.id === trigger.id) continue;
      const incoming = def.edges.filter((e) => e.target === node.id);
      if (incoming.length === 0) {
        errors.push({
          code: "unreachable_node",
          message: `“${node.title || getNodeDefinition(node.type)?.title || node.type}” is not connected to the trigger.`,
          nodeId: node.id,
        });
      }
    }
    const triggerOrder = orderIndex.get(trigger.id);
    if (triggerOrder !== undefined && triggerOrder > 0) {
      errors.push({
        code: "trigger_not_first",
        message: "The trigger must run first. Check the connection direction.",
        nodeId: trigger.id,
      });
    }
  }

  // Config validation
  for (const node of def.nodes) {
    const definition = getNodeDefinition(node.type);
    if (!definition) continue;
    const label = node.title || definition.title;

    if (definition.demoOnly && mode === "live") {
      errors.push({
        code: "demo_only_node",
        message: `${label} is only available in simulation mode in this release.`,
        nodeId: node.id,
      });
    } else if (definition.demoOnly) {
      warnings.push({
        code: "demo_only_node",
        message: `${label} runs with simulated data — no real spreadsheet changes will be made.`,
        nodeId: node.id,
      });
    }

    for (const field of definition.fields) {
      const value = node.config?.[field.key];
      if (field.required && isBlank(value)) {
        errors.push({
          code: "missing_field",
          message: `${label} is missing ${field.label.toLowerCase()}.`,
          nodeId: node.id,
          field: field.key,
        });
        continue;
      }
      if (field.type === "mapping" && Array.isArray(value)) {
        const rows = value as Array<{ column?: string; value?: string }>;
        const filled = rows.filter((r) => r && (r.column || "").trim());
        if (field.required && filled.length === 0) {
          errors.push({
            code: "missing_field",
            message: `${label} needs at least one column mapping.`,
            nodeId: node.id,
            field: field.key,
          });
        }
        if (rows.some((r) => r && !(r.column || "").trim() && (r.value || "").trim())) {
          warnings.push({
            code: "mapping_without_column",
            message: `${label} has a value without a column name.`,
            nodeId: node.id,
            field: field.key,
          });
        }
      }
      if (field.type === "number" && value !== undefined && value !== "") {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          errors.push({
            code: "invalid_number",
            message: `${label}: ${field.label} must be a number.`,
            nodeId: node.id,
            field: field.key,
          });
        } else if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
          errors.push({
            code: "number_out_of_range",
            message: `${label}: ${field.label} must be between ${field.min ?? "-∞"} and ${field.max ?? "∞"}.`,
            nodeId: node.id,
            field: field.key,
          });
        }
      }
      if (field.type === "select" && value !== undefined && value !== "" && field.options) {
        if (!field.options.some((o) => o.value === value)) {
          errors.push({
            code: "invalid_option",
            message: `${label}: choose a valid option for ${field.label}.`,
            nodeId: node.id,
            field: field.key,
          });
        }
      }
      if (field.key === "to" && node.type === "gmail.send_email" && typeof value === "string" && value.trim() && !hasVariables(value)) {
        const emails = value.split(",").map((s) => s.trim()).filter(Boolean);
        const valid = emails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        if (!valid) {
          errors.push({
            code: "invalid_email",
            message: `${label}: “${value}” is not a valid email address.`,
            nodeId: node.id,
            field: "to",
          });
        }
      }
      if (field.key === "time" && typeof value === "string" && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        errors.push({
          code: "invalid_time",
          message: `${label}: time must use 24-hour HH:MM format, e.g. 09:00.`,
          nodeId: node.id,
          field: "time",
        });
      }
      // Variable references
      if (field.supportsVariables && typeof value === "string") {
        for (const ref of extractVariableRefs(value)) {
          const refNode = nodeMap.get(ref.nodeId);
          if (!refNode) {
            errors.push({
              code: "unknown_variable",
              message: `${label} references {{${ref.nodeId}.${ref.path}}} but that step does not exist.`,
              nodeId: node.id,
              field: field.key,
            });
            continue;
          }
          const refIndex = orderIndex.get(ref.nodeId);
          const ownIndex = orderIndex.get(node.id);
          if (refIndex === undefined || ownIndex === undefined || refIndex >= ownIndex) {
            errors.push({
              code: "invalid_variable_order",
              message: `${label} references {{${ref.nodeId}.${ref.path}}} before that step has run.`,
              nodeId: node.id,
              field: field.key,
            });
          }
          if (refNode.type === "ai.extract" && ref.path.split(".")[0] === "extracted") {
            warnings.push({
              code: "extracted_object_reference",
              message: `${label}: reference individual extracted fields (e.g. {{${ref.nodeId}.email}}) instead of the whole object.`,
              nodeId: node.id,
              field: field.key,
            });
          }
        }
        if (/\{\{(?!\s*[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+\s*\}\})/.test(value)) {
          warnings.push({
            code: "malformed_variable",
            message: `${label}: a variable looks malformed. Use {{step_id.field}}.`,
            nodeId: node.id,
            field: field.key,
          });
        }
      }
    }
  }

  // Endpoint detection for readability warnings
  const lastNodes = def.nodes.filter((n) => (outgoing.get(n.id) ?? []).length === 0 && !isTriggerType(n.type));
  if (lastNodes.length === 0 && def.nodes.length > 1) {
    warnings.push({
      code: "no_endpoint",
      message: "This workflow has no final action. Add a step that produces a result.",
    });
  }

  const requiredIntegrations = requiredIntegrationsForTypes(def.nodes.map((n) => n.type));

  if (options.checkIntegrations) {
    for (const provider of requiredIntegrations) {
      const status = options.connectionStatus?.[provider] ?? "disconnected";
      if (mode === "live" && status !== "connected") {
        const label = provider === "google_sheets" ? "Google Sheets" : provider === "gmail" ? "Gmail" : "FlowMate AI";
        errors.push({
          code: "integration_not_connected",
          message:
            status === "demo"
              ? `${label} is connected in demo mode only. Connect a real account to run live.`
              : status === "setup_required"
                ? `${label} setup is required on the server. Simulation mode is still available.`
                : `${label} is not connected. Connect it in Integrations before running live.`,
        });
      }
    }
  }

  const hasDemoOnly = def.nodes.some((n) => getNodeDefinition(n.type)?.demoOnly);
  if (hasDemoOnly && mode === "simulation") {
    warnings.push({
      code: "simulation_workflow",
      message: "This workflow includes simulation-only steps. Results are clearly labelled as simulated.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredIntegrations,
    triggerId: trigger?.id ?? null,
    order,
    nodeCount: def.nodes.length,
  };
}

/** Rough graph summary used by the AI planner and the overview panel. */
export function summarizeDefinition(def: WorkflowDefinition): string {
  const trigger = findTrigger(def);
  const order = topologicalOrder(def) ?? def.nodes.map((n) => n.id);
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const parts = order
    .map((id) => byId.get(id))
    .filter((n): n is WorkflowNode => Boolean(n))
    .map((n) => n.title || getNodeDefinition(n.type)?.title || n.type);
  return trigger ? `Starts with ${parts[0] ?? "a trigger"}, then ${parts.slice(1).join(" → ") || "no actions"}.` : "No trigger configured.";
}

export function normalizeDefinition(input: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.parse(input);
  return {
    ...parsed,
    nodes: parsed.nodes.map((node) => ({
      ...node,
      config: sanitizeNodeConfig(node.type, node.config),
      position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 },
    })),
  };
}

export function autoLayout(def: WorkflowDefinition): WorkflowDefinition {
  const order = topologicalOrder(def) ?? def.nodes.map((n) => n.id);
  const columns = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const e of def.edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }
  for (const id of order) {
    const parents = incoming.get(id) ?? [];
    const col = parents.length ? Math.max(...parents.map((p) => (columns.get(p) ?? 0) + 1)) : 0;
    columns.set(id, col);
  }
  const perColumn = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of order) {
    const col = columns.get(id) ?? 0;
    const row = perColumn.get(col) ?? 0;
    perColumn.set(col, row + 1);
    positions.set(id, { x: 80 + col * 300, y: 90 + row * 180 });
  }
  return {
    ...def,
    nodes: def.nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
  };
}

/** Provider requirement check used by the editor without a server round trip. */
export function workflowProviders(def: WorkflowDefinition): ProviderId[] {
  return requiredIntegrationsForTypes(def.nodes.map((n) => n.type));
}

export function providerOfType(type: string): ProviderId | undefined {
  return providerForNode(type);
}
