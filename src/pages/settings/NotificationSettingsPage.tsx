import * as React from "react";
import { Bell, Info, Mail, Save } from "lucide-react";
import { PageContainer, PageTitle } from "../../components/layout/AppShell";
import { SettingsNav } from "../../components/settings/SettingsNav";
import { Card, CardBody, CardHeader, Skeleton } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Input";
import { ErrorState } from "../../components/ui/Misc";
import { useToast } from "../../components/ui/Toast";
import { apiGet, apiPatch, errorMessage } from "../../lib/api";
import type { SettingsPayload } from "../../lib/types";

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ emailNotifications: false, executionNotifications: true, weeklyDigest: false });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<SettingsPayload>("/settings");
      setData(response);
      setForm({
        emailNotifications: response.settings.emailNotifications,
        executionNotifications: response.settings.executionNotifications,
        weeklyDigest: response.settings.weeklyDigest,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await apiPatch<SettingsPayload>("/settings", form);
      setData(response);
      toast({ title: "Notification preferences saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save preferences", description: errorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-7 w-48" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
          <Skeleton className="h-40 w-full" />
          <Card>
            <CardBody className="space-y-5">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-12 w-full" />
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
        <PageTitle title="Notifications" />
        <ErrorState className="mt-5" description={error ?? "Notification settings could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const emailDelivery = data.flags.emailDeliveryConfigured;

  return (
    <PageContainer>
      <PageTitle title="Notifications" description="Choose which execution updates you want to receive. Preferences are stored per user." />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <SettingsNav />
        <div className="space-y-5">
          {!emailDelivery ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11.5px] leading-relaxed text-amber-900">
              <Info size={15} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Email delivery is not configured on this server</p>
                <p className="mt-0.5">
                  Your preferences are saved, but FlowMate cannot send email notifications until the deployment operator configures an
                  email provider. Execution history remains available in the app.
                </p>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <Bell size={15} /> Execution notifications
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">These settings control future notifications only.</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-5">
              <Switch
                checked={form.executionNotifications}
                onChange={(checked) => setForm({ ...form, executionNotifications: checked })}
                label="Notify me when an automation fails"
                description="A failed execution is recorded regardless of this preference. This controls an additional notification."
              />
              <div className="h-px bg-line" />
              <Switch
                checked={form.emailNotifications}
                onChange={(checked) => setForm({ ...form, emailNotifications: checked })}
                label="Email me about workflow changes"
                description={emailDelivery ? "Receive email when a workflow is activated, paused or changed by another member." : "Saved for when email delivery is configured. No email is sent on this deployment."}
                disabled={!emailDelivery}
              />
              <div className="h-px bg-line" />
              <Switch
                checked={form.weeklyDigest}
                onChange={(checked) => setForm({ ...form, weeklyDigest: checked })}
                label="Weekly usage digest"
                description={emailDelivery ? "A weekly summary of executions, failures and plan usage." : "Saved for when email delivery is configured. No digest is sent on this deployment."}
                disabled={!emailDelivery}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <p className="flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
                  <Mail size={12} /> Email delivery: {emailDelivery ? "configured" : "not configured"}
                </p>
                <Button onClick={() => void save()} loading={saving}>
                  <Save size={14} /> Save preferences
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="text-[12px] font-semibold text-ink">What is always recorded</h3>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-secondary">
                <li>• Every execution attempt, including simulated runs, with status and duration.</li>
                <li>• Per-step inputs and outputs after sanitization.</li>
                <li>• Error codes and messages for failed steps.</li>
                <li>• Execution history is retained according to your plan&apos;s history window.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
