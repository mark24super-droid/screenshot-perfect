import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, CircleAlert, Clock, Plus, Sparkles, Workflow, Zap } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, CardBody, CardHeader, Progress, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState } from "../components/ui/Misc";
import { ProviderIcon } from "../lib/icons";
import { apiGet, errorMessage } from "../lib/api";
import type { DashboardSummary } from "../lib/types";
import { formatDateTime, providerLabel, relativeTime } from "../lib/utils";
import { cn } from "../lib/utils";

export default function DashboardPage() {
  const [data, setData] = React.useState<DashboardSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<DashboardSummary>("/dashboard/summary"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="Dashboard" description="Your workspace at a glance." />
        <ErrorState className="mt-5" description={error ?? "The dashboard could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const { stats, usage } = data;
  const isEmpty = stats.totalAutomations === 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <PageContainer>
      <PageTitle
        title={`${greeting}, ${data.onboardingCompleted ? "there" : "welcome"}`}
        description={
          <>
            Here is what is happening in <strong className="font-medium text-ink">{usage.plan.name}</strong> workspace usage.{" "}
            {data.demoMode ? "Demo data is labelled and simulated." : "Numbers come from real execution records."}
          </>
        }
        actions={
          <>
            <Link to="/templates">
              <Button variant="secondary">
                <Sparkles size={15} /> Browse templates
              </Button>
            </Link>
            <Link to="/automations/new">
              <Button>
                <Plus size={15} /> Create automation
              </Button>
            </Link>
          </>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total automations" value={stats.totalAutomations} hint={`${usage.workflows.limit} allowed on ${usage.plan.name}`} icon={<Workflow size={16} />} tone="purple" />
        <StatCard label="Active automations" value={stats.activeAutomations} hint={stats.activeAutomations === 1 ? "1 workflow can run" : `${stats.activeAutomations} workflows can run`} icon={<Zap size={16} />} tone="success" />
        <StatCard label="Executions this month" value={stats.executionsThisMonth} hint={`${usage.executions.limit.toLocaleString()} monthly limit`} icon={<Activity size={16} />} tone="info" />
        <StatCard label="Failed this month" value={stats.failedExecutions} hint={stats.failedExecutions > 0 ? "Review failed runs" : "No failures recorded"} icon={<CircleAlert size={16} />} tone={stats.failedExecutions > 0 ? "danger" : "neutral"} />
      </div>

      {isEmpty ? (
        <Card className="mt-5">
          <CardBody>
            <EmptyState
              icon={<Sparkles size={20} />}
              title="Build your first automation"
              description="Describe a repetitive task in plain language, start from a reviewed template, or place steps on the canvas yourself. Nothing runs until you test and activate it."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/automations/new">
                    <Button>
                      <Sparkles size={15} /> Describe with AI
                    </Button>
                  </Link>
                  <Link to="/templates">
                    <Button variant="secondary">Start from a template</Button>
                  </Link>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Recent automations</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Ordered by last edit. Open one to review its steps.</p>
              </div>
              <Link to="/automations" className="text-[11.5px] font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <div className="divide-y divide-line">
              {data.recentAutomations.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-ink-secondary">No automations yet.</p>
              ) : (
                data.recentAutomations.map((workflow) => (
                  <Link
                    key={workflow.id}
                    to={`/automations/${workflow.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-app/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Workflow size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[12.5px] font-medium text-ink">{workflow.name}</p>
                        <StatusBadge status={workflow.status} />
                        {workflow.integrations.length > 0 ? (
                          <span className="hidden items-center gap-1 text-[10px] text-ink-secondary sm:inline-flex">
                            {workflow.integrations.map((provider) => (
                              <ProviderIcon key={provider} provider={provider} className="h-4 w-4 [&>svg]:h-2.5 [&>svg]:w-2.5" />
                            ))}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-ink-secondary">
                        {workflow.triggerLabel} · {workflow.nodeCount} {workflow.nodeCount === 1 ? "step" : "steps"} · updated{" "}
                        {relativeTime(workflow.updatedAt)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[11px] font-medium text-ink">
                        {workflow.successRate === null ? "No runs" : `${workflow.successRate}% success`}
                      </p>
                      <p className="text-[10px] text-ink-secondary">{workflow.runCount} total runs</p>
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-ink-secondary" />
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Recent activity</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Every row is a stored execution with step-level logs.</p>
              </div>
              <Link to="/history" className="text-[11.5px] font-medium text-primary hover:underline">
                Activity history
              </Link>
            </CardHeader>
            {data.recentActivity.length === 0 ? (
              <CardBody>
                <p className="text-center text-[12px] text-ink-secondary">
                  No executions yet. Test an automation to see its run log here.
                </p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-line bg-app/40">
                      <th className="table-head px-4 py-2">Automation</th>
                      <th className="table-head px-4 py-2">Status</th>
                      <th className="table-head px-4 py-2">Mode</th>
                      <th className="table-head px-4 py-2">Steps</th>
                      <th className="table-head px-4 py-2 text-right">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.recentActivity.map((execution) => (
                      <tr key={execution.id} className="hover:bg-app/40">
                        <td className="px-4 py-2.5">
                          <Link to={`/history/${execution.id}`} className="text-[12px] font-medium text-ink hover:text-primary">
                            {execution.workflowName}
                          </Link>
                          {execution.isDemo ? <span className="ml-2 text-[9px] font-medium uppercase text-amber-700">demo</span> : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={execution.status} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={execution.mode === "live" ? "warning" : "neutral"}>{execution.mode === "live" ? "Live" : "Simulation"}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-ink-secondary">
                          {execution.succeededSteps}/{execution.totalSteps} ok
                        </td>
                        <td className="px-4 py-2.5 text-right text-[11px] text-ink-secondary" title={formatDateTime(execution.startedAt)}>
                          {relativeTime(execution.startedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <h2 className="text-[13.5px] font-semibold text-ink">Plan usage</h2>
              <Link to="/billing" className="text-[11.5px] font-medium text-primary hover:underline">
                Manage
              </Link>
            </CardHeader>
            <CardBody className="space-y-4">
              <UsageRow label="Automations" used={usage.workflows.used} limit={usage.workflows.limit} />
              <UsageRow label="Executions" used={usage.executions.used} limit={usage.executions.limit} />
              <UsageRow label="AI generations" used={usage.aiGenerations.used} limit={usage.aiGenerations.limit} />
              <UsageRow label="Connections" used={usage.connections.used} limit={usage.connections.limit} />
              <p className="border-t border-line pt-3 text-[10.5px] leading-relaxed text-ink-secondary">
                Period {formatDateTime(usage.periodStart)} – {formatDateTime(usage.periodEnd)}. History is kept for {usage.historyDays} days.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[13.5px] font-semibold text-ink">Connections</h2>
              <Link to="/integrations" className="text-[11.5px] font-medium text-primary hover:underline">
                Manage
              </Link>
            </CardHeader>
            <div className="divide-y divide-line">
              {data.integrations.map((connection) => (
                <div key={connection.provider} className="flex items-center gap-3 px-4 py-3">
                  <ProviderIcon provider={connection.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink">{providerLabel(connection.provider)}</p>
                    <p className="truncate text-[10.5px] text-ink-secondary">
                      {connection.status === "connected"
                        ? connection.accountLabel || "Connected account"
                        : connection.status === "demo"
                          ? "Demo connection (simulated)"
                          : connection.oauthConfigured
                            ? "Not connected"
                            : "OAuth setup required on server"}
                    </p>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>
              ))}
            </div>
            <div className="border-t border-line px-4 py-3">
              <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-secondary">
                <Sparkles size={12} className="mt-0.5 shrink-0 text-primary" />
                {data.aiProviderConfigured
                  ? "AI provider configured on the server. Generation and AI steps can run."
                  : "No AI key configured. Generation uses the labelled local demo planner."}
              </div>
            </div>
          </Card>

          {data.pendingApproval.length > 0 ? (
            <Card>
              <CardHeader>
                <h2 className="text-[13.5px] font-semibold text-ink">Needs review</h2>
                <Badge tone="warning">{data.pendingApproval.length}</Badge>
              </CardHeader>
              <div className="divide-y divide-line">
                {data.pendingApproval.map((workflow) => (
                  <Link key={workflow.id} to={`/automations/${workflow.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-app/60">
                    <Clock size={13} className="shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{workflow.name}</span>
                    <span className="text-[10px] text-ink-secondary">Review</span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="rounded-xl border border-primary/15 bg-primary-soft/60 p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
              <Sparkles size={14} /> AI workflow drafts
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
              Describe a task and FlowMate proposes a plan using only approved steps. You review and save it — nothing is
              activated automatically.
            </p>
            <Button size="sm" className="mt-3" onClick={() => navigate("/automations/new")}>
              Generate a draft <ArrowRight size={13} />
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: "purple" | "success" | "info" | "danger" | "neutral";
}) {
  const tones = {
    purple: "bg-primary-soft text-primary",
    success: "bg-emerald-50 text-success",
    info: "bg-blue-50 text-info",
    danger: "bg-rose-50 text-danger",
    neutral: "bg-slate-100 text-ink-secondary",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium text-ink-secondary">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tones[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[10.5px] text-ink-secondary">{hint}</p>
    </Card>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-ink">{label}</span>
        <span className="text-[10.5px] tabular-nums text-ink-secondary">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <Progress value={percent} tone={percent >= 100 ? "danger" : percent >= 80 ? "warning" : "primary"} className="mt-1.5" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardBody className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-12 w-full" />
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardBody className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-9 w-full" />
              ))}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-8 w-full" />
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
