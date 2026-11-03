import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unplug,
  XCircle,
} from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, CardBody, CardHeader, Skeleton, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Dialog";
import { EmptyState, ErrorState } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { ProviderIcon } from "../lib/icons";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { IntegrationsResponse, IntegrationProvider } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, providerLabel } from "../lib/utils";

const OAUTH_ERRORS: Record<string, string> = {
  oauth_not_configured: "Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to enable real connections.",
  oauth_denied: "Google access was denied. No account was connected.",
  oauth_failed: "Google returned an error during sign-in. Nothing was connected.",
  state_mismatch: "The OAuth state check failed, so the connection was rejected. Start again from this page.",
  session_mismatch: "Your session changed during OAuth. Sign in again and retry.",
  missing_code: "Google did not return an authorization code. Nothing was connected.",
  token_exchange_failed: "Google rejected the token exchange. Check the OAuth client configuration and redirect URI.",
  connection_failed: "The connection could not be saved. Nothing was changed.",
};

export default function IntegrationsPage() {
  const { workspace, flags } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState<IntegrationsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyProvider, setBusyProvider] = React.useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = React.useState<IntegrationProvider | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<IntegrationsResponse>("/integrations"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const connected = params.get("connected");
    const oauthError = params.get("error");
    if (!connected && !oauthError) return;
    if (connected) {
      toast({ title: `${providerLabel(connected)} connected`, description: "Credentials were stored server-side. Run a test in the editor before live use.", variant: "success" });
    }
    if (oauthError) {
      toast({ title: "Google connection failed", description: OAUTH_ERRORS[oauthError] ?? "The connection could not be completed.", variant: "error" });
    }
    const next = new URLSearchParams(params);
    next.delete("connected");
    next.delete("error");
    setParams(next, { replace: true });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const checkConnection = async (provider: IntegrationProvider) => {
    setBusyProvider(provider.provider);
    try {
      const result = await apiPost<{ status: string; message: string }>(`/integrations/${provider.provider}/check`);
      toast({
        title: result.status === "connected" ? "Connection verified" : "Connection check failed",
        description: result.message,
        variant: result.status === "connected" ? "success" : "error",
      });
      await load();
    } catch (err) {
      toast({ title: "Could not verify connection", description: errorMessage(err), variant: "error" });
    } finally {
      setBusyProvider(null);
    }
  };

  const connectDemo = async (provider: IntegrationProvider) => {
    setBusyProvider(provider.provider);
    try {
      const result = await apiPost<{ note: string }>(`/integrations/${provider.provider}/demo-connect`);
      toast({ title: "Demo connection added", description: result.note, variant: "success" });
      await load();
    } catch (err) {
      toast({ title: "Could not add demo connection", description: errorMessage(err), variant: "error" });
    } finally {
      setBusyProvider(null);
    }
  };

  const disconnect = async () => {
    if (!disconnectTarget) return;
    setBusyProvider(disconnectTarget.provider);
    try {
      const result = await apiPost<{ note?: string }>(`/integrations/${disconnectTarget.provider}/disconnect`);
      toast({
        title: "Connection removed",
        description: result.note ?? "Local credentials were removed from this workspace.",
        variant: "success",
      });
      setDisconnectTarget(null);
      await load();
    } catch (err) {
      toast({ title: "Could not disconnect", description: errorMessage(err), variant: "error" });
    } finally {
      setBusyProvider(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <PageTitle title="Integrations" description="Connect the accounts your automations use." />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((item) => (
            <Card key={item}>
              <CardBody className="space-y-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-32" />
              </CardBody>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="Integrations" description="Connect the accounts your automations use." />
        <ErrorState className="mt-5" description={error ?? "Integrations could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const oauthReady = data.oauthConfigured;

  return (
    <PageContainer>
      <PageTitle
        title="Integrations"
        description="Connect Gmail and Google Sheets, or keep everything in simulation mode. FlowMate never performs an external action without a connected account and a live run."
        actions={
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            <RefreshCw size={15} /> Refresh status
          </Button>
        }
      />

      {!oauthReady ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-900">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Google OAuth is not configured on this server</p>
            <p className="mt-1">
              Real Gmail and Google Sheets connections are unavailable. Simulation mode works without credentials, and demo
              connections are clearly labelled. To enable live connections, set{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[10.5px]">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[10.5px]">GOOGLE_CLIENT_SECRET</code>,{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[10.5px]">GOOGLE_REDIRECT_URI</code> and{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[10.5px]">TOKEN_ENCRYPTION_KEY</code> on the server, then restart.
            </p>
          </div>
        </div>
      ) : null}

      {!data.tokenEncryptionConfigured && oauthReady ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Token encryption key is missing.</strong> Connections still work, but stored OAuth tokens
            would use a built-in development key instead of your own secret. Set{" "}
            <code className="rounded bg-white/70 px-1 font-mono text-[10px]">TOKEN_ENCRYPTION_KEY</code> before connecting a real account.
          </span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {data.providers.map((provider) => (
          <Card key={provider.provider} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start gap-3">
                <ProviderIcon provider={provider.provider} />
                <div>
                  <h2 className="text-[14px] font-semibold text-ink">{provider.name}</h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{provider.description}</p>
                </div>
              </div>
              <StatusBadge status={provider.status} />
            </CardHeader>
            <CardBody className="flex flex-1 flex-col">
              <div className="rounded-lg border border-line bg-app/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Account</span>
                  {provider.status === "demo" ? <Badge tone="info">Simulated</Badge> : null}
                </div>
                <p className="mt-1 text-[12px] font-medium text-ink">
                  {provider.status === "connected"
                    ? provider.accountLabel || "Google account"
                    : provider.status === "demo"
                      ? "Demo connection — no real account linked"
                      : provider.status === "setup_required"
                        ? "Server OAuth setup required"
                        : "No account connected"}
                </p>
                <p className="mt-0.5 text-[10.5px] text-ink-secondary">
                  {provider.connectedAt ? `Connected ${formatDateTime(provider.connectedAt)}` : "Simulation mode is always available."}
                  {provider.lastCheckedAt ? ` · Checked ${formatDateTime(provider.lastCheckedAt)}` : ""}
                </p>
              </div>

              <div className="mt-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Capabilities</p>
                <ul className="mt-1.5 space-y-1">
                  {provider.capabilities.map((capability) => (
                    <li key={capability} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-secondary">
                      <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-success" /> {capability}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Scopes requested</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {provider.requiredScopes.map((scope) => (
                    <code key={scope} className="rounded border border-line bg-app/70 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-secondary">
                      {scope.split("/").pop()}
                    </code>
                  ))}
                </div>
              </div>

              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-line bg-white p-2.5 text-[10.5px] leading-relaxed text-ink-secondary">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-success" /> {provider.notes}
              </p>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                {provider.status === "connected" ? (
                  <>
                    <Button size="sm" variant="secondary" loading={busyProvider === provider.provider} onClick={() => void checkConnection(provider)}>
                      <RefreshCw size={13} /> Test connection
                    </Button>
                    <Button size="sm" variant="danger-outline" onClick={() => setDisconnectTarget(provider)}>
                      <Unplug size={13} /> Disconnect
                    </Button>
                  </>
                ) : provider.status === "demo" ? (
                  <>
                    {oauthReady ? (
                      <a href={`/api/integrations/google/connect?provider=${provider.provider}`}>
                        <Button size="sm">
                          <Plug size={13} /> Connect real account
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" disabled title="Configure Google OAuth on the server first">
                        <Plug size={13} /> Connect real account
                      </Button>
                    )}
                    <Button size="sm" variant="danger-outline" onClick={() => setDisconnectTarget(provider)}>
                      <Unplug size={13} /> Remove demo
                    </Button>
                  </>
                ) : oauthReady ? (
                  <>
                    <a href={`/api/integrations/google/connect?provider=${provider.provider}`}>
                      <Button size="sm">
                        <Plug size={13} /> Connect {provider.name}
                      </Button>
                    </a>
                    {workspace?.isDemo ? (
                      <Button size="sm" variant="secondary" loading={busyProvider === provider.provider} onClick={() => void connectDemo(provider)}>
                        <FlaskConical size={13} /> Use demo connection
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled title="Configure Google OAuth on the server first">
                      <Plug size={13} /> Connect {provider.name}
                    </Button>
                    {workspace?.isDemo ? (
                      <Button size="sm" variant="secondary" loading={busyProvider === provider.provider} onClick={() => void connectDemo(provider)}>
                        <FlaskConical size={13} /> Use demo connection
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </CardBody>
          </Card>
        ))}

        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-primary">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">FlowMate AI provider</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{data.ai.description}</p>
              </div>
            </div>
            <StatusBadge status={data.ai.status} />
          </CardHeader>
          <CardBody className="flex flex-1 flex-col">
            <div className="rounded-lg border border-line bg-app/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Provider</span>
                <Badge tone={data.ai.configured ? "success" : "warning"}>{data.ai.configured ? "Configured" : "Not configured"}</Badge>
              </div>
              <p className="mt-1 text-[12px] font-medium text-ink">{data.ai.configured ? data.ai.model : "Local demo planner fallback"}</p>
              <p className="mt-0.5 break-all text-[10.5px] text-ink-secondary">
                {data.ai.configured ? data.ai.baseUrl : "Deterministic keyword planner; no external AI request is made."}
              </p>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-white p-3 text-[10.5px] leading-relaxed text-ink-secondary">
              <KeyRound size={13} className="mt-0.5 shrink-0 text-primary" />
              <span>{data.ai.note}</span>
            </div>

            <div className="mt-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Server environment</p>
              <div className="mt-1.5 space-y-1 font-mono text-[10px] text-ink-secondary">
                <p>AI_API_KEY · AI_BASE_URL · AI_MODEL</p>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                Keys are read only by the server and are never sent to the browser. AI output is limited to allowlisted node types and
                validated configuration.
              </p>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
              <Link to="/help#ai-setup">
                <Button size="sm" variant="secondary">
                  AI setup guide <ArrowUpRight size={13} />
                </Button>
              </Link>
              <Link to="/automations/new">
                <Button size="sm" variant="ghost">
                  Try workflow generation
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
              <CheckCircle2 size={14} className="text-success" /> What a connection enables
            </h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
              A connection lets a workflow read from or write to that provider when it runs in live mode. Simulation mode always uses
              deterministic adapters and never calls Google.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
              <XCircle size={14} className="text-ink-secondary" /> What a connection does not do
            </h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
              Connecting an account does not activate workflows, send email, or watch your inbox continuously. Gmail triggers read the
              latest match; schedule workflows to poll. New-row sheet triggers are simulation-only.
            </p>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={() => void disconnect()}
        title={`Disconnect ${disconnectTarget?.name ?? "connection"}?`}
        description="Local credentials will be removed and Google will be asked to revoke the refresh token. Workflows that need this provider will fail live validation until you reconnect."
        confirmLabel="Disconnect"
        loading={busyProvider === disconnectTarget?.provider}
      />
    </PageContainer>
  );
}
