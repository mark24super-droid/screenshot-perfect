import { create } from "zustand";
import {
  autoLayout as layoutDefinition,
  sanitizeNodeConfig,
  validateDefinition,
  type IntegrationStatus,
  type ValidationResult,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@shared/workflow";
import {
  defaultConfigFor,
  getNodeDefinition,
  isSupportedNodeType,
  isTriggerType,
  type ProviderId,
} from "@shared/nodes";
import type { WorkflowDetail } from "../../lib/types";

const HISTORY_LIMIT = 60;

export interface EditorConnections {
  gmail: IntegrationStatus;
  google_sheets: IntegrationStatus;
  ai: IntegrationStatus;
}

interface AddNodeOptions {
  afterNodeId?: string;
  beforeNodeId?: string;
  position?: { x: number; y: number };
}

interface AddNodeResult {
  id?: string;
  error?: string;
}

interface EditorState {
  workflowId: string | null;
  name: string;
  description: string;
  status: string;
  version: number;
  updatedAt: string | null;
  definition: WorkflowDefinition;
  mode: "simulation" | "live";
  connections: EditorConnections;
  selectedNodeId: string | null;
  past: WorkflowDefinition[];
  future: WorkflowDefinition[];
  dirty: boolean;
  revision: number;
  lastSavedAt: string | null;
  validation: ValidationResult;
  loading: boolean;
  loadError: string | null;

  load: (detail: WorkflowDetail, aiConfigured: boolean) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setMode: (mode: "simulation" | "live") => void;
  setSelected: (id: string | null) => void;
  beginEdit: () => void;
  addNode: (type: string, options?: AddNodeOptions) => AddNodeResult;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeTitle: (id: string, title: string) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  connect: (source: string, target: string) => { ok: boolean; error?: string };
  deleteEdge: (id: string) => void;
  runAutoLayout: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (input: { version?: number; status?: string; revision: number }) => void;
  setLoadError: (message: string) => void;
  setLoading: (loading: boolean) => void;
}

const EMPTY_DEFINITION: WorkflowDefinition = { version: 1, nodes: [], edges: [] };

function clone(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}

function emptyValidation(): ValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    requiredIntegrations: [],
    triggerId: null,
    order: [],
    nodeCount: 0,
  };
}

function validate(definition: WorkflowDefinition, mode: "simulation" | "live", connections: EditorConnections): ValidationResult {
  return validateDefinition(definition, {
    mode,
    checkIntegrations: mode === "live",
    connectionStatus: connections as Partial<Record<ProviderId, IntegrationStatus>>,
  });
}

function nextNodeId(definition: WorkflowDefinition, type: string): string {
  const base = type.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "step";
  const existing = new Set(definition.nodes.map((node) => node.id));
  let index = 1;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function edgeId(source: string, target: string, definition: WorkflowDefinition): string {
  const base = `e_${source}_${target}`;
  const existing = new Set(definition.edges.map((edge) => edge.id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function defaultPosition(definition: WorkflowDefinition): { x: number; y: number } {
  if (definition.nodes.length === 0) return { x: 80, y: 140 };
  const rightmost = definition.nodes.reduce((best, node) => (node.position.x > best.position.x ? node : best), definition.nodes[0]);
  return { x: rightmost.position.x + 300, y: Math.max(80, rightmost.position.y) };
}

function replaceNode(definition: WorkflowDefinition, id: string, update: (node: WorkflowNode) => WorkflowNode): WorkflowDefinition {
  return { ...definition, nodes: definition.nodes.map((node) => (node.id === id ? update(node) : node)) };
}

function pushHistory(state: EditorState, definition: WorkflowDefinition): Pick<EditorState, "past" | "future"> {
  return {
    past: [...state.past, clone(state.definition)].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  workflowId: null,
  name: "",
  description: "",
  status: "draft",
  version: 0,
  updatedAt: null,
  definition: EMPTY_DEFINITION,
  mode: "simulation",
  connections: { gmail: "disconnected", google_sheets: "disconnected", ai: "setup_required" },
  selectedNodeId: null,
  past: [],
  future: [],
  dirty: false,
  revision: 0,
  lastSavedAt: null,
  validation: emptyValidation(),
  loading: true,
  loadError: null,

  load: (detail, aiConfigured) => {
    const definition = detail.definition ?? EMPTY_DEFINITION;
    const mode = detail.runMode === "live" ? "live" : "simulation";
    const connections: EditorConnections = {
      gmail: detail.connections.gmail,
      google_sheets: detail.connections.google_sheets,
      ai: aiConfigured ? "connected" : "setup_required",
    };
    set({
      workflowId: detail.id,
      name: detail.name,
      description: detail.description,
      status: detail.status,
      version: detail.version,
      updatedAt: detail.updatedAt,
      definition: clone(definition),
      mode,
      connections,
      selectedNodeId: definition.nodes[0]?.id ?? null,
      past: [],
      future: [],
      dirty: false,
      revision: 0,
      lastSavedAt: detail.updatedAt,
      validation: validate(definition, mode, connections),
      loading: false,
      loadError: null,
    });
  },

  setLoading: (loading) => set({ loading }),
  setLoadError: (message) => set({ loadError: message, loading: false }),

  setName: (name) =>
    set((state) => ({
      name: name.slice(0, 120),
      dirty: true,
      revision: state.revision + 1,
    })),

  setDescription: (description) =>
    set((state) => ({
      description: description.slice(0, 500),
      dirty: true,
      revision: state.revision + 1,
    })),

  setMode: (mode) =>
    set((state) => ({
      mode,
      validation: validate(state.definition, mode, state.connections),
    })),

  setSelected: (id) => set({ selectedNodeId: id }),

  beginEdit: () =>
    set((state) => ({
      ...pushHistory(state, state.definition),
      revision: state.revision + 1,
      dirty: true,
    })),

  addNode: (type, options = {}) => {
    const state = get();
    const definitionInfo = getNodeDefinition(type);
    if (!definitionInfo || !isSupportedNodeType(type)) {
      return { error: "That step type is not supported." };
    }
    if (definitionInfo.kind === "trigger" && state.definition.nodes.some((node) => isTriggerType(node.type))) {
      return { error: "This workflow already has a trigger. Remove the existing trigger before adding another." };
    }
    if (definitionInfo.demoOnly && state.mode === "live") {
      return { error: `${definitionInfo.title} is only available in simulation mode in this release.` };
    }

    const id = nextNodeId(state.definition, type);
    const node: WorkflowNode = {
      id,
      type,
      title: definitionInfo.title,
      config: defaultConfigFor(type),
      position: options.position ?? defaultPosition(state.definition),
    };

    let nextDefinition: WorkflowDefinition = {
      ...state.definition,
      nodes: [...state.definition.nodes, node],
    };

    if (options.afterNodeId && state.definition.nodes.some((existing) => existing.id === options.afterNodeId)) {
      const source = options.afterNodeId;
      let target = options.beforeNodeId;
      if (!target) {
        const existingOutgoing = nextDefinition.edges.find((edge) => edge.source === source);
        target = existingOutgoing?.target;
      }
      nextDefinition = {
        ...nextDefinition,
        edges: nextDefinition.edges.filter((edge) => !(edge.source === source && (!target || edge.target === target))),
      };
      nextDefinition.edges.push({ id: edgeId(source, id, nextDefinition), source, target: id });
      if (target) {
        nextDefinition.edges.push({ id: edgeId(id, target, nextDefinition), source: id, target });
      }
    }

    set({
      ...pushHistory(state, state.definition),
      definition: nextDefinition,
      selectedNodeId: id,
      dirty: true,
      revision: state.revision + 1,
      validation: validate(nextDefinition, state.mode, state.connections),
    });
    return { id };
  },

  updateNodeConfig: (id, config) =>
    set((state) => {
      const node = state.definition.nodes.find((item) => item.id === id);
      if (!node) return state;
      const nextDefinition = replaceNode(state.definition, id, (current) => ({
        ...current,
        config: sanitizeNodeConfig(current.type, config),
      }));
      return {
        definition: nextDefinition,
        dirty: true,
        revision: state.revision + 1,
        validation: validate(nextDefinition, state.mode, state.connections),
      };
    }),

  updateNodeTitle: (id, title) =>
    set((state) => {
      const nextDefinition = replaceNode(state.definition, id, (current) => ({
        ...current,
        title: title.slice(0, 120),
      }));
      return {
        definition: nextDefinition,
        dirty: true,
        revision: state.revision + 1,
        validation: validate(nextDefinition, state.mode, state.connections),
      };
    }),

  moveNode: (id, position) =>
    set((state) => {
      const nextDefinition = replaceNode(state.definition, id, (current) => ({
        ...current,
        position: { x: Math.round(position.x), y: Math.round(position.y) },
      }));
      return {
        definition: nextDefinition,
        dirty: true,
        revision: state.revision + 1,
      };
    }),

  deleteNode: (id) =>
    set((state) => {
      if (!state.definition.nodes.some((node) => node.id === id)) return state;
      const nextDefinition: WorkflowDefinition = {
        ...state.definition,
        nodes: state.definition.nodes.filter((node) => node.id !== id),
        edges: state.definition.edges.filter((edge) => edge.source !== id && edge.target !== id),
      };
      return {
        ...pushHistory(state, state.definition),
        definition: nextDefinition,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        dirty: true,
        revision: state.revision + 1,
        validation: validate(nextDefinition, state.mode, state.connections),
      };
    }),

  connect: (source, target) => {
    const state = get();
    if (source === target) return { ok: false, error: "A step cannot connect to itself." };
    const sourceNode = state.definition.nodes.find((node) => node.id === source);
    const targetNode = state.definition.nodes.find((node) => node.id === target);
    if (!sourceNode || !targetNode) return { ok: false, error: "One of those steps no longer exists." };
    if (isTriggerType(targetNode.type)) return { ok: false, error: "A trigger must be the first step and cannot receive connections." };
    if (state.definition.edges.some((edge) => edge.source === source && edge.target === target)) {
      return { ok: false, error: "Those steps are already connected." };
    }
    if (state.definition.edges.some((edge) => edge.source === source)) {
      return { ok: false, error: "Each step can connect to one next step in this release. Delete the existing connection first." };
    }
    if (state.definition.edges.some((edge) => edge.target === target)) {
      return { ok: false, error: "That step already has an incoming connection. Delete it first." };
    }
    const nextDefinition: WorkflowDefinition = {
      ...state.definition,
      edges: [...state.definition.edges, { id: edgeId(source, target, state.definition), source, target }],
    };
    set({
      ...pushHistory(state, state.definition),
      definition: nextDefinition,
      dirty: true,
      revision: state.revision + 1,
      validation: validate(nextDefinition, state.mode, state.connections),
    });
    return { ok: true };
  },

  deleteEdge: (id) =>
    set((state) => {
      if (!state.definition.edges.some((edge) => edge.id === id)) return state;
      const nextDefinition: WorkflowDefinition = {
        ...state.definition,
        edges: state.definition.edges.filter((edge) => edge.id !== id),
      };
      return {
        ...pushHistory(state, state.definition),
        definition: nextDefinition,
        dirty: true,
        revision: state.revision + 1,
        validation: validate(nextDefinition, state.mode, state.connections),
      };
    }),

  runAutoLayout: () =>
    set((state) => {
      const nextDefinition = layoutDefinition(state.definition);
      return {
        ...pushHistory(state, state.definition),
        definition: nextDefinition,
        dirty: true,
        revision: state.revision + 1,
        validation: validate(nextDefinition, state.mode, state.connections),
      };
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        definition: previous,
        past: state.past.slice(0, -1),
        future: [clone(state.definition), ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        revision: state.revision + 1,
        selectedNodeId: previous.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
        validation: validate(previous, state.mode, state.connections),
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        definition: next,
        past: [...state.past, clone(state.definition)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: true,
        revision: state.revision + 1,
        selectedNodeId: next.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
        validation: validate(next, state.mode, state.connections),
      };
    }),

  markSaved: ({ version, status, revision }) =>
    set((state) => ({
      version: version ?? state.version,
      status: status ?? state.status,
      lastSavedAt: new Date().toISOString(),
      dirty: state.revision !== revision,
    })),
}));
