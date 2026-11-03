import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, FileSpreadsheet, ShieldCheck, Loader2, Plug, RefreshCw } from "lucide-react";
import {
  startConnectorConnect,
  completeAppUserConnection,
  disconnectConnector,
  verifyConnector,
  getIntegrationStatuses,
} from "@/lib/oauth.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

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

interface IntegrationStatuses {
  google_mail: { status: string } | null;
  google_sheets: { status: string } | null;
  clientsConfigured: { connectorId: string; configured: boolean }[];
}

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
  const fetchStatuses = useServerFn(getIntegrationStatuses);
  const startConnect = useServerFn(startConnectorConnect);
  const complete = useServerFn(completeAppUserConnection);
  const disconnect = useServerFn(disconnectConnector);
  const verify = useServerFn(verifyConnector);

  const statuses = useQuery({ queryKey: ["integration-statuses"], queryFn: () => fetchStatuses(), retry: 1 });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["integration-statuses"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  async function connect(connectorId: "google_mail" | "google_sheets") {
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
    mutationFn: (connectorId: "google_mail" | "google_sheets") => disconnect({ data: connectorId }),
    onSuccess: () => {
      toast.success("Disconnected. Connected workflows will report waiting until you reconnect.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Disconnect failed."),
  });

  const verifyMutation = useMutation({
    mutationFn: (connectorId: "google_mail" | "google_sheets") => verify({ data: connectorId }),
    onSuccess: (res, connectorId) => {
      invalidate();
      if (res.connected) toast.success(`${connectorId === "google_mail" ? "Gmail" : "Google Sheets"} connection is working.`);
      else if (res.reconnectRequired) toast.error("This connection needs to be renewed. Use Reconnect below.");
      else toast.error(res.error ?? "Connection is not usable right now.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed."),
  });

  const data = statuses.data as IntegrationStatuses | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Integrations"
        subtitle="Connect your own Google account. Credentials are stored encrypted on the server — never in your browser."
      />

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
          {[
            {
              id: "google_mail" as const,
              name: "Gmail",
              icon: Mail,
              desc: "Triggers on new email matching a filter, and sends email from your account.",
              permissions: ["Read messages matched by your workflow filters", "Send email only when a workflow has a send step"],
            },
            {
              id: "google_sheets" as const,
              name: "Google Sheets",
              icon: FileSpreadsheet,
              desc: "Watches spreadsheet rows, appends data, and looks up rows.",
              permissions: ["Read and append to spreadsheets your workflows reference"],
            },
          ].map((i) => {
            const row = data[i.id];
            const configured = data.clientsConfigured.find((c) => c.connectorId === i.id)?.configured ?? false;
            const status = row?.status ?? "not_connected";
            const connected = status === "connected";
            const reconnectRequired = status === "reconnect_required";
            return (
              <Card key={i.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                      <i.icon className="h-5.5 w-5.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold">
                        {i.name}
                        {connected && <Badge className="bg-success/15 text-success hover:bg-success/15">Connected</Badge>}
                        {reconnectRequired && <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Needs renewal</Badge>}
                        {!connected && !reconnectRequired && <Badge variant="outline">Not connected</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{i.desc}</p>
                    </div>
                    <div className="flex gap-2">
                      {(connected || reconnectRequired) && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => connect(i.id)} disabled={disconnectMutation.isPending}>
                            {reconnectRequired ? "Reconnect" : "Manage"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => disconnectMutation.mutate(i.id)} disabled={disconnectMutation.isPending}>
                            Disconnect
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => verifyMutation.mutate(i.id)} disabled={verifyMutation.isPending}>
                            {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                      {!connected && !reconnectRequired && (
                        <Button size="sm" onClick={() => connect(i.id)} disabled={!configured}>
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
                      {i.permissions.map((p) => <li key={p}>• {p}</li>)}
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
    </div>
  );
}
