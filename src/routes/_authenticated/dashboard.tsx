import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Workflow as WorkflowIcon,
  CheckCircle2,
  Play,
  XCircle,
  Plus,
  ArrowRight,
  Mail,
  FileSpreadsheet,
  Sparkles,
  Plug,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { getDashboardSummary, instantiateTemplate } from "@/lib/workflows.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getPlan } from "@/lib/plans";
import { WORKFLOW_STATUS_LABELS, STATUS_TONE } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FlowMate AI" },
      { name: "description", content: "Your automations, activity and usage at a glance." },
      { property: "og:title", content: "Dashboard — FlowMate AI" },
      { property: "og:description", content: "Your automations, activity and usage at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "default" | "error" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {tone === "error" ? <XCircle className="h-3.5 w-3.5 text-error" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const fetchSummary = useServerFn(getDashboardSummary);
  const instantiate = useServerFn(instantiateTemplate);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: fetchSummary, retry: 1 });

  const useTemplate = useMutation({
    mutationFn: (slug: string) => instantiate({ data: { slug } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Template copied — finish configuring it in the editor.");
      navigate({ to: "/automations/$id", params: { id: res.id } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not use this template."),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>The dashboard could not load</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "Something went wrong."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const usage = data.usage;
  const plan = getPlan("free");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back — here's what's happening with your automations.`}
        action={
          <Button asChild>
            <Link to="/automations/new">
              <Plus className="h-4 w-4" /> Create Automation
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total automations" value={usage.workflows} sub={`Limit: ${usage.limitWorkflows} on ${data.planName}`} />
        <StatCard
          label="Executions this month"
          value={usage.executionsThisMonth}
          sub={`Limit: ${usage.limitMonthlyExecutions} per month`}
        />
        <StatCard label="Failed executions" value={usage.failedExecutionsThisMonth} sub="This month" tone="error" />
        <StatCard label="AI generations" value={usage.aiGenerationsThisMonth} sub={`Limit: ${usage.limitAiGenerations} per month`} />
      </div>

      {usage.executionsThisMonth >= usage.limitMonthlyExecutions && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Monthly execution limit reached</AlertTitle>
          <AlertDescription>
            You've used all {usage.limitMonthlyExecutions} executions included in the {plan.name} plan. Upgrade on the Billing page for a higher allowance.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent automations */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Recent automations</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/automations">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentWorkflows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <WorkflowIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No automations yet</p>
                <p className="text-xs text-muted-foreground">Describe what you want automated and FlowMate builds the workflow.</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link to="/automations/new"><Plus className="h-4 w-4" /> Create Automation</Link>
                </Button>
              </div>
            )}
            {data.recentWorkflows.map((wf) => (
              <Link
                key={wf.id}
                to="/automations/$id"
                params={{ id: wf.id }}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-accent/40"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
                  <Sparkles className="h-4 w-4 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{wf.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {wf.triggerType ? wf.triggerType.replace(".", ": ") : "No trigger"} · updated {new Date(wf.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <Badge variant="outline" className={STATUS_TONE[wf.status] ?? ""}>
                  {WORKFLOW_STATUS_LABELS[wf.status] ?? wf.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Right column: integrations + activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Integration status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "google_mail" as const, name: "Gmail", icon: Mail, desc: "Triggers on new email, sends messages" },
                { key: "google_sheets" as const, name: "Google Sheets", icon: FileSpreadsheet, desc: "Reads rows, appends data" },
              ].map((i) => {
                const status = data.integrations[i.key];
                return (
                  <div key={i.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent">
                      <i.icon className="h-4.5 w-4.5 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{i.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{i.desc}</div>
                    </div>
                    {status === "connected" ? (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">Connected</Badge>
                    ) : (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/integrations">Connect</Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/history">History</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentExecutions.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No runs yet. Test a workflow to see activity here.</p>
              )}
              {data.recentExecutions.map((e) => (
                <div key={e.id} className="flex items-center gap-2.5 text-xs">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md ${
                    e.status === "succeeded" ? "bg-success/15 text-success"
                    : e.status === "failed" ? "bg-error/15 text-error"
                    : "bg-warning/15 text-warning"
                  }`}>
                    {e.status === "succeeded" ? <CheckCircle2 className="h-3.5 w-3.5" /> : e.status === "failed" ? <XCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <Link to="/history" className="font-medium hover:underline">{e.workflowName}</Link>
                    <span className="block text-muted-foreground">
                      {e.mode === "simulation" ? "Simulation" : "Live"} · {new Date(e.startedAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick start templates */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Quick start templates</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/templates">All templates <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.quickTemplates.map((t) => (
              <div key={t.slug} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
                  <Plug className="h-4 w-4 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</div>
                  <Button size="sm" variant="outline" className="mt-2"
                    onClick={() => useTemplate.mutate(t.slug)}
                    disabled={useTemplate.isPending}>
                    <Clock className="h-3.5 w-3.5" /> Use Template
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {[
              { label: "Workflows", used: usage.workflows, limit: usage.limitWorkflows },
              { label: "Executions (month)", used: usage.executionsThisMonth, limit: usage.limitMonthlyExecutions },
              { label: "AI generations (month)", used: usage.aiGenerationsThisMonth, limit: usage.limitAiGenerations },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="tabular-nums">{row.used} / {row.limit}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={`h-full rounded-full ${row.used / row.limit >= 0.9 ? "bg-error" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, (row.used / row.limit) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/billing">Plans & usage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
