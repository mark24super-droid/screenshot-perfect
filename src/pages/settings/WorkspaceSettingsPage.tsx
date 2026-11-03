import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Check, CreditCard, Info, Plus, Save, Users } from "lucide-react";
import { PageContainer, PageTitle } from "../../components/layout/AppShell";
import { SettingsNav } from "../../components/settings/SettingsNav";
import { Badge, Card, CardBody, CardHeader, Skeleton } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { FieldError, Input, Label } from "../../components/ui/Input";
import { ErrorState } from "../../components/ui/Misc";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { apiGet, apiPatch, apiPost, errorMessage } from "../../lib/api";
import type { SettingsPayload, Workspace } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";

interface WorkspaceListResponse {
  items: Array<Workspace & { workflowCount: number; active: boolean }>;
}

export default function WorkspaceSettingsPage() {
  const { workspace, refresh, selectWorkspace } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [items, setItems] = React.useState<WorkspaceListResponse["items"]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [switching, setSwitching] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, list] = await Promise.all([
        apiGet<SettingsPayload>("/settings"),
        apiGet<WorkspaceListResponse>("/workspaces"),
      ]);
      setData(settings);
      setName(settings.workspace.name);
      setItems(list.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError("Enter a workspace name with at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      await apiPatch("/settings", { workspaceName: name.trim() });
      await refresh();
      toast({ title: "Workspace renamed", variant: "success" });
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const createWorkspace = async () => {
    if (newName.trim().length < 2) return;
    setCreating(true);
    try {
      const created = await apiPost<{ id: string }>("/workspaces", { name: newName.trim() });
      await refresh();
      await selectWorkspace(created.id);
      setCreateOpen(false);
      setNewName("");
      toast({ title: "Workspace created", description: "Switched to the new workspace. It starts on the Free plan.", variant: "success" });
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Could not create workspace", description: errorMessage(err), variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const switchTo = async (id: string) => {
    if (id === workspace?.id) return;
    setSwitching(id);
    try {
      await selectWorkspace(id);
      toast({ title: "Workspace switched", variant: "success" });
      await load();
    } catch (err) {
      toast({ title: "Could not switch workspace", description: errorMessage(err), variant: "error" });
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-7 w-52" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
          <Skeleton className="h-40 w-full" />
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="Workspace settings" />
        <ErrorState className="mt-5" description={error ?? "Workspace settings could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const isOwner = data.workspace.plan !== undefined && workspace?.role === "owner";

  return (
    <PageContainer>
      <PageTitle
        title="Workspace settings"
        description="Workspace name, plan and separation. Automations, connections and usage are scoped to each workspace."
        actions={
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> New workspace
          </Button>
        }
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <SettingsNav />
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <Building2 size={15} /> Current workspace
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Only owners and admins can rename a workspace.</p>
              </div>
              <Badge tone={data.workspace.isDemo ? "warning" : "purple"}>{data.workspace.isDemo ? "Demo" : data.workspace.plan}</Badge>
            </CardHeader>
            <CardBody>
              <form onSubmit={saveName} className="space-y-3">
                <div className="max-w-md">
                  <Label htmlFor="workspace-name" required>
                    Workspace name
                  </Label>
                  <Input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={!isOwner} />
                  <p className="hint">Changing the name does not change its ID, data or connections.</p>
                  <FieldError>{formError}</FieldError>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={saving} disabled={!isOwner || name.trim() === data.workspace.name}>
                    <Save size={14} /> Save name
                  </Button>
                  <Link to="/billing">
                    <Button variant="secondary" type="button">
                      <CreditCard size={14} /> Plan & usage
                    </Button>
                  </Link>
                </div>
              </form>
              <dl className="mt-4 grid gap-3 border-t border-line pt-3 text-[11.5px] sm:grid-cols-3">
                <div>
                  <dt className="text-ink-secondary">Plan</dt>
                  <dd className="mt-0.5 font-medium capitalize text-ink">{data.workspace.plan}</dd>
                </div>
                <div>
                  <dt className="text-ink-secondary">Your role</dt>
                  <dd className="mt-0.5 font-medium capitalize text-ink">{workspace?.role ?? "member"}</dd>
                </div>
                <div>
                  <dt className="text-ink-secondary">History retention</dt>
                  <dd className="mt-0.5 font-medium text-ink">{data.usage.historyDays} days</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13.5px] font-semibold text-ink">Your workspaces</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Switch without signing out. Each workspace has separate data and usage.</p>
              </div>
              <Badge tone="outline">{items.length}</Badge>
            </CardHeader>
            <div className="divide-y divide-line">
              {items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Building2 size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[12px] font-medium text-ink">{item.name}</p>
                      {item.active ? <Badge tone="success">Current</Badge> : null}
                      {item.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                    </div>
                    <p className="text-[10.5px] text-ink-secondary">
                      {item.plan} plan · {item.workflowCount} automations · role {item.role}
                    </p>
                  </div>
                  {item.active ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-success">
                      <Check size={12} /> Active
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" loading={switching === item.id} onClick={() => void switchTo(item.id)}>
                      Switch <ArrowRight size={12} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <Users size={15} /> Members
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">Member management is not implemented in this release.</p>
              </div>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-3 rounded-lg border border-line bg-app/40 p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  {(data.user.name || "U")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">{data.user.name}</p>
                  <p className="truncate text-[10.5px] text-ink-secondary">{data.user.email}</p>
                </div>
                <Badge tone="purple">{workspace?.role ?? "owner"}</Badge>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-white p-3 text-[10.5px] leading-relaxed text-ink-secondary">
                <Info size={13} className="mt-0.5 shrink-0 text-info" />
                <span>
                  This build supports one owner per workspace. Inviting teammates, roles and shared editing are not available yet and are
                  not simulated. The current member list only shows the signed-in account.
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[13.5px] font-semibold text-ink">Workspace data</h2>
            </CardHeader>
            <CardBody className="grid gap-3 text-[11.5px] sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-app/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Automations</p>
                <p className="mt-1 text-[18px] font-semibold text-ink">{data.usage.workflows.used}</p>
                <p className="text-[10.5px] text-ink-secondary">of {data.usage.workflows.limit} allowed</p>
              </div>
              <div className="rounded-lg border border-line bg-app/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Connections</p>
                <p className="mt-1 text-[18px] font-semibold text-ink">{data.usage.connections.used}</p>
                <p className="text-[10.5px] text-ink-secondary">of {data.usage.connections.limit} allowed</p>
              </div>
              <div className="rounded-lg border border-line bg-app/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Period</p>
                <p className="mt-1 text-[11px] font-medium text-ink">{formatDateTime(data.usage.periodStart)}</p>
                <p className="text-[10.5px] text-ink-secondary">to {formatDateTime(data.usage.periodEnd)}</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a workspace"
        description="A new workspace starts on the Free plan with its own automations, connections and usage. You can switch back at any time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void createWorkspace()} loading={creating} disabled={newName.trim().length < 2}>
              Create workspace
            </Button>
          </>
        }
      >
        <Label htmlFor="new-workspace-name">Workspace name</Label>
        <Input id="new-workspace-name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} autoFocus placeholder="e.g. Client automations" />
      </Dialog>
    </PageContainer>
  );
}
