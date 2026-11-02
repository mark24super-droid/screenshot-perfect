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
    const clientsConfigured = CONNECTOR_IDS.map((c) => ({
      connectorId: c,
      configured: !!process.env[clientApiKeyEnv(c)],
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
      connectionAPIKey: connectionAPIKey ?? undefined,
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

    // Mirror the connection state into the app's integrations table.
    const supabase = context.supabase as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database, "public", "public", any, any
    >;
    const { error } = await supabase.from("integrations").upsert(
      {
        user_id: context.userId,
        provider: connectorId,
        status: "connected",
        scopes: scopesFor(connectorId),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, connectorId };
  });

export const verifyConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => connectorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const connectorId = data as ConnectorId;
    const connectionKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (!connectionKey) return { connected: false as const, reconnectRequired: false };
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: connectionKey,
      connectorId,
      path: connectorId === "google_mail" ? "/gmail/v1/users/me/profile" : "/sheets/v4/?alt=json",
      requiredScopes: scopesFor(connectorId),
    });
    if (await appUserReconnectRequired(res)) {
      await markIntegrationStatus(context.supabase, context.userId, connectorId, "reconnect_required");
      return { connected: false as const, reconnectRequired: true };
    }
    const email = connectorId === "google_mail" && res.ok
      ? ((await res.json().catch(() => null)) as { emailAddress?: string } | null)?.emailAddress ?? null
      : null;
    if (res.ok) {
      await markIntegrationStatus(context.supabase, context.userId, connectorId, "connected", email);
      return { connected: true as const, reconnectRequired: false, account: email };
    }
    return { connected: false as const, reconnectRequired: false, error: `Provider check failed (${res.status}).` };
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
  status: "connected" | "reconnect_required",
  accountLabel?: string | null,
) {
  await supabase.from("integrations").upsert(
    {
      user_id: userId,
      provider,
      status,
      account_label: accountLabel ?? undefined,
      connected_at: status === "connected" ? new Date().toISOString() : undefined,
    },
    { onConflict: "user_id,provider" },
  );
}
