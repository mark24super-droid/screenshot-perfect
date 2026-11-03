import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Copy,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Dialog";
import { DropdownMenu } from "../components/ui/Dropdown";
import { Input } from "../components/ui/Input";
import { EmptyState, ErrorState, Tabs } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { ProviderIcon } from "../lib/icons";
import { apiDelete, apiGet, apiPost, errorMessage } from "../lib/api";
import type { WorkflowListItem, WorkflowStatus } from "../lib/types";
import { formatDateTime, relativeTime } from "../lib/utils";

type StatusFilter = "all" | "active" | "draft" | "needs_configuration" | "paused" | "error";

interface WorkflowListResponse {
  items: WorkflowListItem[];
  total: number;
}

export default function AutomationsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = React.useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState(params.get("search") ?? "");
  const [status, setStatus] = React.useState<StatusFilter>((params.get("status") as StatusFilter) || "all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkflowListItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (status !== "all") query.set("status", status);
      if (search.trim()) query.set("search", search.trim());
      const response = await apiGet<WorkflowListResponse>(`/workflows${query.toString() ? `?${query.toString()}` : ""}`);
      setItems(response.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const next = new URLSearchParams(params);
    if (search.trim()) next.set("search", search.trim());
    else next.delete("search");
    if (status !== "all") next.set("status", status);
    else next.delete("status");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const toggleActive = async (workflow: WorkflowListItem) => {
    setBusyId(workflow.id);
    try {
      if (workflow.status === "active") {
        await apiPost(`/workflows/${workflow.id}/pause`);
        toast({ title: "Automation paused", description: `${workflow.name} will not run on its trigger until reactivated.`, variant: "success" });
      } else {
        await apiPost(`/workflows/${workflow.id}/activate`, { mode: "simulation" });
        toast({
          title: "Activated in simulation mode",
          description: `${workflow.name} will run with simulated adapters. Open the editor to switch to live.`,
          variant: "success",
        });
      }
      await load();
    } catch (err) {
      toast({ title: "Could not update automation", description: errorMessage(err), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (workflow: WorkflowListItem) => {
    setBusyId(workflow.id);
    try {
      const copy = await apiPost<{ id: string }>(`/workflows/${workflow.id}/duplicate`);
      toast({ title: "Draft copy created", description: "The copy starts as a draft. Nothing was activated.", variant: "success" });
      navigate(`/automations/${copy.id}`);
    } catch (err) {
      toast({ title: "Could not duplicate", description: errorMessage(err), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/workflows/${deleteTarget.id}`);
      toast({ title: "Automation deleted", description: `${deleteTarget.name}, its saved versions and its execution history were removed.`, variant: "success" });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast({ title: "Could not delete automation", description: errorMessage(err), variant: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const counts = React.useMemo(
    () => ({
      all: items.length,
      active: items.filter((item) => item.status === "active").length,
      draft: items.filter((item) => item.status === "draft").length,
      needs_configuration: items.filter((item) => item.status === "needs_configuration").length,
      paused: items.filter((item) => item.status === "paused").length,
      error: items.filter((item) => item.status === "error").length,
    }),
    [items],
  );

  const hasFilters = search.trim().length > 0 || status !== "all";

  return (
    <PageContainer>
      <PageTitle
        title="Automations"
        description="Visual workflows stored in this workspace. Drafts never run until you test and activate them."
        actions={
          <Link to="/automations/new">
            <Button>
              <Plus size={15} /> Create automation
            </Button>
          </Link>
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "draft", label: "Drafts", count: counts.draft },
            { value: "needs_configuration", label: "Needs config", count: counts.needs_configuration },
            { value: "paused", label: "Paused", count: counts.paused },
            { value: "error", label: "Error", count: counts.error },
          ]}
        />
        <div className="relative w-full lg:w-[300px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or description…"
            className="pl-8 pr-8"
            aria-label="Search automations"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-secondary hover:text-ink"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <Card>
            <div className="divide-y divide-line">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-52 max-w-full" />
                    <Skeleton className="mt-2 h-3 w-72 max-w-full" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Workflow size={20} />}
            title={hasFilters ? "No automations match these filters" : "No automations yet"}
            description={
              hasFilters
                ? "Try clearing the search or choosing a different status. Filters only affect this list."
                : "Create an automation from a plain-language prompt, a reviewed template, or a blank canvas."
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/automations/new">
                    <Button>
                      <Plus size={15} /> Create automation
                    </Button>
                  </Link>
                  <Link to="/templates">
                    <Button variant="secondary">Browse templates</Button>
                  </Link>
                </div>
              )
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_140px_120px_44px] gap-3 border-b border-line bg-app/50 px-4 py-2.5 md:grid">
              <span className="table-head">Automation</span>
              <span className="table-head">Status</span>
              <span className="table-head">Last run</span>
              <span className="table-head">Reliability</span>
              <span className="table-head">Updated</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="divide-y divide-line">
              {items.map((workflow) => (
                <div
                  key={workflow.id}
                  className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-app/40 md:grid-cols-[minmax(0,1fr)_110px_120px_140px_120px_44px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Workflow size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/automations/${workflow.id}`} className="truncate text-[12.5px] font-medium text-ink hover:text-primary">
                          {workflow.name}
                        </Link>
                        {workflow.integrations.map((provider) => (
                          <span key={provider} title={provider === "gmail" ? "Uses Gmail" : provider === "google_sheets" ? "Uses Google Sheets" : "Uses AI"}>
                            <ProviderIcon provider={provider} className="h-4 w-4 [&>svg]:h-2.5 [&>svg]:w-2.5" />
                          </span>
                        ))}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-ink-secondary">
                        {workflow.triggerLabel} · {workflow.nodeCount} {workflow.nodeCount === 1 ? "step" : "steps"}
                        {workflow.description ? ` · ${workflow.description}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <StatusBadge status={workflow.status} />
                  </div>

                  <div className="hidden md:block">
                    {workflow.lastRunAt ? (
                      <>
                        <StatusBadge status={workflow.lastRunStatus ?? "queued"} />
                        <p className="mt-1 text-[10px] text-ink-secondary">{relativeTime(workflow.lastRunAt)}</p>
                      </>
                    ) : (
                      <span className="text-[11px] text-ink-secondary">Never</span>
                    )}
                  </div>

                  <div className="hidden md:block">
                    {workflow.successRate === null ? (
                      <span className="text-[11px] text-ink-secondary">No runs yet</span>
                    ) : (
                      <>
                        <span className="text-[11.5px] font-medium text-ink">{workflow.successRate}% success</span>
                        <p className="text-[10px] text-ink-secondary">
                          {workflow.runCount} runs · {workflow.failedCount} failed
                        </p>
                      </>
                    )}
                  </div>

                  <div className="hidden text-[11px] text-ink-secondary md:block" title={formatDateTime(workflow.updatedAt)}>
                    {relativeTime(workflow.updatedAt)}
                  </div>

                  <div className="flex justify-end">
                    <DropdownMenu
                      trigger={
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary hover:bg-app hover:text-ink">
                          <MoreHorizontal size={16} />
                        </span>
                      }
                      items={[
                        { label: "Open editor", icon: <ArrowUpRight size={14} />, onClick: () => navigate(`/automations/${workflow.id}`) },
                        {
                          label: workflow.status === "active" ? "Pause" : "Activate (simulation)",
                          icon: workflow.status === "active" ? <Pause size={14} /> : <Play size={14} />,
                          onClick: () => void toggleActive(workflow),
                          disabled: busyId === workflow.id,
                        },
                        { label: "Duplicate as draft", icon: <Copy size={14} />, onClick: () => void duplicate(workflow), disabled: busyId === workflow.id },
                        { label: "Delete…", icon: <Trash2 size={14} />, onClick: () => setDeleteTarget(workflow), danger: true, separatorBefore: true },
                      ]}
                      width="w-56"
                      label={`Actions for ${workflow.name}`}
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-2 border-t border-line/60 pt-2 md:hidden">
                    <StatusBadge status={workflow.status} />
                    {workflow.lastRunAt ? <span className="text-[10px] text-ink-secondary">Last run {relativeTime(workflow.lastRunAt)}</span> : null}
                    <span className="ml-auto text-[10px] text-ink-secondary">
                      {workflow.successRate === null ? "No runs" : `${workflow.successRate}% success`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line bg-app/30 px-4 py-2.5 text-[11px] text-ink-secondary">
              <span>
                {items.length} {items.length === 1 ? "automation" : "automations"}
                {hasFilters ? " matching filters" : ""}
              </span>
              <span className="hidden sm:inline">Deleting a workflow also removes its execution history.</span>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this automation?"
        description={
          <>
            <strong className="font-medium text-ink">{deleteTarget?.name}</strong>, all saved versions and its execution history will be
            permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete automation"
        loading={deleting}
      />
    </PageContainer>
  );
}
