import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, CalendarDays, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import { EmptyState, ErrorState, Tabs } from "../components/ui/Misc";
import { apiGet, errorMessage } from "../lib/api";
import type { ExecutionListResponse, WorkflowListItem } from "../lib/types";
import { formatDateTime, formatDuration, relativeTime } from "../lib/utils";

type StatusFilter = "all" | "succeeded" | "failed" | "running" | "cancelled";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState<ExecutionListResponse | null>(null);
  const [workflows, setWorkflows] = React.useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusFilter>((params.get("status") as StatusFilter) || "all");
  const [mode, setMode] = React.useState(params.get("mode") ?? "all");
  const [workflowId, setWorkflowId] = React.useState(params.get("workflowId") ?? "");
  const [from, setFrom] = React.useState(params.get("from")?.slice(0, 10) ?? "");
  const [to, setTo] = React.useState(params.get("to")?.slice(0, 10) ?? "");
  const [page, setPage] = React.useState(0);
  const [showFilters, setShowFilters] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (status !== "all") query.set("status", status);
      if (mode !== "all") query.set("mode", mode);
      if (workflowId) query.set("workflowId", workflowId);
      if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) query.set("to", new Date(`${to}T23:59:59.999`).toISOString());
      query.set("limit", String(PAGE_SIZE));
      query.set("offset", String(page * PAGE_SIZE));
      setData(await apiGet<ExecutionListResponse>(`/executions?${query.toString()}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, mode, workflowId, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const next = new URLSearchParams(params);
    if (status !== "all") next.set("status", status);
    else next.delete("status");
    if (mode !== "all") next.set("mode", mode);
    else next.delete("mode");
    if (workflowId) next.set("workflowId", workflowId);
    else next.delete("workflowId");
    if (from) next.set("from", from);
    else next.delete("from");
    if (to) next.set("to", to);
    else next.delete("to");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode, workflowId, from, to]);

  React.useEffect(() => {
    setPage(0);
  }, [status, mode, workflowId, from, to]);

  React.useEffect(() => {
    apiGet<{ items: WorkflowListItem[] }>("/workflows")
      .then((response) => setWorkflows(response.items))
      .catch(() => undefined);
  }, []);

  const clearFilters = () => {
    setStatus("all");
    setMode("all");
    setWorkflowId("");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const hasFilters = status !== "all" || mode !== "all" || Boolean(workflowId) || Boolean(from) || Boolean(to);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageTitle
        title="Activity history"
        description="Stored execution records with step-level logs. Simulation and live runs are labelled separately; retention depends on your plan."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowFilters((value) => !value)}>
              <SlidersHorizontal size={15} /> Filters
            </Button>
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </>
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={status}
          onChange={(value) => setStatus(value)}
          items={[
            { value: "all", label: "All runs" },
            { value: "succeeded", label: "Succeeded" },
            { value: "failed", label: "Failed" },
            { value: "running", label: "Running" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {data ? (
          <p className="text-[11px] text-ink-secondary">
            {data.total.toLocaleString()} {data.total === 1 ? "execution" : "executions"} within {data.historyDays} days
          </p>
        ) : null}
      </div>

      {showFilters ? (
        <Card className="mt-3">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="history-workflow" className="label">
                Automation
              </label>
              <Select id="history-workflow" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
                <option value="">All automations</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="history-mode" className="label">
                Mode
              </label>
              <Select id="history-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="all">All modes</option>
                <option value="simulation">Simulation</option>
                <option value="live">Live</option>
              </Select>
            </div>
            <div>
              <label htmlFor="history-from" className="label">
                From
              </label>
              <Input id="history-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div>
              <label htmlFor="history-to" className="label">
                To
              </label>
              <Input id="history-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          {hasFilters ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
                <CalendarDays size={12} /> Filters apply to stored execution records only.
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all filters
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <Card>
            <div className="divide-y divide-line">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="ml-auto h-4 w-24" />
                </div>
              ))}
            </div>
          </Card>
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Activity size={20} />}
            title={hasFilters ? "No executions match these filters" : "No executions yet"}
            description={
              hasFilters
                ? "Try widening the date range or clearing filters. Only executions inside your plan's retention window are shown."
                : "Test an automation from the editor or activate it to create execution records here. Every run is stored with step-level logs."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/automations">
                  <Button variant="secondary">Open automations</Button>
                </Link>
              )
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-line bg-app/50">
                    <th className="table-head px-4 py-2.5">Status</th>
                    <th className="table-head px-4 py-2.5">Automation</th>
                    <th className="table-head px-4 py-2.5">Mode</th>
                    <th className="table-head px-4 py-2.5">Trigger</th>
                    <th className="table-head px-4 py-2.5">Steps</th>
                    <th className="table-head px-4 py-2.5">Duration</th>
                    <th className="table-head px-4 py-2.5 text-right">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((execution) => (
                    <tr key={execution.id} className="group hover:bg-app/40">
                      <td className="px-4 py-3">
                        <StatusBadge status={execution.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/history/${execution.id}`} className="flex items-center gap-2 text-[12px] font-medium text-ink hover:text-primary">
                          {execution.workflowName}
                          {execution.isDemo ? <Badge tone="warning">demo</Badge> : null}
                        </Link>
                        {execution.errorSummary ? (
                          <p className="mt-0.5 max-w-[320px] truncate text-[10.5px] text-danger" title={execution.errorSummary}>
                            {execution.errorSummary}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[10.5px] text-ink-secondary">
                            {execution.succeededSteps}/{execution.totalSteps} steps succeeded
                            {execution.failedSteps > 0 ? ` · ${execution.failedSteps} failed` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={execution.mode === "live" ? "warning" : "neutral"}>{execution.mode === "live" ? "Live" : "Simulation"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[11px] capitalize text-ink-secondary">{execution.triggerSource}</td>
                      <td className="px-4 py-3 text-[11px] text-ink-secondary">
                        {execution.succeededSteps}/{execution.totalSteps}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-ink-secondary">{formatDuration(execution.durationMs)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] text-ink-secondary" title={formatDateTime(execution.startedAt)}>
                          {relativeTime(execution.startedAt)}
                        </span>
                        <Link to={`/history/${execution.id}`} className="ml-2 inline-flex text-ink-secondary group-hover:text-primary" aria-label="Open execution details">
                          <ArrowRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-app/30 px-4 py-2.5">
              <span className="text-[11px] text-ink-secondary">
                Page {page + 1} of {totalPages} · showing {data.items.length} of {data.total}
              </span>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                  <ArrowLeft size={13} /> Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>
                  Next <ArrowRight size={13} />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {data ? (
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
          <Search size={11} /> Records older than {data.historyDays} days are not shown because of the current plan&apos;s history limit.
        </p>
      ) : null}
    </PageContainer>
  );
}
