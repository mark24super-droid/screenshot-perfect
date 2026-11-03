import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Clock, Copy, FlaskConical, RotateCcw, Square, Workflow } from "lucide-react";
import { PageContainer } from "../components/layout/AppShell";
import { Badge, Card, CardBody, CardHeader, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Dialog";
import { ErrorState } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { NodeIcon } from "../lib/icons";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { ExecutionDetail, ExecutionStep } from "../lib/types";
import { copyToClipboard, formatDateTime, formatDuration, safeJson, titleCase } from "../lib/utils";
import { getNodeDefinition } from "@shared/nodes";
import { cn } from "../lib/utils";

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = React.useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryOpen, setRetryOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      const response = await apiGet<ExecutionDetail>(`/executions/${id}`);
      setData(response);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!data) return;
    if (!["queued", "running", "waiting"].includes(data.status)) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [data, load]);

  const handleRetry = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const result = await apiPost<{ executionId: string }>(`/executions/${id}/retry`);
      toast({ title: "Retry queued", description: "A new execution was created. Opening its log.", variant: "success" });
      setRetryOpen(false);
      navigate(`/history/${result.executionId}`);
    } catch (err) {
      toast({ title: "Could not retry", description: errorMessage(err), variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiPost(`/executions/${id}/cancel`);
      toast({ title: "Execution cancelled", description: "The run was marked cancelled. Steps already completed are retained.", variant: "success" });
      setCancelOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Could not cancel", description: errorMessage(err), variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-7 w-72" />
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardBody className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-16 w-full" />
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-5 w-full" />
              ))}
            </CardBody>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <Link to="/history" className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink">
          <ArrowLeft size={13} /> Back to history
        </Link>
        <ErrorState className="mt-4" title="Execution not found" description={error ?? "This execution could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const isRunning = ["queued", "running", "waiting"].includes(data.status);

  return (
    <PageContainer>
      <Link to="/history" className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink">
        <ArrowLeft size={13} /> Back to activity history
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{data.workflowName}</h1>
            <StatusBadge status={data.status} />
            <Badge tone={data.mode === "live" ? "warning" : "neutral"}>{data.mode === "live" ? "Live run" : "Simulation run"}</Badge>
            {data.isDemo ? <Badge tone="warning">Demo data</Badge> : null}
          </div>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Execution <span className="font-mono text-[11px] text-ink">{data.id}</span> · started {formatDateTime(data.startedAt)} ·{" "}
            {formatDuration(data.durationMs)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isRunning ? (
            <Button variant="danger-outline" onClick={() => setCancelOpen(true)}>
              <Square size={14} /> Cancel run
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setRetryOpen(true)} disabled={!data.canRetry} title={data.retryReason ?? "Retry this failed execution"}>
            <RotateCcw size={14} /> Retry
          </Button>
          <Link to={`/automations/${data.workflowId}`}>
            <Button>
              <Workflow size={14} /> Open automation
            </Button>
          </Link>
        </div>
      </div>

      {data.status === "failed" && data.errorSummary ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-[12px] leading-relaxed text-rose-800" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Execution failed</p>
            <p className="mt-0.5">{data.errorSummary}</p>
            {data.retryReason ? <p className="mt-1 text-[11px] text-rose-700">{data.retryReason}</p> : null}
          </div>
        </div>
      ) : null}

      {data.mode === "simulation" ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
          <FlaskConical size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Simulated execution.</strong> Step outputs are deterministic sample data. No email was
            sent and no spreadsheet was modified.
          </span>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13px] font-semibold text-ink">Step log</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">
                  {data.steps.length} {data.steps.length === 1 ? "step" : "steps"} recorded in execution order. Inputs and outputs are
                  sanitized before storage.
                </p>
              </div>
              {isRunning ? (
                <Badge tone="info" dot>
                  Updating
                </Badge>
              ) : null}
            </CardHeader>
            {data.steps.length === 0 ? (
              <CardBody>
                <p className="text-center text-[12px] text-ink-secondary">No steps have been recorded yet.</p>
              </CardBody>
            ) : (
              <div className="divide-y divide-line">
                {data.steps.map((step, index) => (
                  <StepRow key={step.id} step={step} index={index} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-[13px] font-semibold text-ink">Execution details</h2>
            </CardHeader>
            <CardBody>
              <dl className="space-y-2.5 text-[11.5px]">
                <DetailRow label="Status">
                  <StatusBadge status={data.status} />
                </DetailRow>
                <DetailRow label="Mode">
                  <Badge tone={data.mode === "live" ? "warning" : "neutral"}>{titleCase(data.mode)}</Badge>
                </DetailRow>
                <DetailRow label="Trigger">
                  <span className="capitalize">{data.triggerSource}</span>
                </DetailRow>
                <DetailRow label="Started">{formatDateTime(data.startedAt)}</DetailRow>
                <DetailRow label="Finished">{data.finishedAt ? formatDateTime(data.finishedAt) : "—"}</DetailRow>
                <DetailRow label="Duration">{formatDuration(data.durationMs)}</DetailRow>
                <DetailRow label="Workflow status">
                  <StatusBadge status={data.workflowStatus} />
                </DetailRow>
                <DetailRow label="Version">{data.workflowVersionId ? <span className="font-mono text-[10.5px]">{data.workflowVersionId}</span> : "—"}</DetailRow>
              </dl>
            </CardBody>
          </Card>

          {data.input && Object.keys(data.input).length > 0 ? (
            <Card>
              <CardHeader>
                <h2 className="text-[13px] font-semibold text-ink">Trigger input</h2>
              </CardHeader>
              <CardBody>
                <pre className="max-h-60 overflow-auto rounded-lg bg-app p-2.5 text-[10.5px] leading-relaxed text-ink">{safeJson(data.input)}</pre>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink">
                <Clock size={13} className="text-ink-secondary" /> What happens on retry
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
                Retry creates a new execution using the same saved workflow version and input. It never re-runs a live action that
                already succeeded, because that could duplicate an email or spreadsheet row.
              </p>
              {data.retryReason ? <p className="mt-2 rounded-md bg-app p-2 text-[10.5px] leading-relaxed text-ink-secondary">{data.retryReason}</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={retryOpen}
        onClose={() => setRetryOpen(false)}
        onConfirm={() => void handleRetry()}
        title="Retry this execution?"
        description="A new execution will be queued with the same workflow version and trigger input. Existing logs are preserved."
        confirmLabel="Queue retry"
        tone="primary"
        loading={actionLoading}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void handleCancel()}
        title="Cancel this execution?"
        description="The run will be marked cancelled. Steps that already finished keep their logs. This cannot be undone."
        confirmLabel="Cancel execution"
        loading={actionLoading}
      />
    </PageContainer>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

function StepRow({ step, index }: { step: ExecutionStep; index: number }) {
  const [open, setOpen] = React.useState(step.status === "failed");
  const { toast } = useToast();
  const label = getNodeDefinition(step.nodeType)?.title ?? titleCase(step.nodeType);
  const hasDetails = Boolean(step.input || step.output || step.errorMessage);

  const copy = async () => {
    try {
      await copyToClipboard(safeJson({ input: step.input, output: step.output }));
      toast({ title: "Step data copied", variant: "success" });
    } catch {
      toast({ title: "Clipboard unavailable", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  return (
    <div className={cn("px-4 py-3", step.status === "failed" && "bg-rose-50/40")}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[10px] font-medium tabular-nums text-ink-secondary">{String(index + 1).padStart(2, "0")}</span>
        <NodeIcon type={step.nodeType} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-medium text-ink">{step.nodeTitle || label}</p>
            <StatusBadge status={step.status} />
            {step.attempt > 1 ? <Badge tone="warning">Attempt {step.attempt}</Badge> : null}
            <span className="text-[10px] text-ink-secondary">{formatDuration(step.durationMs)}</span>
          </div>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-secondary">{label}</p>
          {step.errorMessage ? (
            <p className="mt-1 text-[11px] leading-relaxed text-danger">
              {step.errorCode ? <span className="font-mono text-[10px]">{step.errorCode}: </span> : null}
              {step.errorMessage}
            </p>
          ) : null}

          {hasDetails ? (
            <>
              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpen((value) => !value)}
                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary-soft"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {open ? "Hide" : "Show"} input & output
                </button>
                <button type="button" onClick={() => void copy()} className="ml-auto rounded p-1 text-ink-secondary hover:bg-app" aria-label="Copy step data">
                  <Copy size={12} />
                </button>
              </div>
              {open ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Input</p>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-app p-2 text-[10px] leading-relaxed text-ink">{safeJson(step.input)}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Output</p>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-app p-2 text-[10px] leading-relaxed text-ink">{safeJson(step.output)}</pre>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
