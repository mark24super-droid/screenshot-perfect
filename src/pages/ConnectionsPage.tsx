import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, FlaskConical, KeyRound, Plug, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, CardBody, CardHeader, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Dialog";
import { EmptyState, ErrorState } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { ProviderIcon } from "../lib/icons";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { ConnectionSummary } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, providerLabel } from "../lib/utils";

interface ConnectionsResponse {
  connections: ConnectionSummary[];
}

export default function ConnectionsPage() {
  const { workspace } = useAuth();
  const { toast } = useToast();
  const [data, setData] = React.useState<ConnectionsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<ConnectionSummary | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<ConnectionsResponse>("/integrations/connections"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const check = async (connection: ConnectionSummary) => {
    setBusy(connection.provider);
    try {
      const result = await apiPost<{ status: string; message: string }>(`/integrations/${connection.provider}/check`);
      toast({
        title: result.status === "connected" ? "Connection verified" : "Check did not pass",
        description: result.message,
        variant: result.status === "connected" ? "success" : "error",
      });
      await load();
    } catch (err) {
      toast({ title: "Could not check connection", description: errorMessage(err), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!target) return;
    setBusy(target.provider);
    try {
      const result = await apiPost<{ note?: string }>(`/integrations/${target.provider}/disconnect`);
      toast({ title: "Connection removed", description: result.note ?? "Local credentials were removed.", variant: "success" });
      setTarget(null);
      await load();
    } catch (err) {
      toast({ title: "Could not disconnect", description: errorMessage(err), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const realConnections = (data?.connections ?? []).filter((connection) => connection.status === "connected");
  const demoConnections = (data?.connections ?? []).filter((connection) => connection.status === "demo");

  return (
    <PageContainer>
      <PageTitle
        title="Connections"
        description="Accounts linked to this workspace. Connections are shared by every automation in the workspace."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
            <Link to="/integrations">
              <Button>
                <Plug size={15} /> Manage integrations
              </Button>
            </Link>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[11px] text-ink-secondary">
        <Building2 size={13} />
        Workspace: <strong className="font-medium text-ink">{workspace?.name}</strong>
        <Badge tone="outline">{workspace?.plan}</Badge>
        {workspace?.isDemo ? <Badge tone="warning">Demo workspace</Badge> : null}
        <Link to="/settings/workspace" className="ml-auto font-medium text-primary hover:underline">
          Workspace settings
        </Link>
      </div>

      {loading ? (
        <div className="mt-5 space-y-3">
          {[0, 1].map((item) => (
            <Card key={item}>
              <CardBody className="space-y-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-64" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState className="mt-5" description={error} onRetry={() => void load()} />
      ) : !data ? null : (
        <div className="mt-5 space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Connected accounts</h2>
              <span className="text-[10.5px] text-ink-secondary">{realConnections.length} real</span>
            </div>
            {realConnections.length === 0 ? (
              <EmptyState
                icon={<Plug size={20} />}
                title="No real accounts connected"
                description="Simulation mode works without connections. To run live Gmail or Google Sheets actions, connect an account in Integrations."
                action={
                  <Link to="/integrations">
                    <Button variant="secondary">
                      Open integrations <ArrowRight size={13} />
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {realConnections.map((connection) => (
                  <ConnectionCard
                    key={connection.provider}
                    connection={connection}
                    busy={busy === connection.provider}
                    onCheck={() => void check(connection)}
                    onDisconnect={() => setTarget(connection)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Demo connections</h2>
              <span className="text-[10.5px] text-ink-secondary">{demoConnections.length} simulated</span>
            </div>
            {demoConnections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-white/60 p-4 text-[11px] leading-relaxed text-ink-secondary">
                No demo connections in this workspace.{" "}
                {workspace?.isDemo ? "You can add them from Integrations to explore the UI." : "Demo connections are only available in the demo workspace."}
              </div>
            ) : (
              <div className="space-y-3">
                {demoConnections.map((connection) => (
                  <ConnectionCard
                    key={connection.provider}
                    connection={connection}
                    busy={busy === connection.provider}
                    onCheck={() => void check(connection)}
                    onDisconnect={() => setTarget(connection)}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardBody>
                <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                  <ShieldCheck size={14} className="text-success" /> Credential handling
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
                  OAuth tokens are stored only on the server and encrypted with AES-256-GCM. With{" "}
                  <code className="font-mono text-[10px]">TOKEN_ENCRYPTION_KEY</code> set, your own secret is used; otherwise a built-in
                  development key applies. Tokens are never sent to the browser.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                  <KeyRound size={14} className="text-primary" /> Revoking access
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
                  Disconnecting removes local credentials and asks Google to revoke the refresh token. You can also review or remove
                  access directly at myaccount.google.com/permissions.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void disconnect()}
        title={`Disconnect ${target ? providerLabel(target.provider) : "account"}?`}
        description="This removes the stored credentials for the workspace and attempts Google revocation. Live workflows using this provider will be blocked until you reconnect."
        confirmLabel="Disconnect account"
        loading={busy === target?.provider}
      />
    </PageContainer>
  );
}

function ConnectionCard({
  connection,
  busy,
  onCheck,
  onDisconnect,
}: {
  connection: ConnectionSummary;
  busy: boolean;
  onCheck: () => void;
  onDisconnect: () => void;
}) {
  const isDemo = connection.status === "demo";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <ProviderIcon provider={connection.provider} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ink">{providerLabel(connection.provider)}</h3>
              <StatusBadge status={connection.status} />
              {isDemo ? (
                <Badge tone="info">
                  <FlaskConical size={10} /> No real account
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-secondary">
              {isDemo ? "Demo (simulated)" : connection.accountLabel || "Connected Google account"}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {!isDemo ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={onCheck}>
              <RefreshCw size={12} /> Check
            </Button>
          ) : null}
          <Button size="sm" variant="danger-outline" onClick={onDisconnect}>
            <Unplug size={12} /> Remove
          </Button>
        </div>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Connected</p>
          <p className="mt-0.5 text-[11px] text-ink">{connection.connectedAt ? formatDateTime(connection.connectedAt) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Last checked</p>
          <p className="mt-0.5 text-[11px] text-ink">{connection.lastCheckedAt ? formatDateTime(connection.lastCheckedAt) : "Never"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Refresh token</p>
          <p className="mt-0.5 text-[11px] text-ink">{connection.hasRefreshToken ? "Stored server-side" : isDemo ? "Not applicable" : "Not available"}</p>
        </div>
        <div className="sm:col-span-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Granted scopes</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {connection.scopes.length === 0 ? (
              <span className="text-[10.5px] text-ink-secondary">{isDemo ? "Simulation only — no Google scopes granted." : "No scopes recorded."}</span>
            ) : (
              connection.scopes.map((scope) => (
                <code key={scope} className="rounded border border-line bg-app/70 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-secondary">
                  {scope.split("/").pop()}
                </code>
              ))
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
