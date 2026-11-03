import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, FileSpreadsheet, ShieldCheck, Loader2, Plug, RefreshCw, Info, TriangleAlert } from "lucide-react";
import {
  startConnectorConnect,
  completeAppUserConnection,
  disconnectConnector,
  verifyConnector,
  getIntegrationStatuses,
  type ConnectorId,
} from "@/lib/oauth.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — FlowMate AI" },
      { name: "description", content: "Connect Gmail and Google Sheets to your workflows." },
      { property: "og:title", content: "Integrations — FlowMate AI" },
      { property: "og:description", content: "Connect Gmail and Google Sheets to your workflows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

interface IntegrationRow {
  status: string;
  account_label: string | null;
  connected_at: string | null;
}

interface IntegrationStatuses {
  google_mail: IntegrationRow | null;
  google_sheets: IntegrationRow | null;
  clientsConfigured: { connectorId: string; configured: boolean }[];
}

const CONNECTORS: {
  id: ConnectorId;
  name: string;
  icon: typeof Mail;
  desc: string;
  permissions: string[];
}[] = [
  {
    id: "google_mail",
    name: "Gmail",
    icon: Mail,
    desc: "Triggers on new email matching a filter, and sends email from your account.",
    permissions: ["Read messages matched by your workflow filters", "Send email only when a workflow has a send step"],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    icon: FileSpreadsheet,
    desc: "Watches spreadsheet rows, appends data, and looks up rows.",
    permissions: ["Read and append to spreadsheets your workflows reference"],
  },
];

function waitForOAuthCompletion(popup: Window): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error(event.data?.error ?? "OAuth connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("OAuth window closed before completion."));
    }, 500);
  });
}

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchStatuses = useServerFn(getIntegrationStatuses);
  const startConnect = useServerFn(startConnectorConnect);
  const complete = useServerFn(completeAppUserConnection);
  const disconnect = useServerFn(disconnectConnector);
  const verify = useServerFn(verifyConnector);

  const statuses = useQuery({ queryKey: ["integration-statuses"], queryFn: () => fetchStatuses(), retry: 1 });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile(), retry: 1 });

  // A user mid-onboarding can reach this page (the setup gate allows it) —
  // give them an honest way back to the flow they were in.
  const needsSetup = profileQuery.data ? !profileQuery.data.profile.onboardingCompleted : false;

  const [manageFor, setManageFor] = useState<ConnectorId | null>(null);
  const [confirmDisconnectFor, setConfirmDisconnectFor] = useState<ConnectorId | null>(null);
  const [lastVerify, setLastVerify] = useState<{
    connectorId: ConnectorId;
    connected: boolean;
    reconnectRequired: boolean;
    error: string | null;
  } | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["integration-statuses"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  async function connect(connectorId: ConnectorId) {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Popup blocked. Allow popups and try again.");
      return;
    }
    try {
      const start = await startConnect({ data: connectorId });
      if (!start.ok) {
        popup.close();
        toast.error(start.message);
        return;
      }
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = start.authorizationUrl;
      const code = await completion;
      if (!code) {
        toast.error(
          "Google did not grant offline access, so no credential was stored. Reconnect and accept all requested permissions.",
        );
        return;
      }
      // Exchange here — the popup has no app session in the embedded preview.
      const completed = await complete({ data: { code } });
      if (!completed.connected) {
        toast.error(completed.message ?? "The connection could not be verified. Reconnect and accept all permissions.");
      } else {
        toast.success("Connected. Your workflows can now use this integration.");
      }
    } catch (err) {
      popup.close();
      toast.error(err instanceof Error ? err.message : "Could not complete the connection.");
    } finally {
      invalidate();
    }
  }

  const disconnectMutation = useMutation({
    mutationFn: (connectorId: ConnectorId) => disconnect({ data: connectorId }),
    onSuccess: () => {
      toast.success("Disconnected. Connected workflows will report waiting until you reconnect.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Disconnect failed."),
  });

  const verifyMutation = useMutation({
    mutationFn: (connectorId: ConnectorId) => verify({ data: connectorId }),
    onSuccess: (res, connectorId) => {
      invalidate();
      setLastVerify({
        connectorId,
        connected: res.connected,
        reconnectRequired: res.reconnectRequired,
        error: res.error ?? null,
      });
      if (res.connected) toast.success(`${connectorId === "google_mail" ? "Gmail" : "Google Sheets"} connection is working.`);
      else if (res.reconnectRequired) toast.error("This connection needs to be renewed. Use Reconnect below.");
      else toast.error(res.error ?? "Connection is not usable right now.");
    },
    onError: (e, connectorId) => {
      setLastVerify({ connectorId, connected: false, reconnectRequired: false, error: e instanceof Error ? e.message : "Check failed." });
      toast.error(e instanceof Error ? e.message : "Check failed.");
    },
  });

  const data = statuses.data as IntegrationStatuses | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Integrations"
        subtitle="Connect your own Google account. Credentials are stored encrypted on the server — never in your browser."
      />

      {needsSetup && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Finish setting up your workspace</AlertTitle>
          <AlertDescription>
            You can connect apps now or later —{" "}
            <Link to="/onboarding" className="font-medium text-primary underline-offset-4 hover:underline">
              return to setup
            </Link>{" "}
            whenever you're ready.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How connections work</AlertTitle>
        <AlertDescription>
          Each integration requests only the permissions its workflow steps need. You can disconnect at any time;
          workflows keep working in clearly-labelled simulation mode until a connection is active.
        </AlertDescription>
      </Alert>

      {statuses.isLoading && (
        <div className="space-y-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      )}

      {data && (
        <div className="space-y-4">
          {CONNECTORS.map((connector) => {
            const row = data[connector.id];
            const configured = data.clientsConfigured.find((c) => c.connectorId === connector.id)?.configured ?? false;
            const status = row?.status ?? "not_connected";
            const connected = status === "connected";
            const reconnectRequired = status === "reconnect_required";
            return (
              <Card key={connector.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                      <connector.icon className="h-5.5 w-5.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold">
                        {connector.name}
                        {connected && <Badge className="bg-success/15 text-success hover:bg-success/15">Connected</Badge>}
                        {reconnectRequired && <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Needs renewal</Badge>}
                        {!connected && !reconnectRequired && <Badge variant="outline">Not connected</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{connector.desc}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(connected || reconnectRequired) && (
                        <>
                          {/* Manage opens a status dialog — it never launches OAuth by itself. */}
                          <Button size="sm" variant="outline" onClick={() => setManageFor(connector.id)}>
                            Manage
                          </Button>
                          {reconnectRequired && (
                            <Button size="sm" onClick={() => connect(connector.id)} disabled={disconnectMutation.isPending}>
                              Reconnect
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Verify connection"
                            onClick={() => verifyMutation.mutate(connector.id)}
                            disabled={verifyMutation.isPending}
                          >
                            {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                      {!connected && !reconnectRequired && (
                        <Button size="sm" onClick={() => connect(connector.id)} disabled={!configured}>
                          <Plug className="h-4 w-4" /> {configured ? "Connect" : "Setup required"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg bg-surface-muted p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-success" /> Permissions requested
                    </div>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {connector.permissions.map((p) => <li key={p}>• {p}</li>)}
                    </ul>
                  </div>
                  {!configured && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      The Google OAuth client for this integration hasn't been set up yet by the workspace owner.
                      Until then, everything runs in clearly-labelled simulation mode.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Looking to automate something else? More integrations are on the way — <Link to="/help" className="text-primary hover:underline">see the roadmap</Link>.
      </p>

      {/* Manage dialog — status, account, scopes and verification. OAuth only
          starts from the explicit Reconnect button. */}
      <Dialog open={!!manageFor} onOpenChange={(open) => { if (!open) setManageFor(null); }}>
        <DialogContent className="sm:max-w-md">
          {manageFor && data && (() => {
            const connector = CONNECTORS.find((c) => c.id === manageFor)!;
            const row = data[manageFor];
            const status = row?.status ?? "not_connected";
            const connected = status === "connected";
            const reconnectRequired = status === "reconnect_required";
            const verifyForThis = lastVerify && lastVerify.connectorId === manageFor ? lastVerify : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <connector.icon className="h-4.5 w-4.5 text-primary" /> {connector.name} connection
                  </DialogTitle>
                  <DialogDescription>
                    Status and permissions for this integration. OAuth tokens stay encrypted on the server and are
                    never shown here.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {connected ? (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">Connected</Badge>
                    ) : reconnectRequired ? (
                      <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Needs renewal</Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )}
                  </div>
                  {connected && row?.account_label && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-muted-foreground">Connected account</span>
                      <span className="truncate font-medium">{row.account_label}</span>
                    </div>
                  )}
                  {connected && row?.connected_at && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-muted-foreground">Connected since</span>
                      <span className="font-medium">{new Date(row.connected_at).toLocaleString()}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium">Granted permissions</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {connector.permissions.map((p) => <li key={p}>• {p}</li>)}
                    </ul>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Requests stay scoped to exactly these permissions; revoking them from your Google account
                      appears here as a failed verification.
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Last verification</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {verifyForThis
                            ? verifyForThis.connected
                              ? "Google accepted this credential during the last check."
                              : verifyForThis.reconnectRequired
                                ? "Google rejected the stored credential. Reconnect to renew it."
                                : verifyForThis.error ?? "The provider refused a verification call."
                            : "Run a live check to confirm the stored credential still works right now."}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verifyMutation.mutate(manageFor)}
                        disabled={verifyMutation.isPending}
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Verify now
                      </Button>
                    </div>
                  </div>
                  {reconnectRequired && (
                    <Alert>
                      <TriangleAlert className="h-4 w-4" />
                      <AlertDescription>
                        Google no longer accepts the stored credential for this integration. Live steps will wait
                        until you reconnect.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
                  <Button variant="ghost" className="text-error hover:text-error" onClick={() => setConfirmDisconnectFor(manageFor)}>
                    Disconnect
                  </Button>
                  <Button onClick={() => connect(manageFor)} disabled={disconnectMutation.isPending}>
                    <Plug className="h-4 w-4" /> Reconnect
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Destructive action confirmation — identical copy for the card and the manage dialog. */}
      <AlertDialog
        open={!!confirmDisconnectFor}
        onOpenChange={(open) => {
          if (!open) setConfirmDisconnectFor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect integration?</AlertDialogTitle>
            <AlertDialogDescription>
              Workflows that require this integration may stop working until it is reconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              onClick={() => {
                const target = confirmDisconnectFor;
                setConfirmDisconnectFor(null);
                setManageFor(null);
                if (target) disconnectMutation.mutate(target);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
