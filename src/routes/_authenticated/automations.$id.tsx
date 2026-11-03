import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cloud,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Minus,
  PanelRight,
  Pause,
  Play,
  Plus,
  Redo2,
  Rocket,
  Save,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { getWorkflow, saveWorkflow, setWorkflowStatus } from "@/lib/workflows.functions";
import { validateWorkflow, NODE_SPECS, type WorkflowDefinition } from "@/lib/workflow-schema";
import { useEditorStore, type FlowNode } from "@/components/editor/editor-store";
import { FlowNodeCardMemo } from "@/components/editor/flow-node";
import { Inspector } from "@/components/editor/inspector";
import { NodePicker } from "@/components/editor/node-picker";
import { TestPanel } from "@/components/editor/test-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WORKFLOW_STATUS_LABELS, STATUS_TONE } from "@/lib/status";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/automations/$id")({
  validateSearch: (search: Record<string, unknown>): { test?: 1 } => {
    const raw = search["test"];
    return raw === 1 || raw === "1" ? { test: 1 } : {};
  },
  head: () => ({
    meta: [
      { title: "Workflow Editor — FlowMate AI" },
      { name: "description", content: "Build, validate and test your automation on a visual canvas." },
      { property: "og:title", content: "Workflow Editor — FlowMate AI" },
      { property: "og:description", content: "Build, validate and test your automation on a visual canvas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorRoute,
});

const nodeTypes = { flowmate: FlowNodeCardMemo } as unknown as NodeTypes;

function EditorRoute() {
  const { id } = Route.useParams();
  return (
    <ReactFlowProvider>
      <EditorPage workflowId={id} />
    </ReactFlowProvider>
  );
}

function EditorPage({ workflowId }: { workflowId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const flow = useReactFlow();
  const search = Route.useSearch();

  const fetchWorkflow = useServerFn(getWorkflow);
  const saveFn = useServerFn(saveWorkflow);
  const statusFn = useServerFn(setWorkflowStatus);

  const workflowQuery = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => fetchWorkflow({ data: { id: workflowId } }),
    retry: 1,
  });

  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const name = useEditorStore((s) => s.name);
  const description = useEditorStore((s) => s.description);
  const status = useEditorStore((s) => s.status);
  const viewport = useEditorStore((s) => s.viewport);
  const selectedId = useEditorStore((s) => s.selectedId);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);

  const load = useEditorStore((s) => s.load);
  const setMeta = useEditorStore((s) => s.setMeta);
  const setStatus = useEditorStore((s) => s.setStatus);
  const onNodesChange = useEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
  const connect = useEditorStore((s) => s.connect);
  const addNode = useEditorStore((s) => s.addNode);
  const selectNode = useEditorStore((s) => s.selectNode);
  const setViewport = useEditorStore((s) => s.setViewport);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const markSaving = useEditorStore((s) => s.markSaving);
  const markSaved = useEditorStore((s) => s.markSaved);
  const markSaveFailed = useEditorStore((s) => s.markSaveFailed);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);

  const loadedRef = useRef<string | null>(null);
  const testOpenedRef = useRef(false);
  const saveRef = useRef<(announce?: boolean) => Promise<boolean>>(async () => false);

  const data = workflowQuery.data;

  useEffect(() => {
    if (!data || loadedRef.current === data.id) return;
    load({
      workflowId: data.id,
      name: data.name,
      description: data.description ?? "",
      status: data.status,
      definition: data.definition,
    });
    loadedRef.current = data.id;
  }, [data, load]);

  // Deep link from "Test Workflow" on the review screen.
  useEffect(() => {
    if (search.test !== 1 || !loadedRef.current || testOpenedRef.current) return;
    testOpenedRef.current = true;
    setTestOpen(true);
  }, [search.test, data?.id]);

  const definition = useMemo<WorkflowDefinition>(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        config: n.data.config,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      viewport,
    }),
    [nodes, edges, viewport],
  );

  const connectedIntegrations = data?.connectedIntegrations ?? [];
  const validation = useMemo(
    () => validateWorkflow(definition, { connectedIntegrations, requireIntegrations: false }),
    [definition, connectedIntegrations],
  );
  const activationIssues = useMemo(
    () => validateWorkflow(definition, { connectedIntegrations, requireIntegrations: true }),
    [definition, connectedIntegrations],
  );
  const blocking = validation.filter((i) => i.level === "error");
  const activationBlocking = activationIssues.filter((i) => i.level === "error");

  const trigger = nodes.find((n) => NODE_SPECS[n.data.nodeType]?.kind === "trigger");
  const triggerType = trigger?.data.nodeType ?? null;
  const triggerSample =
    typeof trigger?.data.config["sampleInput"] === "string" ? (trigger.data.config["sampleInput"] as string) : "";

  const save = useCallback(
    async (announce = false): Promise<boolean> => {
      const state = useEditorStore.getState();
      if (state.saving) return false;
      markSaving();
      try {
        const res = await saveFn({
          data: {
            id: workflowId,
            name: state.name.trim() || "Untitled automation",
            description: state.description,
            definition: state.toDefinition(),
          },
        });
        markSaved(res.status);
        setSavedAtLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        void queryClient.invalidateQueries({ queryKey: ["workflows"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        if (announce) toast.success(`Saved as version ${res.version}.`);
        return true;
      } catch (err) {
        markSaveFailed();
        const message = err instanceof Error ? err.message : "Could not save this workflow.";
        toast.error(message, {
          action: { label: "Retry", onClick: () => void saveRef.current(true) },
          duration: 8000,
        });
        return false;
      }
    },
    [workflowId, saveFn, markSaving, markSaved, markSaveFailed, queryClient],
  );
  saveRef.current = save;

  // Autosave after edits settle. Explicit saves and failures are never hidden.
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => void saveRef.current(false), 1600);
    return () => clearTimeout(timer);
  }, [dirty, saving, nodes, edges, name, description]);

  // Warn before a browser tab close with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Keyboard shortcuts: save, undo/redo, delete selected node or connection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        if (selectedId) {
          e.preventDefault();
          setConfirmDeleteOpen(true);
        } else if (selectedEdge) {
          e.preventDefault();
          onEdgesChange([{ type: "remove", id: selectedEdge }]);
          setSelectedEdge(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [redo, undo, selectedId, selectedEdge, onEdgesChange]);

  const activate = useMutation({
    mutationFn: async () => {
      const state = useEditorStore.getState();
      if (state.dirty) {
        const ok = await saveRef.current(false);
        if (!ok) throw new Error("The workflow could not be saved, so it was not activated.");
      }
      return statusFn({ data: { id: workflowId, action: "activate" } });
    },
    onSuccess: () => {
      setStatus("active");
      toast.success("Workflow activated. It can now run when triggered.");
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not activate the workflow."),
  });

  const pause = useMutation({
    mutationFn: () => statusFn({ data: { id: workflowId, action: "pause" } }),
    onSuccess: () => {
      setStatus("paused");
      toast.success("Workflow paused. Saved configuration is unchanged.");
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not pause the workflow."),
  });

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connect(connection)) return;
      toast.error("That connection is not allowed. Check that it does not create a loop or point back to a trigger.");
    },
    [connect],
  );

  if (workflowQuery.isLoading || (!data && !workflowQuery.isError)) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  if (workflowQuery.isError || !data) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="font-semibold">This workflow could not be opened</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workflowQuery.error instanceof Error ? workflowQuery.error.message : "The workflow may have been deleted."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => void workflowQuery.refetch()}>
              Try again
            </Button>
            <Button asChild>
              <Link to="/automations">Back to automations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const activateDisabled = status === "active" || activate.isPending || activationBlocking.length > 0;
  const activateTitle =
    activationBlocking.length > 0
      ? activationBlocking[0]!.message
      : status === "active"
        ? "This workflow is already active."
        : "Validate and activate this workflow";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100dvh-56px)] flex-col overflow-hidden md:h-screen">
        {/* Top toolbar */}
        <header className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2 md:h-16 md:flex-nowrap md:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Back to automations"
                  onClick={() => (dirty ? setLeaveOpen(true) : navigate({ to: "/automations" }))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to automations</TooltipContent>
            </Tooltip>
            <div className="min-w-0 flex-1 md:w-56 md:flex-none">
              <Input
                className="h-8 border-transparent bg-transparent px-2 text-sm font-semibold shadow-none hover:border-border focus-visible:border-border"
                value={name}
                maxLength={120}
                aria-label="Workflow title"
                onChange={(e) => setMeta({ name: e.target.value })}
              />
            </div>
            <span
              className={cn(
                "hidden shrink-0 items-center gap-1 whitespace-nowrap text-[10px] sm:flex",
                dirty ? "text-warning" : "text-muted-foreground",
              )}
              aria-live="polite"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </>
              ) : dirty ? (
                <>
                  <Cloud className="h-3 w-3" /> Unsaved
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 text-success" /> {savedAtLabel ? `Saved ${savedAtLabel}` : "Saved"}
                </>
              )}
            </span>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={undo}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl/⌘ Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={redo}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Shift + Ctrl/⌘ Z)</TooltipContent>
            </Tooltip>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Zoom out"
              onClick={() => void flow.zoomOut({ duration: 200 })}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Zoom in"
              onClick={() => void flow.zoomIn({ duration: 200 })}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Fit to screen"
              onClick={() => void flow.fitView({ padding: 0.25, duration: 250 })}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant={minimapOpen ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              aria-label={minimapOpen ? "Hide minimap" : "Show minimap"}
              onClick={() => setMinimapOpen((v) => !v)}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className={cn("hidden capitalize sm:inline-flex", STATUS_TONE[status])}>
              {WORKFLOW_STATUS_LABELS[status] ?? status}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void save(true)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save now (Ctrl/⌘ S)</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setTestOpen(true)}>
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Test</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={activateDisabled}
                    title={activateTitle}
                    onClick={() => activate.mutate()}
                  >
                    {activate.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : status === "paused" ? (
                      <Rocket className="h-3.5 w-3.5" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{status === "paused" ? "Resume" : "Activate"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{activateTitle}</TooltipContent>
            </Tooltip>
            {status === "active" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => pause.mutate()}
                disabled={pause.isPending}
              >
                {pause.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Pause</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              aria-label="Open node settings"
              onClick={() => setSheetOpen(true)}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Toolbar row: mobile add step + issues */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted/60 px-2 py-1.5 md:hidden">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3 w-3" /> Add step
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => void flow.fitView({ padding: 0.2, duration: 250 })}
          >
            <Maximize2 className="h-3 w-3" /> Fit
          </Button>
          <span className={cn("ml-auto truncate text-[10px]", blocking.length ? "text-error" : "text-muted-foreground")}>
            {blocking.length ? `${blocking.length} issue${blocking.length > 1 ? "s" : ""} to fix` : "No blocking issues"}
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Canvas */}
          <div className="relative min-w-0 flex-1 bg-[#FBFBFD]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => {
                selectNode(node.id);
                setSelectedEdge(null);
                if (isMobile) setSheetOpen(true);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdge(edge.id);
                selectNode(null);
              }}
              onPaneClick={() => {
                selectNode(null);
                setSelectedEdge(null);
              }}
              onMoveEnd={(_, vp: Viewport) => setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })}
              defaultViewport={viewport}
              minZoom={0.2}
              maxZoom={1.75}
              snapToGrid
              snapGrid={[20, 20]}
              deleteKeyCode={null}
              multiSelectionKeyCode={null}
              connectionLineType={ConnectionLineType.SmoothStep}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: true,
                style: { stroke: "#a7a1f2", strokeWidth: 1.75 },
              }}
              proOptions={{ hideAttribution: true }}
              className="[&_.react-flow__pane]:cursor-grab"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d8dae5" />
              <Controls showInteractive={false} className="!bottom-4 !left-4 !shadow-sm" />
              {minimapOpen && (
                <MiniMap
                  pannable
                  zoomable
                  className="!bottom-4 !right-4 hidden !h-24 !w-40 !border !border-border !bg-card sm:block"
                  maskColor="rgba(244,245,248,0.7)"
                  nodeColor={(node) => {
                    const type = (node.data as { nodeType?: string }).nodeType ?? "";
                    if (type.startsWith("gmail")) return "#4387E8";
                    if (type.startsWith("google_sheets")) return "#20A36A";
                    if (type.startsWith("ai")) return "#635BEB";
                    if (type === "logic.filter") return "#E7A33E";
                    return "#8B87F0";
                  }}
                />
              )}
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto rounded-xl border border-border bg-card p-6 text-center shadow-sm">
                  <h2 className="font-semibold">This canvas is empty</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Add a trigger to start building.</p>
                  <Button className="mt-3" size="sm" onClick={() => setPickerOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add step
                  </Button>
                </div>
              </div>
            )}

            {selectedEdge && (
              <div className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
                <span className="text-muted-foreground">Connection selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-error hover:text-error"
                  onClick={() => {
                    onEdgesChange([{ type: "remove", id: selectedEdge }]);
                    setSelectedEdge(null);
                  }}
                >
                  <X className="h-3 w-3" /> Remove
                </Button>
              </div>
            )}

            {validation.some((v) => v.level === "error") && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-medium text-error shadow-sm"
              >
                <ChevronDown className="h-3 w-3" />
                {blocking.length} blocking issue{blocking.length > 1 ? "s" : ""}
              </button>
            )}
          </div>

          {/* Desktop inspector */}
          <aside className="hidden w-[304px] shrink-0 border-l border-border bg-card lg:block">
            <Inspector
              definition={definition}
              validation={validation}
              connectedIntegrations={connectedIntegrations}
              lastTest={
                data.lastExecution
                  ? { status: data.lastExecution.status, at: data.lastExecution.startedAt }
                  : null
              }
            />
          </aside>
        </div>
      </div>

      <NodePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(type) => addNode(type)} />

      <TestPanel
        open={testOpen}
        onOpenChange={setTestOpen}
        workflowId={workflowId}
        triggerType={triggerType}
        sampleInput={triggerSample || '{\n  "text": "Invoice INV-2043 for $420.00, due 2026-11-14"\n}'}
        connectedIntegrations={connectedIntegrations}
        blockingIssues={blocking}
        onBeforeRun={() => (useEditorStore.getState().dirty ? saveRef.current(false) : Promise.resolve(true))}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[92vw] p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">Workflow inspector</SheetTitle>
          <Inspector
            definition={definition}
            validation={validation}
            connectedIntegrations={connectedIntegrations}
            lastTest={
              data.lastExecution ? { status: data.lastExecution.status, at: data.lastExecution.startedAt } : null
            }
            onClose={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Autosave usually finishes within a couple of seconds, but the latest edits may
              not be stored yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setLeaveOpen(false);
                void navigate({ to: "/automations" });
              }}
            >
              Discard changes
            </Button>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                const ok = await saveRef.current(false);
                if (ok) {
                  setLeaveOpen(false);
                  void navigate({ to: "/automations" });
                }
              }}
            >
              Save &amp; leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the selected node?</AlertDialogTitle>
            <AlertDialogDescription>
              The node and its connections will be removed. Use Undo if you change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = useEditorStore.getState().selectedId;
                if (id) useEditorStore.getState().deleteNode(id);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
