import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, RefreshCw, ArrowLeft, Workflow as WorkflowIcon, RotateCcw } from "lucide-react";
import { listExecutions, getExecution, retryExecution } from "@/lib/executions.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EXECUTION_STATUS_LABELS, EXECUTION_STATUS_TONE, formatDuration, retryLabelFor } from "@/lib/status";
import { NODE_SPECS, type NodeType } from "@/lib/workflow-schema";

export const Route = createFileRoute("/_authenticated/history")({
  validateSearch: (search: Record<string, unknown>): { executionId?: string; status?: string } => {
    const out: { executionId?: string; status?: string } = {};
    // Client-side validation mirrors the server zod schemas: unknown filter
    // values fall back to "all" and malformed execution ids are dropped
    // instead of opening an error page.
    const executionId = typeof search["executionId"] === "string" ? search["executionId"] : undefined;
    if (executionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(executionId)) {
      out.executionId = executionId;
    }
    const status = typeof search["status"] === "string" ? search["status"] : undefined;
    if (status && (STATUS_FILTERS as readonly string[]).includes(status)) out.status = status;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Activity History — FlowMate AI" },
      { name: "description", content: "Every workflow run, with per-node results and errors." },
      { property: "og:title", content: "Activity History — FlowMate AI" },
      { property: "og:description", content: "Every workflow run, with per-node results and errors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

const STATUS_FILTERS = ["all", "succeeded", "failed", "partially_succeeded"] as const;

function HistoryPage() {
  const navigate = useNavigate();
  const { executionId, status } = useSearch({ from: "/_authenticated/history" });
  const fetchExecutions = useServerFn(listExecutions);
  const fetchExecution = useServerFn(getExecution);
  const retry = useServerFn(retryExecution);
  const queryClient = useQueryClient();

  const activeStatus = status ?? "all";
  const executions = useQuery({
    queryKey: ["executions", activeStatus],
    queryFn: () => fetchExecutions({ data: { status: activeStatus, page: 0, pageSize: 30 } }),
    retry: 1,
  });

  const detail = useQuery({
    queryKey: ["execution", executionId],
    queryFn: () => fetchExecution({ data: { id: executionId! } }),
    enabled: !!executionId,
    retry: 1,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { executionId: id } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["executions"] });
      void queryClient.invalidateQueries({ queryKey: ["execution", executionId] });
      if (!res.ok) {
        const first = res.validation.find((v) => v.level === "error");
        toast.error(first?.message ?? res.limitError ?? "The workflow has problems to fix first.");
        return;
      }
      // Say the mode that actually ran — a live retry is never reported as a
      // simulation. The server persists this exact mode on the new execution.
      toast.success(
        `${res.mode === "live" ? "Live execution" : "Simulation"} retry finished: ${res.status?.replace("_", " ") ?? "completed"}.`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed."),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Activity History"
        subtitle="Every run is recorded with per-node status, duration and honest errors."
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            to="/history"
            search={s === "all" ? {} : { status: s }}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              activeStatus === s ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:bg-accent/40"
            }`}
          >
            {s === "all" ? "All" : EXECUTION_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {executions.isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (executions.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No executions yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Run a test on any workflow and the result will appear here — including honest failures.</p>
            <Button className="mt-4" asChild>
              <Link to="/automations">Open automations</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(executions.data ?? []).map((e) => (
            <Link
              key={e.id}
              to="/history"
              search={executionId === e.id ? (activeStatus === "all" ? {} : { status: activeStatus }) : { executionId: e.id }}
              className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/40 ${
                executionId === e.id ? "border-primary/60 bg-accent/20" : "border-border"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                e.status === "succeeded" ? "bg-success/15 text-success"
                : e.status === "failed" ? "bg-error/15 text-error"
                : "bg-warning/15 text-warning"
              }`}>
                {e.status === "succeeded" ? <CheckCircle2 className="h-4 w-4" /> : e.status === "failed" ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.workflowName}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(e.startedAt).toLocaleString()} · {e.mode === "simulation" ? "Simulation run" : "Live run"}
                  {e.errorSummary ? ` · ${e.errorSummary}` : ""}
                </span>
              </span>
              <Badge variant="outline" className={`shrink-0 ${EXECUTION_STATUS_TONE[e.status] ?? ""}`}>
                {EXECUTION_STATUS_LABELS[e.status] ?? e.status}
              </Badge>
              <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                {formatDuration(e.durationMs)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Execution detail sheet */}
      <Sheet
        open={!!executionId}
        onOpenChange={(open) => {
          if (!open) navigate({ to: "/history", search: activeStatus === "all" ? {} : { status: activeStatus } });
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <Button variant="ghost" size="sm" className="w-fit" asChild>
              <Link to="/history" search={activeStatus === "all" ? {} : { status: activeStatus }}>
                <ArrowLeft className="h-4 w-4" /> Back to history
              </Link>
            </Button>
            {detail.isError && (
              <div className="mt-2 rounded-lg border border-border bg-surface-muted p-4 text-center text-sm text-muted-foreground">
                This execution could not be opened — it may have been deleted.
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate({ to: "/history", search: activeStatus === "all" ? {} : { status: activeStatus } })}
                >
                  Back to history
                </Button>
              </div>
            )}
            {detail.isLoading && <Skeleton className="h-24 w-full" />}
            {detail.data && (
              <>
                <SheetTitle className="flex items-center gap-2">
                  <WorkflowIcon className="h-4 w-4 text-primary" /> {detail.data.workflowName}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={EXECUTION_STATUS_TONE[detail.data.status] ?? ""}>
                    {EXECUTION_STATUS_LABELS[detail.data.status] ?? detail.data.status}
                  </Badge>
                  <span>{detail.data.mode === "simulation" ? "Simulation run — no external action taken" : "Live run"}</span>
                  <span>· {formatDuration(detail.data.durationMs)}</span>
                  <span>· {new Date(detail.data.startedAt).toLocaleString()}</span>
                </div>
                {detail.data.errorSummary && (
                  <div className="rounded-lg bg-error/10 p-3 text-sm text-foreground">{detail.data.errorSummary}</div>
                )}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Node timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {detail.data.steps.map((s) => (
                      <div key={s.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${
                            s.status === "succeeded" ? "bg-success/15 text-success"
                            : s.status === "waiting" ? "bg-warning/15 text-warning"
                            : s.status === "failed" ? "bg-error/15 text-error"
                            : "bg-surface-muted text-muted-foreground"
                          }`}>
                            {s.status === "succeeded" ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.status === "waiting" ? <Clock className="h-3.5 w-3.5" /> : s.status === "failed" ? <XCircle className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {NODE_SPECS[s.nodeType as NodeType]?.label ?? s.nodeType}
                              <span className="ml-1.5 text-xs text-muted-foreground">({s.nodeId})</span>
                            </div>
                            {s.errorMessage && <div className="mt-0.5 text-xs text-error">{s.errorMessage}</div>}
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(s.durationMs)}</span>
                        </div>
                        {s.output && Object.keys(s.output as object).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">Output preview</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-muted p-2 text-[11px] leading-relaxed">
                              {JSON.stringify(s.output, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                    {detail.data.status === "failed" &&
                      (detail.data.mode === "live" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full" disabled={retryMutation.isPending}>
                              <RotateCcw className="h-4 w-4" /> {retryLabelFor("live")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Retry live execution?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This reruns the workflow in live mode with the original input, so the original
                                external actions may happen again — emails can be re-sent and spreadsheets can
                                receive duplicate rows. Simulations never touch your connected accounts.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => retryMutation.mutate(detail.data!.id)}
                                className="bg-error text-white hover:bg-error/90"
                              >
                                Run it again live
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => retryMutation.mutate(detail.data!.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" /> {retryLabelFor("simulation")}
                        </Button>
                      ))}
                  </CardContent>
                </Card>
              </>
            )}
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}
