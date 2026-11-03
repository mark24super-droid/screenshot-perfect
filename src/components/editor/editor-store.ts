import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  NODE_SPECS,
  type NodeType,
  type WorkflowDefinition,
} from "@/lib/workflow-schema";

export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  config: Record<string, unknown>;
}

export type FlowNode = Node<FlowNodeData, "flowmate">;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Snapshot {
  nodes: FlowNode[];
  edges: Edge[];
}

interface LoadPayload {
  workflowId: string;
  name: string;
  description: string;
  status: string;
  definition: WorkflowDefinition;
}

interface EditorState {
  workflowId: string;
  name: string;
  description: string;
  status: string;
  nodes: FlowNode[];
  edges: Edge[];
  viewport: Viewport;
  selectedId: string | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  past: Snapshot[];
  future: Snapshot[];

  load: (payload: LoadPayload) => void;
  setMeta: (patch: { name?: string; description?: string }) => void;
  setStatus: (status: string) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  connect: (connection: Connection) => boolean;
  addNode: (type: NodeType, position?: { x: number; y: number }) => string;
  updateConfig: (nodeId: string, key: string, value: unknown) => void;
  selectNode: (id: string | null) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  undo: () => void;
  redo: () => void;
  markSaving: () => void;
  markSaved: (status?: string) => void;
  markSaveFailed: () => void;
  toDefinition: () => WorkflowDefinition;
}

const MAX_HISTORY = 50;

function toFlowNode(node: WorkflowDefinition["nodes"][number], index: number): FlowNode {
  return {
    id: node.id,
    type: "flowmate",
    position: node.position ?? { x: 120 + index * 260, y: 160 },
    data: { nodeType: node.type, config: node.config ?? {} },
  };
}

function toFlowEdge(edge: WorkflowDefinition["edges"][number]): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
  };
}

function snapshot(state: EditorState): Snapshot {
  return { nodes: state.nodes, edges: state.edges };
}

function uniqueNodeId(type: NodeType, nodes: FlowNode[]): string {
  const base = type.replace(/\./g, "_");
  let i = 1;
  let id = `${base}_${i}`;
  const existing = new Set(nodes.map((n) => n.id));
  while (existing.has(id)) {
    i += 1;
    id = `${base}_${i}`;
  }
  return id;
}

/** True when every required field for the node has a non-empty value. */
export function nodeIsConfigured(node: FlowNode): boolean {
  const spec = NODE_SPECS[node.data.nodeType];
  if (!spec) return false;
  for (const field of spec.requiredFields ?? []) {
    const v = node.data.config[field.key];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return false;
  }
  if (node.data.nodeType === "ai.extract") {
    const fields = node.data.config["fields"];
    if (!Array.isArray(fields) || fields.length === 0) return false;
  }
  return true;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  workflowId: "",
  name: "",
  description: "",
  status: "draft",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedId: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  past: [],
  future: [],

  load: ({ workflowId, name, description, status, definition }) =>
    set({
      workflowId,
      name,
      description,
      status,
      nodes: definition.nodes.map(toFlowNode),
      edges: definition.edges.map(toFlowEdge),
      viewport: definition.viewport,
      selectedId: null,
      dirty: false,
      saving: false,
      past: [],
      future: [],
    }),

  setMeta: (patch) =>
    set((state) => ({
      ...patch,
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    })),

  setStatus: (status) => set({ status }),

  onNodesChange: (changes) =>
    set((state) => {
      const structural = changes.some((c) => c.type === "position" || c.type === "remove" || c.type === "add");
      const nodes = applyNodeChanges(changes, state.nodes);
      const removed = new Set(
        changes.filter((c): c is { type: "remove"; id: string } => c.type === "remove").map((c) => c.id),
      );
      return {
        nodes,
        edges: removed.size ? state.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : state.edges,
        selectedId: state.selectedId && removed.has(state.selectedId) ? null : state.selectedId,
        dirty: structural ? true : state.dirty,
        past: structural ? [...state.past, snapshot(state)].slice(-MAX_HISTORY) : state.past,
        future: structural ? [] : state.future,
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    })),

  connect: (connection) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;
    const state = get();
    const target = state.nodes.find((n) => n.id === connection.target);
    if (!target) return false;
    if (NODE_SPECS[target.data.nodeType]?.kind === "trigger") return false;
    if (state.edges.some((e) => e.source === connection.source && e.target === connection.target)) return false;
    // Reject cycles so execution always has a valid topological order.
    const adjacency = new Map<string, string[]>();
    for (const e of state.edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
    const stack = [connection.target];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === connection.source) return false;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adjacency.get(cur) ?? []) stack.push(next);
    }
    set({
      edges: [
        ...state.edges,
        {
          id: `edge_${Date.now().toString(36)}`,
          source: connection.source,
          target: connection.target,
          type: "smoothstep",
        },
      ],
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    });
    return true;
  },

  addNode: (type, position) => {
    const state = get();
    const id = uniqueNodeId(type, state.nodes);
    // Place new nodes to the right of whatever is selected (or the trigger).
    const anchor = state.nodes.find((n) => n.id === state.selectedId) ?? state.nodes.find((n) => NODE_SPECS[n.data.nodeType]?.kind === "trigger");
    const pos = position ?? (anchor ? { x: anchor.position.x + 280, y: anchor.position.y } : { x: 120, y: 160 });
    const node: FlowNode = { id, type: "flowmate", position: pos, data: { nodeType: type, config: defaultConfig(type) } };
    const edges = [...state.edges];
    if (anchor && NODE_SPECS[type]?.kind !== "trigger") {
      edges.push({
        id: `edge_${Date.now().toString(36)}`,
        source: anchor.id,
        target: id,
        type: "smoothstep",
      });
    }
    set({
      nodes: [...state.nodes, node],
      edges,
      selectedId: id,
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    });
    return id;
  },

  updateConfig: (nodeId, key, value) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } } : n,
      ),
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    })),

  selectNode: (id) => set({ selectedId: id }),

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      dirty: true,
      past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
      future: [],
    })),

  duplicateNode: (id) =>
    set((state) => {
      const source = state.nodes.find((n) => n.id === id);
      if (!source) return state;
      const newId = uniqueNodeId(source.data.nodeType, state.nodes);
      const copy: FlowNode = {
        ...source,
        id: newId,
        position: { x: source.position.x + 40, y: source.position.y + 80 },
        selected: false,
        data: {
          nodeType: source.data.nodeType,
          config: JSON.parse(JSON.stringify(source.data.config)) as Record<string, unknown>,
        },
      };
      return {
        nodes: [...state.nodes, copy],
        selectedId: newId,
        dirty: true,
        past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
        future: [],
      };
    }),

  setViewport: (viewport) => set({ viewport }),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
        selectedId: null,
        dirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        nodes: next.nodes,
        edges: next.edges,
        future: state.future.slice(1),
        past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
        selectedId: null,
        dirty: true,
      };
    }),

  markSaving: () => set({ saving: true }),
  markSaved: (status) => set({ saving: false, dirty: false, lastSavedAt: new Date().toISOString(), ...(status ? { status } : {}) }),
  markSaveFailed: () => set({ saving: false }),

  toDefinition: () => {
    const state = get();
    return {
      nodes: state.nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        config: n.data.config,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      })),
      edges: state.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      viewport: state.viewport,
    };
  },
}));

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "logic.filter":
      return { operator: "contains" };
    case "ai.summarize":
      return { style: "paragraph", maxLength: 120 };
    case "ai.extract":
      return { fields: [] };
    case "google_sheets.add_row":
    case "google_sheets.find_row":
    case "google_sheets.new_row":
      return { worksheet: "Sheet1" };
    default:
      return {};
  }
}
