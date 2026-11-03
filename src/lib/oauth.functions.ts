import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authorizeAppUserOAuth,
  callAsAppUser,
  appUserReconnectRequired,
  disconnectAppUser,
  exchangeAppUserOAuthCode,
} from "@/integrations/lovable/appUserConnector";
import {
  saveConnectionKeyForUser,
  getConnectionKeyForUser,
  deleteConnectionKeyForUser,
} from "@/lib/appUserConnections.server";
import { GOOGLE_MAIL_SCOPES, GOOGLE_SHEETS_SCOPES } from "@/lib/connector-adapters.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const CONNECTOR_IDS = ["google_mail", "google_sheets"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

const connectorSchema = z.enum(["google_mail", "google_sheets"]);

function clientApiKeyEnv(connectorId: ConnectorId): string {
  return `${connectorId.toUpperCase()}_APP_USER_CONNECTOR_CLIENT_API_KEY`;
}

function scopesFor(connectorId: ConnectorId): string[] {
  return connectorId === "google_mail" ? GOOGLE_MAIL_SCOPES : GOOGLE_SHEETS_SCOPES;
}

export const getIntegrationStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database, "public", "public", any, any
    >;
    const { data } = await supabase
      .from("integrations")
      .select("provider, status, account_label, connected_at")
      .eq("user_id", context.userId);
    const rows = data ?? [];
    const gatewayReady = !!process.env["LOVABLE_API_KEY"];
    const clientsConfigured = CONNECTOR_IDS.map((c) => ({
      connectorId: c,
      configured: gatewayReady && !!process.env[clientApiKeyEnv(c)],
    }));
    return {
      google_mail: rows.find((r) => r.provider === "google_mail") ?? null,
      google_sheets: rows.find((r) => r.provider === "google_sheets") ?? null,
      clientsConfigured,
    };
  });

export const startConnectorConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => connectorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const connectorId = data as ConnectorId;
    const clientAPIKey = process.env[clientApiKeyEnv(connectorId)];
    if (!clientAPIKey) {
      return {
        ok: false as const,
        error: "setup_required",
        message: "The Google OAuth client for this integration isn't configured yet. Ask the app owner to finish setup in workspace App User Connectors settings.",
      };
    }
    const request = getRequest();
    if (!request) throw new Error("Connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();

    const connectionAPIKey = await getConnectionKeyForUser(context.userId, connectorId);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: connectionAPIKey ?? null,
      credentialsConfiguration: { scopes: scopesFor(connectorId) },
    });
    return { ok: true as const, authorizationUrl };
  });

export const completeAppUserConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (!CONNECTOR_IDS.includes(connectorId as ConnectorId)) {
      throw new Error("OAuth completion returned an unexpected connector.");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);

    // Do not report a connection as working until the provider actually
    // accepts the credential. Missing offline access or declined scopes show
    // up here instead of failing silently on the first live run.
    const check = await checkConnection(context.userId, connectorId as ConnectorId);
    const supabase = context.supabase as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database, "public", "public", any, any
    >;
    await markIntegrationStatus(
      supabase,
      context.userId,
      connectorId as ConnectorId,
      check.reconnectRequired ? "reconnect_required" : check.connected ? "connected" : "not_connected",
      check.account,
    );
    return {
      ok: true as const,
      connectorId,
      connected: check.connected,
      message: check.connected
        ? undefined
        : check.error ?? "The connection was created but the provider did not grant usable access. Reconnect and accept all permissions.",
    };
  });

async function checkConnection(
  userId: string,
  connectorId: ConnectorId,
): Promise<{ connected: boolean; reconnectRequired: boolean; account?: string | null; error?: string }> {
  const connectionKey = await getConnectionKeyForUser(userId, connectorId);
  if (!connectionKey) {
    return { connected: false, reconnectRequired: false, error: "No stored credential for this connection." };
  }
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: connectionKey,
    connectorId,
    // Gmail has a profile endpoint. Sheets has no account root; a valid token
    // reaches the API and returns 404 for the missing spreadsheet id, while a
    // stale credential returns 401 credential_*.
    path: connectorId === "google_mail" ? "/gmail/v1/users/me/profile" : "/sheets/v4/spreadsheets",
    requiredScopes: scopesFor(connectorId),
  });
  if (await appUserReconnectRequired(res)) {
    return { connected: false, reconnectRequired: true, error: "Google rejected this credential. Reconnect the integration." };
  }
  if (res.ok || (connectorId === "google_sheets" && res.status === 404)) {
    const email =
      connectorId === "google_mail" && res.ok
        ? (((await res.json().catch(() => null)) as { emailAddress?: string } | null)?.emailAddress ?? null)
        : null;
    return { connected: true, reconnectRequired: false, account: email };
  }
  return {
    connected: false,
    reconnectRequired: false,
    error: `The provider rejected a verification call (${res.status}). Check that all requested permissions were granted.`,
  };
}

export const verifyConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => connectorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const connectorId = data as ConnectorId;
    const check = await checkConnection(context.userId, connectorId);
    const supabase = context.supabase as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database, "public", "public", any, any
    >;
    await markIntegrationStatus(
      supabase,
      context.userId,
      connectorId,
      check.reconnectRequired ? "reconnect_required" : check.connected ? "connected" : "not_connected",
      check.account,
    );
    return {
      connected: check.connected,
      reconnectRequired: check.reconnectRequired,
      account: check.account,
      error: check.error,
    };
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => connectorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const connectorId = data as ConnectorId;
    const connectionKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (connectionKey) {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: connectionKey, connectorId });
    }
    await deleteConnectionKeyForUser(context.userId, connectorId);
    const supabase = context.supabase as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database, "public", "public", any, any
    >;
    await supabase.from("integrations").delete().eq("user_id", context.userId).eq("provider", connectorId);
    return { ok: true as const };
  });

async function markIntegrationStatus(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database, "public", "public", any, any
  >,
  userId: string,
  provider: ConnectorId,
  status: "connected" | "reconnect_required" | "not_connected",
  accountLabel?: string | null,
) {
  await supabase.from("integrations").upsert(
    {
      user_id: userId,
      provider,
      status,
      account_label: accountLabel ?? undefined,
      connected_at: status === "connected" ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,provider" },
  );
}
