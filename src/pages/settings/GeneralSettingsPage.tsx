import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, Laptop, LogOut, Save, Shield, Trash2 } from "lucide-react";
import { PageContainer, PageTitle } from "../../components/layout/AppShell";
import { SettingsNav } from "../../components/settings/SettingsNav";
import { Badge, Card, CardBody, CardHeader, Skeleton } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { FieldError, Input, Label, Select, Textarea } from "../../components/ui/Input";
import { ErrorState } from "../../components/ui/Misc";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "../../lib/api";
import type { SessionInfo, SettingsPayload } from "../../lib/types";
import { TIMEZONES } from "../../lib/timezones";
import { formatDateTime, relativeTime } from "../../lib/utils";

export default function GeneralSettingsPage() {
  const { refresh, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", timezone: "UTC", defaultExecutionMode: "simulation", saveBehavior: "autosave" });
  const [formError, setFormError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);
  const [sessionToRevoke, setSessionToRevoke] = React.useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [password, setPassword] = React.useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteMessage, setDeleteMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<SettingsPayload>("/settings");
      setData(response);
      setForm({
        name: response.user.name,
        timezone: response.settings.timezone,
        defaultExecutionMode: response.settings.defaultExecutionMode,
        saveBehavior: response.settings.saveBehavior,
      });
      const sessionResponse = await apiGet<{ sessions: SessionInfo[] }>("/auth/sessions");
      setSessions(sessionResponse.sessions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (form.name.trim().length < 2) {
      setFormError("Enter a name with at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiPatch<SettingsPayload>("/settings", {
        name: form.name.trim(),
        timezone: form.timezone,
        defaultExecutionMode: form.defaultExecutionMode,
        saveBehavior: form.saveBehavior,
      });
      setData(response);
      await refresh();
      toast({ title: "Settings saved", description: "Your preferences were updated.", variant: "success" });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const revokeSession = async () => {
    if (!sessionToRevoke) return;
    setRevoking(true);
    try {
      const result = await apiDelete<{ wasCurrent: boolean }>(`/auth/sessions/${sessionToRevoke.id}`);
      toast({ title: "Session revoked", description: result.wasCurrent ? "You will be signed out." : "That device was signed out.", variant: "success" });
      setSessionToRevoke(null);
      if (result.wasCurrent) {
        await refresh();
        navigate("/login");
      } else {
        await load();
      }
    } catch (err) {
      toast({ title: "Could not revoke session", description: errorMessage(err), variant: "error" });
    } finally {
      setRevoking(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (password.next.length < 8) {
      setPasswordError("Use at least 8 characters for the new password.");
      return;
    }
    if (password.next !== password.confirm) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPost("/auth/change-password", { currentPassword: password.current, newPassword: password.next });
      setPassword({ current: "", next: "", confirm: "" });
      toast({ title: "Password changed", description: "Other sessions were signed out for safety.", variant: "success" });
      await load();
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  };

  const requestDeletion = async () => {
    setDeleteLoading(true);
    try {
      const result = await apiPost<{ message: string }>("/settings/delete-request", {
        confirm: true,
        reason: deleteReason.trim() || undefined,
      });
      setDeleteMessage(result.message);
      setDeleteOpen(false);
      toast({ title: "Request recorded", description: "Your account has not been deleted yet.", variant: "warning" });
    } catch (err) {
      toast({ title: "Could not submit request", description: errorMessage(err), variant: "error" });
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <SettingsSkeleton />;
  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="General settings" />
        <ErrorState className="mt-5" description={error ?? "Settings could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageTitle title="Settings" description="Personal preferences and account security. Workspace-wide settings are separate." />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <SettingsNav />
        <div className="min-w-0 space-y-5">
          <form onSubmit={save}>
            <Card>
              <CardHeader>
                <div>
                  <h2 className="text-[13.5px] font-semibold text-ink">Preferences</h2>
                  <p className="mt-0.5 text-[11px] text-ink-secondary">Used as defaults for new workflows and editor behaviour.</p>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="settings-name" required>
                      Display name
                    </Label>
                    <Input id="settings-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} />
                  </div>
                  <div>
                    <Label htmlFor="settings-email">Email</Label>
                    <Input id="settings-email" value={data.user.email} disabled />
                    <p className="hint">Email changes are not available in this release.</p>
                  </div>
                  <div>
                    <Label htmlFor="settings-timezone">Timezone</Label>
                    <Select id="settings-timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                      {TIMEZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="settings-mode">Default execution mode</Label>
                    <Select
                      id="settings-mode"
                      value={form.defaultExecutionMode}
                      onChange={(event) => setForm({ ...form, defaultExecutionMode: event.target.value })}
                    >
                      <option value="simulation">Simulation (recommended)</option>
                      <option value="live">Live</option>
                    </Select>
                    <p className="hint">Live still requires a connected account and valid live validation.</p>
                  </div>
                  <div>
                    <Label htmlFor="settings-save">Editor save behaviour</Label>
                    <Select id="settings-save" value={form.saveBehavior} onChange={(event) => setForm({ ...form, saveBehavior: event.target.value })}>
                      <option value="autosave">Autosave changes</option>
                      <option value="manual">Save manually</option>
                    </Select>
                    <p className="hint">Autosave waits for a short pause and saves a new version only when content changes.</p>
                  </div>
                </div>
                {formError ? <FieldError>{formError}</FieldError> : null}
                <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                  <Button type="submit" loading={saving}>
                    <Save size={14} /> Save preferences
                  </Button>
                </div>
              </CardBody>
            </Card>
          </form>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Active sessions</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Sessions use an httpOnly cookie. Revoke any device you do not recognize.</p>
              </div>
              <Badge tone="outline">{sessions.length}</Badge>
            </CardHeader>
            <div className="divide-y divide-line">
              {sessions.length === 0 ? (
                <p className="px-4 py-4 text-[12px] text-ink-secondary">No sessions recorded.</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app text-ink-secondary">
                      <Laptop size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {session.userAgent}
                        {session.current ? <span className="ml-2 text-[10px] font-medium text-success">This device</span> : null}
                      </p>
                      <p className="text-[10.5px] text-ink-secondary">
                        Started {formatDateTime(session.createdAt)} · expires {relativeTime(session.expiresAt)}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setSessionToRevoke(session)}>
                      <LogOut size={12} /> Revoke
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Password</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">
                  {data.user.isDemo ? "The shared demo password is fixed and cannot be changed." : "Changing your password signs out every other session."}
                </p>
              </div>
              <Shield size={16} className="text-ink-secondary" />
            </CardHeader>
            <CardBody>
              {data.user.isDemo ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                  You are signed in to the shared demo account. Create your own account to set a password and keep private data.
                </div>
              ) : (
                <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="current-password">Current password</Label>
                    <Input id="current-password" type="password" autoComplete="current-password" value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="new-password">New password</Label>
                    <Input id="new-password" type="password" autoComplete="new-password" value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input id="confirm-password" type="password" autoComplete="new-password" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} />
                  </div>
                  {passwordError ? (
                    <div className="sm:col-span-3">
                      <FieldError>{passwordError}</FieldError>
                    </div>
                  ) : null}
                  <div className="sm:col-span-3 flex justify-end border-t border-line pt-3">
                    <Button type="submit" variant="secondary" loading={changingPassword}>
                      Change password
                    </Button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>

          <Card className="border-danger/25">
            <CardHeader>
              <div>
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-danger">
                  <AlertTriangle size={15} /> Danger zone
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Account deletion is handled manually by the deployment operator.</p>
              </div>
            </CardHeader>
            <CardBody>
              {deleteMessage ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">{deleteMessage}</div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-medium text-ink">Request account deletion</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                    This records a request for the operator. It does not immediately delete your account or data.
                  </p>
                </div>
                <Button variant="danger-outline" onClick={() => setDeleteOpen(true)} disabled={data.user.isDemo}>
                  <Trash2 size={14} /> Request deletion
                </Button>
              </div>
              {data.user.isDemo ? <p className="mt-2 text-[10.5px] text-ink-secondary">The shared demo account cannot be deleted. Sign out to leave the demo.</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(sessionToRevoke)}
        onClose={() => setSessionToRevoke(null)}
        onConfirm={() => void revokeSession()}
        title="Revoke this session?"
        description={sessionToRevoke?.current ? "This is your current session. Revoking it signs you out immediately." : "That device will need to sign in again."}
        confirmLabel="Revoke session"
        loading={revoking}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Request account deletion"
        description="The deployment operator processes deletion requests manually. Submitting this form does not delete anything yet."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void requestDeletion()} loading={deleteLoading}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-relaxed text-rose-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Your automations, connections and execution history are not deleted by this request. The operator must process it.</span>
          </div>
          <div>
            <Label htmlFor="delete-reason">Reason (optional)</Label>
            <Textarea id="delete-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} maxLength={500} placeholder="Tell the operator why you are requesting deletion." />
          </div>
        </div>
      </Dialog>
    </PageContainer>
  );
}

function SettingsSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-7 w-40" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <div className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-8 w-full" />
          ))}
        </div>
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-10 w-full" />
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
