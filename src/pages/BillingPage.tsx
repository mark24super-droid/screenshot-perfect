import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CreditCard, Info, Sparkles } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { SettingsNav } from "../components/settings/SettingsNav";
import { Badge, Card, CardBody, CardHeader, Progress, Skeleton } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Dialog";
import { ErrorState } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { BillingPlansResponse } from "../lib/types";
import { cn, formatDateTime } from "../lib/utils";
import type { PlanDefinition } from "@shared/plans";

export default function BillingPage() {
  const { refresh, workspace } = useAuth();
  const { toast } = useToast();
  const [data, setData] = React.useState<BillingPlansResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<PlanDefinition | null>(null);
  const [changing, setChanging] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<BillingPlansResponse>("/billing/plans"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const changePlan = async () => {
    if (!target) return;
    setChanging(true);
    try {
      const result = await apiPost<{ message: string }>("/billing/change-plan", { plan: target.id });
      toast({ title: "Plan updated for evaluation", description: result.message, variant: "warning" });
      setTarget(null);
      await refresh();
      await load();
    } catch (err) {
      toast({ title: "Could not change plan", description: errorMessage(err), variant: "error" });
    } finally {
      setChanging(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-7 w-48" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
          <Skeleton className="h-40 w-full" />
          <div className="space-y-4">
            <Skeleton className="h-44 w-full" />
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-80 w-full" />
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="Billing & usage" />
        <ErrorState className="mt-5" description={error ?? "Billing information could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const usage = data.usage;
  const currentPlan = data.plans.find((plan) => plan.id === data.currentPlan) ?? data.plans[0];
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";

  return (
    <PageContainer>
      <PageTitle
        title="Billing & usage"
        description="Plan limits are enforced by the server. Payments are not configured on this deployment, so no charge can be made."
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <SettingsNav />
        <div className="space-y-5">
          {!data.billingConfigured ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11.5px] leading-relaxed text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">No payment provider is connected</p>
                <p className="mt-0.5">{data.message}</p>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Current plan</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">
                  {currentPlan.tagline} Period {formatDateTime(usage.periodStart)} – {formatDateTime(usage.periodEnd)}.
                </p>
              </div>
              <Badge tone="purple">{currentPlan.name}</Badge>
            </CardHeader>
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <UsageMeter label="Automations" used={usage.workflows.used} limit={usage.workflows.limit} />
                <UsageMeter label="Executions" used={usage.executions.used} limit={usage.executions.limit} />
                <UsageMeter label="AI generations" used={usage.aiGenerations.used} limit={usage.aiGenerations.limit} />
                <UsageMeter label="Connections" used={usage.connections.used} limit={usage.connections.limit} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-app/50 px-3 py-2 text-[10.5px] text-ink-secondary">
                <Info size={12} /> History retention: {usage.historyDays} days. Usage resets each calendar month; history is not deleted
                early, only hidden outside the retention window.
              </div>
            </CardBody>
          </Card>

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Plans</h2>
                <p className="text-[11px] text-ink-secondary">All limits are enforced. No plan promises unlimited usage.</p>
              </div>
              {!canManage ? <p className="text-[10.5px] text-ink-secondary">Only the workspace owner can change plans.</p> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {data.plans.map((plan) => {
                const current = plan.id === data.currentPlan;
                return (
                  <Card key={plan.id} className={cn("flex flex-col", plan.highlighted && "border-primary/30 ring-1 ring-primary/10")}>
                    <CardBody className="flex flex-1 flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-ink">{plan.name}</h3>
                        {current ? <Badge tone="success">Current</Badge> : plan.highlighted ? <Badge tone="purple">Popular</Badge> : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{plan.tagline}</p>
                      <p className="mt-3">
                        <span className="text-[26px] font-semibold tracking-[-0.02em] text-ink">${plan.priceMonthlyUsd}</span>
                        <span className="text-[11px] text-ink-secondary"> / month</span>
                      </p>
                      <p className="text-[10px] text-ink-secondary">{plan.priceMonthlyUsd === 0 ? "No card required" : "Billing not configured — evaluation only"}</p>

                      <ul className="mt-3 flex-1 space-y-1.5 border-t border-line pt-3">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                            <Check size={11} className="mt-0.5 shrink-0 text-success" /> {feature}
                          </li>
                        ))}
                      </ul>

                      <Button
                        className="mt-4 w-full"
                        variant={current ? "secondary" : plan.highlighted ? "primary" : "secondary"}
                        disabled={current || !canManage}
                        onClick={() => setTarget(plan)}
                      >
                        {current ? "Current plan" : canManage ? "Switch plan (evaluation)" : "Owner only"}
                      </Button>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>

          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                <CreditCard size={15} /> Invoices and payment methods
              </h2>
            </CardHeader>
            <CardBody>
              <div className="rounded-lg border border-dashed border-line bg-app/40 p-5 text-center">
                <p className="text-[12px] font-medium text-ink">No payment provider connected</p>
                <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-ink-secondary">
                  Invoices, receipts, cards and subscriptions are unavailable because this deployment has no billing integration. The
                  plan switcher above records an evaluation change only. It does not create a subscription or charge a card.
                </p>
                <Link to="/help#billing" className="mt-2 inline-flex text-[11px] font-medium text-primary hover:underline">
                  Read what is implemented
                </Link>
              </div>
            </CardBody>
          </Card>

          <div className="rounded-xl border border-primary/15 bg-primary-soft/60 p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
              <Sparkles size={14} /> Need a higher limit?
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
              Limits are defined centrally in <code className="font-mono text-[10px]">shared/plans.ts</code>. A production deployment can
              connect a payment provider and enforce entitlements from the same plan definitions.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void changePlan()}
        title={`Switch to ${target?.name ?? "this plan"}?`}
        description={
          <>
            This changes the workspace plan for <strong className="font-medium text-ink">evaluation only</strong>. No payment will be
            taken, no subscription will be created, and no invoice will be generated. Limits change immediately.
          </>
        }
        confirmLabel="Switch for evaluation"
        tone="primary"
        loading={changing}
      />
    </PageContainer>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink">{label}</span>
        <span className="text-[10px] tabular-nums text-ink-secondary">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <Progress value={percent} tone={percent >= 100 ? "danger" : percent >= 80 ? "warning" : "primary"} className="mt-1.5" />
      <p className="mt-1 text-[10px] text-ink-secondary">{percent}% of plan limit used</p>
    </div>
  );
}
