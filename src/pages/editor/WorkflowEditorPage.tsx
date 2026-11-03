import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  FlaskConical,
  History,
  LayoutGrid,
  Maximize2,
  Menu,
  MoreHorizontal,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Radio,
  Redo2,
  Save,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getNodeDefinition, isTriggerType } from "@shared/nodes";
import { ShellContext } from "../../components/layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import { Badge, Skeleton, Spinner, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { DropdownMenu } from "../../components/ui/Dropdown";
import { ErrorState } from "../../components/ui/Misc";
import { useToast } from "../../components/ui/Toast";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError, errorMessage } from "../../lib/api";
import type { WorkflowDetail } from "../../lib/types";
import { cn, relativeTime } from "../../lib/utils";
import { Inspector } from "../../features/editor/Inspector";
import { NodePicker } from "../../features/editor/NodePicker";
import { TestDialog } from "../../features/editor/TestDialog";
import { ValidationPanel } from "../../features/editor/ValidationPanel";
import { WorkflowEdge, type EditorFlowEdge } from "../../features/editor/WorkflowEdge";
import { WorkflowNodeCard, type EditorFlowNode } from "../../features/editor/WorkflowNodeCard";
import { useEditorStore } from "../../features/editor/editorStore";

const NODE_TYPES = { fm: WorkflowNodeCard } as unknown as NodeTypes;
const EDGE_TYPES = { fm: WorkflowEdge } as unknown as EdgeTypes;

type Busy = "save" | "activate" | "pause" | "duplicate" | "delete" | "run" | null;

interface InsertContext {
  afterNodeId?: string;
  beforeNodeId?: string;
}

function useIsMobile() {
  const [mobile, setMobile] = React.useState(() => (typeof window === "undefined" ? false : window.innerWidth < 1024));
  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function WorkflowEditorPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}

function WorkflowEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, flags, workspace } = useAuth();
  const { openMobileNav } = React.useContext(ShellContext);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  const workflowId = useEditorStore((state) => state.workflowId);
  const name = useEditorStore((state) => state.name);
  const description = useEditorStore((state) => state.description);
  const status = useEditorStore((state) => state.status);
  const version = useEditorStore((state) => state.version);
  const definition = useEditorStore((state) => state.definition);
  const mode = useEditorStore((state) => state.mode);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const dirty = useEditorStore((state) => state.dirty);
  const revision = useEditorStore((state) => state.revision);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const validation = useEditorStore((state) => state.validation);
  const past = useEditorStore((state) => state.past);
  const future = useEditorStore((state) => state.future);
  const loading = useEditorStore((state) => state.loading);

  const load = useEditorStore((state) => state.load);
  const setName = useEditorStore((state) => state.setName);
  const setSelected = useEditorStore((state) => state.setSelected);
  const setMode = useEditorStore((state) => state.setMode);
  const addNode = useEditorStore((state) => state.addNode);
  const deleteNode = useEditorStore((state) => state.deleteNode);
  const deleteEdge = useEditorStore((state) => state.deleteEdge);
  const connect = useEditorStore((state) => state.connect);
  const moveNode = useEditorStore((state) => state.moveNode);
  const runAutoLayout = useEditorStore((state) => state.runAutoLayout);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const markSaved = useEditorStore((state) => state.markSaved);
  const setLoadError = useEditorStore((state) => state.setLoadError);

  const [nodes, setNodes, onNodesChange] = useNodesState<EditorFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EditorFlowEdge>([]);

  const [loadingWorkflow, setLoadingWorkflow] = React.useState(true);
  const [loadError, setLoadErrorState] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [insertContext, setInsertContext] = React.useState<InsertContext>({});
  const [deleteNodeId, setDeleteNodeId] = React.useState<string | null>(null);
  const [deleteWorkflowOpen, setDeleteWorkflowOpen] = React.useState(false);
  const [activateOpen, setActivateOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [validationOpen, setValidationOpen] = React.useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = React.useState(false);

  const savePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const saveBehavior = user?.settings.saveBehavior ?? "autosave";

  const fetchWorkflow = React.useCallback(async () => {
    setLoadingWorkflow(true);
    setLoadErrorState(null);
    try {
      const detail = await apiGet<WorkflowDetail>(`/workflows/${id}`);
      load(detail, flags.aiProviderConfigured);
    } catch (error) {
      const message = errorMessage(error);
      setLoadErrorState(message);
      setLoadError(message);
    } finally {
      setLoadingWorkflow(false);
    }
  }, [id, flags.aiProviderConfigured, load, setLoadError]);

  React.useEffect(() => {
    void fetchWorkflow();
  }, [fetchWorkflow]);

  React.useEffect(() => {
    if (!name) return;
    document.title = `${name} · FlowMate AI`;
    return () => {
      document.title = "FlowMate AI";
    };
  }, [name]);

  React.useEffect(() => {
    if (loadingWorkflow) return;
    const timer = window.setTimeout(() => fitView({ padding: 0.28, duration: 280, maxZoom: 1 }), 180);
    return () => window.clearTimeout(timer);
  }, [loadingWorkflow, workflowId, fitView]);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const openPicker = React.useCallback((context: InsertContext = {}) => {
    setInsertContext(context);
    setPickerOpen(true);
  }, []);

  const requestDeleteNode = React.useCallback((nodeId: string) => {
    setDeleteNodeId(nodeId);
  }, []);

  const handleInsertEdge = React.useCallback(
    (source: string, target: string) => {
      openPicker({ afterNodeId: source, beforeNodeId: target });
    },
    [openPicker],
  );

  const handleDeleteEdge = React.useCallback(
    (edgeId: string) => {
      deleteEdge(edgeId);
      toast({ title: "Connection removed", description: "The steps are still on the canvas. Use undo to restore the connection.", variant: "info" });
    },
    [deleteEdge, toast],
  );

  const outgoingSources = React.useMemo(() => new Set(definition.edges.map((edge) => edge.source)), [definition.edges]);

  React.useEffect(() => {
    const nextNodes: EditorFlowNode[] = definition.nodes.map((node) => ({
      id: node.id,
      type: "fm",
      position: node.position,
      selected: node.id === selectedNodeId,
      data: {
        node,
        errors: validation.errors.filter((issue) => issue.nodeId === node.id),
        warnings: validation.warnings.filter((issue) => issue.nodeId === node.id),
        hasOutgoing: outgoingSources.has(node.id),
        onAddAfter: (nodeId: string) => openPicker({ afterNodeId: nodeId }),
        onDelete: requestDeleteNode,
      },
    }));
    setNodes(nextNodes);
  }, [definition, validation, selectedNodeId, outgoingSources, openPicker, requestDeleteNode, setNodes]);

  React.useEffect(() => {
    const nextEdges: EditorFlowEdge[] = definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "fm",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#b9bccb" },
      data: { onInsert: handleInsertEdge, onDelete: handleDeleteEdge },
    }));
    setEdges(nextEdges);
  }, [definition.edges, handleInsertEdge, handleDeleteEdge, setEdges]);

  const handleSave = React.useCallback(
    (options: { silent?: boolean } = {}): Promise<boolean> => {
      if (savePromiseRef.current) return savePromiseRef.current;
      const promise = (async () => {
        const state = useEditorStore.getState();
        if (!id) return false;
        if (!state.dirty) {
          if (!options.silent) toast({ title: "Everything is saved", description: "There are no unsaved changes.", variant: "info" });
          return true;
        }
        if (!state.name.trim()) {
          toast({ title: "Name required", description: "Give your automation a name before saving.", variant: "error" });
          return false;
        }
        const revisionAtSave = state.revision;
        setBusy("save");
        try {
          const detail = await apiPatch<WorkflowDetail>(`/workflows/${id}`, {
            name: state.name.trim(),
            description: state.description,
            definition: state.definition,
          });
          markSaved({ version: detail.version, status: detail.status, revision: revisionAtSave });
          if (detail.save?.statusNote) {
            setValidationOpen(true);
            toast({ title: "Saved, but needs attention", description: detail.save.statusNote, variant: "warning" });
          } else if (!options.silent) {
            toast({ title: "Automation saved", description: "A new version is stored if the steps changed.", variant: "success" });
          }
          return true;
        } catch (error) {
          toast({ title: "Could not save", description: errorMessage(error), variant: "error" });
          return false;
        } finally {
          setBusy(null);
        }
      })();
      savePromiseRef.current = promise;
      void promise.finally(() => {
        if (savePromiseRef.current === promise) savePromiseRef.current = null;
      });
      return promise;
    },
    [id, markSaved, toast],
  );

  React.useEffect(() => {
    if (saveBehavior !== "autosave" || !dirty || loadingWorkflow || !id || !name.trim()) return;
    const timer = window.setTimeout(() => {
      void handleSave({ silent: true });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [saveBehavior, dirty, revision, loadingWorkflow, id, name, handleSave]);

  const handlePick = (type: string) => {
    const result = addNode(type, insertContext);
    if (result.error) {
      toast({ title: "Step not added", description: result.error, variant: "error" });
      return;
    }
    const label = getNodeDefinition(type)?.title ?? type;
    setPickerOpen(false);
    setInsertContext({});
    if (isMobile) setMobileInspectorOpen(true);
    toast({ title: `${label} added`, description: "Configure it in the step inspector, then connect it to the workflow.", variant: "success" });
  };

  const handleDeleteNodeConfirm = () => {
    if (!deleteNodeId) return;
    deleteNode(deleteNodeId);
    setDeleteNodeId(null);
    if (isMobile) setMobileInspectorOpen(false);
    toast({ title: "Step deleted", description: "Use undo in the toolbar to restore it.", variant: "info" });
  };

  const handleAutoLayout = () => {
    runAutoLayout();
    window.setTimeout(() => fitView({ padding: 0.28, duration: 280, maxZoom: 1 }), 80);
    toast({ title: "Steps rearranged", description: "Connections are unchanged. Undo restores the previous positions.", variant: "info" });
  };

  const requestActivate = () => {
    if (definition.nodes.length < 2) {
      toast({
        title: "Add an action step first",
        description: "An automation needs a trigger and at least one action before it can be activated.",
        variant: "warning",
      });
      return;
    }
    if (!validation.valid) {
      setValidationOpen(true);
      toast({ title: "Fix blocking issues first", description: `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} must be resolved before activation.`, variant: "error" });
      return;
    }
    setActivateOpen(true);
  };

  const handleActivate = async () => {
    setActivateOpen(false);
    const saved = await handleSave({ silent: true });
    if (!saved) return;
    setBusy("activate");
    try {
      const detail = await apiPost<WorkflowDetail>(`/workflows/${id}/activate`, { mode });
      load(detail, flags.aiProviderConfigured);
      setValidationOpen(false);
      setMobileInspectorOpen(false);
      toast({
        title: "Automation activated",
        description:
          mode === "live"
            ? "Live mode is on. Scheduled or manual runs can now use your connected Gmail and Google Sheets accounts."
            : "Simulation mode is on. Runs use deterministic adapters and never contact external providers.",
        variant: "success",
      });
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        setValidationOpen(true);
      }
      toast({ title: "Could not activate", description: errorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handlePause = async () => {
    setBusy("pause");
    try {
      const detail = await apiPost<WorkflowDetail>(`/workflows/${id}/pause`);
      load(detail, flags.aiProviderConfigured);
      toast({ title: "Automation paused", description: "Scheduled runs will not start while the automation is paused.", variant: "info" });
    } catch (error) {
      toast({ title: "Could not pause", description: errorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleRunNow = async () => {
    const saved = await handleSave({ silent: true });
    if (!saved) return;
    setBusy("run");
    try {
      const result = await apiPost<{ executionId: string }>(`/workflows/${id}/run`, { mode });
      toast({ title: "Run queued", description: "Opening the execution log. The run may still be in progress.", variant: "success" });
      navigate(`/history/${result.executionId}`);
    } catch (error) {
      toast({ title: "Could not start the run", description: errorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = async () => {
    const saved = await handleSave({ silent: true });
    if (!saved) return;
    setBusy("duplicate");
    try {
      const detail = await apiPost<WorkflowDetail>(`/workflows/${id}/duplicate`);
      toast({ title: "Automation duplicated", description: "The copy is a draft. Nothing is activated automatically.", variant: "success" });
      navigate(`/automations/${detail.id}`);
    } catch (error) {
      toast({ title: "Could not duplicate", description: errorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteWorkflow = async () => {
    setDeleteWorkflowOpen(false);
    setBusy("delete");
    try {
      await apiDelete(`/workflows/${id}`);
      toast({ title: "Automation deleted", description: "The automation and its execution records were removed.", variant: "info" });
      navigate("/automations");
    } catch (error) {
      toast({ title: "Could not delete", description: errorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleExport = () => {
    const slug = (name || "automation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "automation";
    const blob = new Blob([JSON.stringify({ name, description, definition }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Workflow exported", description: "The saved step definition was downloaded as JSON.", variant: "info" });
  };

  const handleBack = () => {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    navigate("/automations");
  };

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target
        ? target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable
        : false;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (editable) return;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId) {
        event.preventDefault();
        setDeleteNodeId(selectedNodeId);
        return;
      }
      if (event.key === "Escape") {
        setValidationOpen(false);
        setMobileInspectorOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, undo, redo, selectedNodeId, setSelected]);

  const handleConnect = React.useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const result = connect(connection.source, connection.target);
      if (!result.ok) {
        toast({ title: "Connection not created", description: result.error, variant: "error" });
      }
    },
    [connect, toast],
  );

  const handleNodeDragStop = React.useCallback(
    (_event: MouseEvent | TouchEvent, node: EditorFlowNode) => {
      moveNode(node.id, node.position);
    },
    [moveNode],
  );

  const issueCount = validation.errors.length;
  const warningCount = validation.warnings.length;
  const isActive = status === "active";
  const hasTrigger = definition.nodes.some((node) => isTriggerType(node.type));

  if (loadingWorkflow || loading) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex flex-1 items-center justify-center bg-white">
            <div className="flex items-center gap-2 text-[12px] text-ink-secondary">
              <Spinner /> Loading your workflow…
            </div>
          </div>
          <div className="hidden w-[340px] shrink-0 border-l border-line p-4 lg:block">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-20 w-full" />
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-2 h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-card">
          <ErrorState title="This automation could not be opened" description={loadError} onRetry={() => void fetchWorkflow()} />
          <div className="mt-4 flex justify-center">
            <Link to="/automations" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <ArrowLeft size={13} /> Back to automations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-white px-2 sm:gap-2 sm:px-3">
        <Button variant="ghost" size="icon-sm" onClick={openMobileNav} className="lg:hidden" aria-label="Open navigation" title="Open navigation">
          <Menu size={17} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleBack} aria-label="Back to automations" title="Back to automations">
          <ArrowLeft size={16} />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              aria-label="Automation name"
              className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-ink transition-colors hover:border-line focus:border-primary focus:bg-white focus:outline-none sm:max-w-[420px]"
              placeholder="Untitled automation"
            />
            <StatusBadge status={status} className="hidden sm:inline-flex" />
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden px-1.5 text-[10px] text-ink-secondary">
            <span className={cn("truncate", dirty && "font-medium text-amber-700")}>
              {dirty ? "Unsaved changes" : `Saved ${relativeTime(lastSavedAt)}`}
            </span>
            <span aria-hidden="true">·</span>
            <span>v{version || 1}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{definition.nodes.length} steps</span>
            {workspace?.isDemo ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 font-medium text-amber-700">Demo workspace</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={past.length === 0}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
            className="hidden sm:inline-flex"
          >
            <Undo2 size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
            className="hidden sm:inline-flex"
          >
            <Redo2 size={15} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleSave()}
            loading={busy === "save"}
            disabled={!dirty && busy !== null}
            title="Save (Ctrl/Cmd+S)"
          >
            {!dirty && busy !== "save" ? <CheckCircle2 size={14} className="text-success" /> : <Save size={14} />}
            <span className="hidden sm:inline">{dirty ? "Save" : "Saved"}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setTestOpen(true)} title="Test this automation">
            <FlaskConical size={14} />
            <span className="hidden md:inline">Test</span>
          </Button>
          <Button
            size="sm"
            variant={isActive ? "secondary" : "primary"}
            onClick={isActive ? () => void handlePause() : requestActivate}
            loading={busy === "activate" || busy === "pause"}
            title={isActive ? "Pause this automation" : "Activate this automation"}
          >
            {isActive ? <Pause size={14} /> : <Play size={14} />}
            <span className="hidden md:inline">{isActive ? "Pause" : "Activate"}</span>
          </Button>
          <DropdownMenu
            label="More automation actions"
            trigger={
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-app hover:text-ink">
                <MoreHorizontal size={17} />
              </span>
            }
            items={[
              { label: "Run now", icon: <Play size={14} />, onClick: () => void handleRunNow(), disabled: !isActive || busy !== null },
              { label: "View run history", icon: <History size={14} />, onClick: () => navigate(`/history?workflowId=${id}`) },
              { label: "Duplicate", icon: <Copy size={14} />, onClick: () => void handleDuplicate(), disabled: busy !== null },
              { label: "Export JSON", icon: <Download size={14} />, onClick: handleExport },
              { label: "Auto-arrange steps", icon: <LayoutGrid size={14} />, onClick: handleAutoLayout },
              { label: "Delete automation", icon: <Trash2 size={14} />, onClick: () => setDeleteWorkflowOpen(true), danger: true, separatorBefore: true },
            ]}
          />
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line bg-sidebar px-2 sm:gap-2 sm:px-3">
        <Button variant="secondary" size="sm" onClick={() => openPicker()} title="Add a step">
          <Plus size={14} /> <span className="hidden sm:inline">Add step</span>
        </Button>

        <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Run mode">
          <button
            type="button"
            aria-pressed={mode === "simulation"}
            onClick={() => setMode("simulation")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors",
              mode === "simulation" ? "bg-primary-soft text-primary" : "text-ink-secondary hover:bg-app hover:text-ink",
            )}
            title="Simulation uses deterministic adapters and never contacts providers"
          >
            <FlaskConical size={11} /> <span className="hidden sm:inline">Simulation</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "live"}
            onClick={() => setMode("live")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors",
              mode === "live" ? "bg-amber-50 text-amber-800" : "text-ink-secondary hover:bg-app hover:text-ink",
            )}
            title="Live mode can perform real Gmail and Google Sheets actions when connected"
          >
            <Radio size={11} /> <span className="hidden sm:inline">Live</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setValidationOpen((value) => !value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
            issueCount > 0
              ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              : warningCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          )}
          aria-expanded={validationOpen}
          title="Open validation details"
        >
          {issueCount > 0 ? <CircleAlert size={12} /> : <CheckCircle2 size={12} />}
          {issueCount > 0 ? `${issueCount} ${issueCount === 1 ? "issue" : "issues"}` : warningCount > 0 ? `${warningCount} warnings` : "Valid"}
        </button>

        {mode === "live" ? (
          <span className="hidden items-center gap-1 text-[10px] text-amber-700 lg:inline-flex" title="Live mode performs real provider actions">
            <Radio size={11} /> Real actions possible
          </span>
        ) : (
          <span className="hidden items-center gap-1 text-[10px] text-ink-secondary lg:inline-flex">
            <FlaskConical size={11} /> No external actions
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileInspectorOpen(true)} className="lg:hidden" aria-label="Open step inspector" title="Open step inspector">
            <PanelRightOpen size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => zoomOut({ duration: 150 })} aria-label="Zoom out" title="Zoom out">
            <ZoomOut size={15} />
          </Button>
          <span className="hidden w-10 text-center text-[10px] tabular-nums text-ink-secondary sm:inline" aria-hidden="true">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => zoomIn({ duration: 150 })} aria-label="Zoom in" title="Zoom in">
            <ZoomIn size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => fitView({ padding: 0.28, duration: 280, maxZoom: 1 })} aria-label="Fit workflow to screen" title="Fit to screen">
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={(_event, node) => {
              setSelected(node.id);
              if (isMobile) setMobileInspectorOpen(true);
            }}
            onPaneClick={() => setSelected(null)}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.6}
            snapToGrid
            snapGrid={[10, 10]}
            deleteKeyCode={null}
            selectionOnDrag
            panOnDrag
            connectionLineStyle={{ stroke: "#b7b3f5", strokeWidth: 2 }}
            defaultEdgeOptions={{ type: "fm" }}
            className="bg-white"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d9dce8" />
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              className="!hidden sm:!block"
              nodeColor={() => "#c9c5f7"}
              nodeStrokeColor={() => "#a9a2f2"}
              nodeBorderRadius={4}
              maskColor="rgba(244,245,248,0.68)"
              bgColor="#ffffff"
            />
          </ReactFlow>

          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
            <Badge tone={mode === "live" ? "warning" : "info"} dot>
              {mode === "live" ? "Live mode" : "Simulation mode"}
            </Badge>
            <span className="rounded-md border border-line bg-white/95 px-2 py-0.5 text-[9.5px] text-ink-secondary shadow-sm">
              Drag from a step's right handle to connect
            </span>
          </div>

          {definition.nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-xl border border-dashed border-line bg-white/95 p-6 text-center shadow-card">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Plus size={20} />
                </div>
                <h2 className="mt-3 text-[14px] font-semibold text-ink">Start with a trigger</h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
                  Every automation starts with one trigger. Add a manual, schedule or Gmail trigger, then connect action steps.
                </p>
                <Button className="mt-3" size="sm" onClick={() => openPicker()}>
                  <Plus size={14} /> Add first step
                </Button>
              </div>
            </div>
          ) : null}

          {definition.nodes.length > 0 && definition.edges.length === 0 ? (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 sm:block">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] text-amber-800 shadow-sm">
                Steps are not connected yet. Drag between the handles to build the flow.
              </span>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden items-center gap-2 text-[9.5px] text-ink-secondary lg:flex">
            <span className="rounded bg-white/90 px-1.5 py-0.5 shadow-sm">⌘/Ctrl+S save</span>
            <span className="rounded bg-white/90 px-1.5 py-0.5 shadow-sm">⌘/Ctrl+Z undo</span>
            <span className="rounded bg-white/90 px-1.5 py-0.5 shadow-sm">Delete removes selected step</span>
          </div>

          <ValidationPanel
            open={validationOpen}
            onClose={() => setValidationOpen(false)}
            validation={validation}
            mode={mode}
            onSelectNode={(nodeId) => {
              setSelected(nodeId);
              if (isMobile) setMobileInspectorOpen(true);
            }}
          />
        </div>

        <aside className="hidden w-[340px] shrink-0 border-l border-line bg-white lg:flex">
          <Inspector onOpenPicker={() => openPicker()} onAutoLayout={handleAutoLayout} />
        </aside>
      </div>

      {mobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
            onClick={() => setMobileInspectorOpen(false)}
            aria-label="Close step inspector"
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(360px,100vw)] flex-col border-l border-line bg-white shadow-pop">
            <Inspector
              onOpenPicker={() => openPicker()}
              onClose={() => setMobileInspectorOpen(false)}
              onAutoLayout={handleAutoLayout}
            />
          </aside>
        </div>
      ) : null}

      <NodePicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setInsertContext({});
        }}
        mode={mode}
        hasTrigger={hasTrigger}
        onSelect={handlePick}
      />

      <TestDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        onEnsureSaved={() => handleSave({ silent: true })}
      />

      <ConfirmDialog
        open={Boolean(deleteNodeId)}
        onClose={() => setDeleteNodeId(null)}
        onConfirm={handleDeleteNodeConfirm}
        title="Delete this step?"
        description={
          <>
            The step and its connections will be removed from the canvas. You can restore it with undo before leaving the editor.
          </>
        }
        confirmLabel="Delete step"
      />

      <ConfirmDialog
        open={deleteWorkflowOpen}
        onClose={() => setDeleteWorkflowOpen(false)}
        onConfirm={() => void handleDeleteWorkflow()}
        title="Delete this automation?"
        description={
          <>
            <strong className="font-medium text-ink">{name || "This automation"}</strong> and its saved versions and execution history will be
            permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete automation"
        loading={busy === "delete"}
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          navigate("/automations");
        }}
        title="Leave without saving?"
        description="You have unsaved changes in the editor. Leaving now discards them."
        confirmLabel="Discard changes"
      />

      <ConfirmDialog
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        onConfirm={() => void handleActivate()}
        title={`Activate in ${mode === "live" ? "live" : "simulation"} mode?`}
        description={
          mode === "live" ? (
            <>
              Live runs can send email from your connected Gmail account and append rows to Google Sheets. The automation starts in{" "}
              <strong className="font-medium text-ink">live mode</strong> and scheduled runs may act without further confirmation. Gmail
              triggers check the newest matching email rather than watching continuously.
            </>
          ) : (
            <>
              Simulation runs use deterministic adapters and never send email or change a spreadsheet. The automation starts in{" "}
              <strong className="font-medium text-ink">simulation mode</strong>. You can switch modes later and activate again.
            </>
          )
        }
        confirmLabel="Activate automation"
        tone="primary"
        loading={busy === "activate"}
      />
    </div>
  );
}
