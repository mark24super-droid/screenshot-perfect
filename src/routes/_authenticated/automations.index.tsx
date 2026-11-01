import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Workflow as WorkflowIcon,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Play,
  Pause,
  Rocket,
  History as HistoryIcon,
  ListFilter,
} from "lucide-react";
import {
  listWorkflows,
  renameWorkflow,
  duplicateWorkflow,
  deleteWorkflow,
  setWorkflowStatus,
} from "@/lib/workflows.functions";
import { runWorkflowTest } from "@/lib/executions.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { WORKFLOW_STATUS_LABELS, STATUS_TONE, formatDuration } from "@/lib/status";
import { NODE_SPECS, type NodeType } from "@/lib/workflow-schema";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({
    meta: [
      { title: "Automations — FlowMate AI" },
      { name: "description", content: "All your saved workflows in one place." },
      { property: "og:title", content: "Automations — FlowMate AI" },
      { property: "og:description", content: "All your saved workflows in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

type WorkflowRow = Awaited<ReturnType<typeof listWorkflows>>[number];

function AutomationsPage() {
  const fetchWorkflows = useServerFn(listWorkflows);
  const rename = useServerFn(renameWorkflow);
  const duplicate = useServerFn(duplicateWorkflow);
  const remove = useServerFn(deleteWorkflow);
  const toggleStatus = useServerFn(setWorkflowStatus);
  const test = useServerFn(runWorkflowTest);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<WorkflowRow | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data, isLoading, error } = useQuery({ queryKey: ["workflows"], queryFn: () => fetchWorkflows(), retry: 1 });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => rename({ data: input }),
    onSuccess: () => { toast.success("Workflow renamed."); setRenameTarget(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rename failed."),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicate({ data: { id } }),
    onSuccess: (res) => { toast.success("Workflow duplicated."); invalidate(); navigate({ to: "/automations/$id", params: { id: res.id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Duplicate failed."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Workflow deleted."); setDeleteTarget(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed."),
  });
  const statusMutation = useMutation({
    mutationFn: (input: { id: string; action: "activate" | "pause" }) => toggleStatus({ data: input }),
    onSuccess: (res) => { toast.success(res.status === "active" ? "Workflow activated." : "Workflow paused."); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change status."),
  });
  const testMutation = useMutation({
    mutationFn: (id: string) => test({ data: { workflowId: id, mode: "simulation" } }),
    onSuccess: (res) => {
      invalidate();
      if (!res.ok) {
        const first = res.validation.find((v) => v.level === "error");
        toast.error(first?.message ?? res.limitError ?? "The workflow has problems to fix first.");
        return;
      }
      toast.success(`Simulation finished: ${res.status.replace("_", " ")}. See it in Activity History.`);
      navigate({ to: "/history" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test failed."),
  });

  const filtered = (data ?? []).filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Automations"
        subtitle="Everything you've built, saved and activated."
        action={
          <Button asChild>
            <Link to="/automations/new"><Plus className="h-4 w-4" /> Create Automation</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          {["all", "active", "draft", "needs_configuration", "paused"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                statusFilter === s ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {s === "all" ? "All" : WORKFLOW_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load automations</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "Something went wrong."}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <WorkflowIcon className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">
              {(data ?? []).length === 0 ? "No automations yet" : "No matches"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {(data ?? []).length === 0
                ? "Describe a task in plain language and FlowMate AI builds the workflow for you."
                : "Try a different search term or status filter."}
            </p>
            {(data ?? []).length === 0 && (
              <Button className="mt-4" asChild>
                <Link to="/automations/new"><Plus className="h-4 w-4" /> Create Automation</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((wf) => {
            const triggerSpec = wf.triggerType ? NODE_SPECS[wf.triggerType as NodeType] : null;
            return (
              <div key={wf.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40">
                <Link to="/automations/$id" params={{ id: wf.id }} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                    <WorkflowIcon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{wf.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {triggerSpec?.label ?? "No trigger"} ·
                      {wf.lastRunAt ? ` last run ${new Date(wf.lastRunAt).toLocaleString()}` : " never run"}
                      {wf.successRate !== null && ` · ${wf.successRate}% success`}
                    </span>
                  </span>
                </Link>
                <Badge variant="outline" className={`shrink-0 ${STATUS_TONE[wf.status] ?? ""}`}>
                  {WORKFLOW_STATUS_LABELS[wf.status] ?? wf.status}
                </Badge>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {formatDuration(null)}
                  {wf.updatedAt && new Date(wf.updatedAt).toLocaleDateString()}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${wf.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => testMutation.mutate(wf.id)} disabled={testMutation.isPending}>
                      <Play className="h-4 w-4" /> Test (simulation)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: wf.id, action: "activate" })} disabled={wf.status === "active"}>
                      <Rocket className="h-4 w-4" /> Activate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: wf.id, action: "pause" })} disabled={wf.status === "paused" || wf.status === "draft"}>
                      <Pause className="h-4 w-4" /> Pause
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setRenameTarget(wf); setRenameValue(wf.name); }}>
                      <Pencil className="h-4 w-4" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateMutation.mutate(wf.id)} disabled={duplicateMutation.isPending}>
                      <Copy className="h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/history"><HistoryIcon className="h-4 w-4" /> View history</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(wf)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the workflow, its saved versions and its execution history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename">Name</Label>
            <Input id="rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() => renameTarget && renameMutation.mutate({ id: renameTarget.id, name: renameValue.trim() })}
              disabled={!renameValue.trim() || renameMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
