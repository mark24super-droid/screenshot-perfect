import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Info } from "lucide-react";
import { getDashboardSummary } from "@/lib/workflows.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PLANS } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Usage — FlowMate AI" },
      { name: "description", content: "Your plan, usage against limits, and available plans." },
      { property: "og:title", content: "Billing & Usage — FlowMate AI" },
      { property: "og:description", content: "Your plan, usage against limits, and available plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const fetchSummary = useServerFn(getDashboardSummary);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchSummary(), retry: 1 });
  const usage = data?.usage;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader title="Billing & Usage" subtitle="Usage is counted monthly and enforced honestly." />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Payments are coming soon</AlertTitle>
        <AlertDescription>
          Plan limits below are already enforced in the app. Checkout isn't wired up yet, so upgrading isn't possible at this stage — nothing will ever be charged without a real payment flow.
        </AlertDescription>
      </Alert>

      {usage && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Current plan</div>
                <div className="text-2xl font-semibold">{data?.planName ?? "Free"}</div>
              </div>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3 text-sm">
              {[
                { label: "Workflows", used: usage.workflows, limit: usage.limitWorkflows },
                { label: "Executions this month", used: usage.executionsThisMonth, limit: usage.limitMonthlyExecutions },
                { label: "AI generations this month", used: usage.aiGenerationsThisMonth, limit: usage.limitAiGenerations },
              ].map((row) => (
                <div key={row.label} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{row.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{row.used} <span className="text-sm font-normal text-muted-foreground">/ {row.limit}</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={plan.id === "pro" ? "border-primary" : ""}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{plan.name}</div>
                {(data?.planName ?? "Free") === plan.name && <Badge className="bg-success/15 text-success hover:bg-success/15">Current</Badge>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold">{plan.priceLabel}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}</li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant="outline" disabled>
                Upgrade soon
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Questions about limits? <Link to="/help" className="text-primary hover:underline">Read the help page</Link>.
      </p>
    </div>
  );
}
