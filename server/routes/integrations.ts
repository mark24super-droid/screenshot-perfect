import { Router } from "express";
import { z } from "zod";
import { config, isAiConfigured } from "../config";
import { get, newId, nowIso, run } from "../db";
import { decryptJson, encryptJson, randomToken } from "../lib/crypto";
import { asyncHandler, fail, ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { clientKey, rateLimit } from "../lib/rate-limit";
import {
  connectionSummary,
  getAccessToken,
  getConnectionRow,
  googleOauthConfigured,
  googleScopesFor,
  providerStatus,
  type GoogleProvider,
} from "../services/google";
import type { GoogleTokens } from "../services/google-shared";

export const integrationsRouter = Router();

const STATE_COOKIE = "fm_oauth_state";

const PROVIDER_META = {
  gmail: {
    name: "Gmail",
    description: "Read matching emails and send messages when a workflow explicitly includes a send step.",
    capabilities: [
      "Read messages matching a search query (gmail.readonly)",
      "Send email from the connected account (gmail.send)",
      "Use subject, sender, timestamp, snippet and body as workflow data",
    ],
    notes: "FlowMate never sends email unless a Gmail: Send Email step is configured and the workflow runs in live mode.",
  },
  google_sheets: {
    name: "Google Sheets",
    description: "Append rows and look up data in spreadsheets you explicitly select.",
    capabilities: [
      "Append a row to a chosen worksheet (spreadsheets)",
      "Read rows for find-row lookups (spreadsheets)",
      "Map workflow fields to named columns",
    ],
    notes: "New-row triggers are simulation-only in this release because they require Google Drive push channels.",
  },
} as const;

function providerFrom(value: unknown): GoogleProvider | null {
  return value === "gmail" || value === "google_sheets" ? value : null;
}

integrationsRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const workspaceId = req.auth!.workspace.id;
    const providers = (["gmail", "google_sheets"] as const).map((provider) => {
      const summary = connectionSummary(workspaceId, provider);
      return {
        ...PROVIDER_META[provider],
        ...summary,
        provider,
        requiredScopes: googleScopesFor(provider),
        setupRequired: !googleOauthConfigured(),
      };
    });
    ok(res, {
      providers,
      ai: {
        configured: isAiConfigured(),
        model: isAiConfigured() ? config.ai.model : null,
        baseUrl: isAiConfigured() ? config.ai.baseUrl : null,
        demoPlannerEnabled: config.ai.demoFallback,
        status: isAiConfigured() ? "connected" : "setup_required",
        description: "AI workflow generation and AI steps use a server-side OpenAI-compatible provider.",
        note: isAiConfigured()
          ? "API key is stored only in the server environment."
          : "No AI provider key is set. Workflow generation uses a clearly labelled local demo planner, and AI steps use deterministic simulation in simulation mode.",
      },
      oauthConfigured: googleOauthConfigured(),
      tokenEncryptionConfigured: Boolean(config.tokenEncryptionKey),
    });
  }),
);

integrationsRouter.get(
  "/connections",
  requireAuth,
  asyncHandler((req, res) => {
    ok(res, {
      connections: [
        connectionSummary(req.auth!.workspace.id, "gmail"),
        connectionSummary(req.auth!.workspace.id, "google_sheets"),
      ],
    });
  }),
);

integrationsRouter.get(
  "/google/connect",
  requireAuth,
  asyncHandler((req, res) => {
    if (!googleOauthConfigured()) {
      res.redirect(`${config.appUrl}/integrations?error=oauth_not_configured`);
      return;
    }
    const provider = providerFrom(req.query.provider) ?? "gmail";
    const state = randomToken(24);
    const payload = {
      state,
      userId: req.auth!.user.id,
      workspaceId: req.auth!.workspace.id,
      provider,
      expires: Date.now() + 10 * 60 * 1000,
    };
    res.cookie(STATE_COOKIE, Buffer.from(JSON.stringify(payload)).toString("base64url"), {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.google.clientId);
    url.searchParams.set("redirect_uri", config.google.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", googleScopesFor(provider).join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  }),
);

integrationsRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const redirect = (query: Record<string, string>) => {
      const url = new URL(`${config.appUrl}/integrations`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      res.clearCookie(STATE_COOKIE, { path: "/" });
      res.redirect(url.toString());
    };

    if (typeof req.query.error === "string") {
      redirect({ error: req.query.error === "access_denied" ? "oauth_denied" : "oauth_failed" });
      return;
    }
    if (!googleOauthConfigured()) {
      redirect({ error: "oauth_not_configured" });
      return;
    }
    const rawState = req.cookies?.[STATE_COOKIE];
    let state: { state: string; userId: string; workspaceId: string; provider: GoogleProvider; expires: number } | null = null;
    try {
      state = JSON.parse(Buffer.from(String(rawState ?? ""), "base64url").toString("utf8"));
    } catch {
      state = null;
    }
    if (!state || state.expires < Date.now() || state.state !== req.query.state) {
      redirect({ error: "state_mismatch" });
      return;
    }
    if (!req.auth || req.auth.user.id !== state.userId || req.auth.workspace.id !== state.workspaceId) {
      redirect({ error: "session_mismatch" });
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      redirect({ error: "missing_code" });
      return;
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: config.google.redirectUri,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!tokenResponse.ok) {
        console.error(
          JSON.stringify({ level: "error", scope: "oauth", message: `Token exchange failed with ${tokenResponse.status}` }),
        );
        redirect({ error: "token_exchange_failed" });
        return;
      }
      const tokenJson = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
      let email = "";
      try {
        const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (profile.ok) {
          const info = (await profile.json()) as { email?: string };
          email = info.email ?? "";
        }
      } catch {
        /* account label is optional */
      }

      const existing = getConnectionRow(state.workspaceId, state.provider);
      const existingTokens = decryptJson<GoogleTokens>(existing?.encrypted_credentials ?? null);
      const tokens: GoogleTokens = {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token ?? existingTokens?.refresh_token,
        expiry_date: Date.now() + tokenJson.expires_in * 1000,
        scope: tokenJson.scope,
        email,
      };
      const now = nowIso();
      if (existing) {
        run(
          `UPDATE integration_connections
              SET status = 'connected', encrypted_credentials = ?, granted_scopes = ?, account_label = ?, connected_at = ?, last_checked_at = ?
            WHERE id = ?`,
          encryptJson(tokens),
          tokenJson.scope ?? googleScopesFor(state.provider).join(" "),
          email || existing.account_label || "Google account",
          now,
          now,
          existing.id,
        );
      } else {
        run(
          `INSERT INTO integration_connections (id, workspace_id, provider, status, encrypted_credentials, granted_scopes, account_label, connected_at, last_checked_at)
           VALUES (?, ?, ?, 'connected', ?, ?, ?, ?, ?)`,
          newId("con"),
          state.workspaceId,
          state.provider,
          encryptJson(tokens),
          tokenJson.scope ?? googleScopesFor(state.provider).join(" "),
          email || "Google account",
          now,
          now,
        );
      }
      redirect({ connected: state.provider });
    } catch (error) {
      console.error(
        JSON.stringify({ level: "error", scope: "oauth", message: error instanceof Error ? error.message : "OAuth callback failed" }),
      );
      redirect({ error: "connection_failed" });
    }
  }),
);

integrationsRouter.post(
  "/:provider/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = providerFrom(req.params.provider);
    if (!provider) {
      fail(res, 400, "invalid_provider", "Unknown integration provider.");
      return;
    }
    const rate = rateLimit(clientKey(req, `disconnect-${provider}`), 10, 60_000);
    if (!rate.allowed) {
      fail(res, 429, "rate_limited", "Too many requests. Please wait a moment.");
      return;
    }
    const row = getConnectionRow(req.auth!.workspace.id, provider);
    if (!row) {
      ok(res, { success: true, status: providerStatus(req.auth!.workspace.id, provider) });
      return;
    }
    const tokens = decryptJson<GoogleTokens>(row.encrypted_credentials);
    if (tokens?.refresh_token) {
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokens.refresh_token }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Revocation failures are surfaced as a note; local credentials are still removed.
      }
    }
    run(
      "UPDATE integration_connections SET status = 'disconnected', encrypted_credentials = NULL, granted_scopes = NULL, connected_at = NULL, last_checked_at = ? WHERE id = ?",
      nowIso(),
      row.id,
    );
    ok(res, {
      success: true,
      status: providerStatus(req.auth!.workspace.id, provider),
      note: "Local credentials were removed. If Google revocation failed, remove FlowMate manually at myaccount.google.com/permissions.",
    });
  }),
);

integrationsRouter.get(
  "/:provider/status",
  requireAuth,
  asyncHandler((req, res) => {
    const provider = providerFrom(req.params.provider);
    if (provider) {
      ok(res, connectionSummary(req.auth!.workspace.id, provider));
      return;
    }
    if (req.params.provider === "ai") {
      ok(res, { provider: "ai", status: isAiConfigured() ? "connected" : "setup_required", configured: isAiConfigured() });
      return;
    }
    fail(res, 404, "invalid_provider", "Unknown integration provider.");
  }),
);

integrationsRouter.post(
  "/:provider/check",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = providerFrom(req.params.provider);
    if (!provider) {
      fail(res, 400, "invalid_provider", "Unknown integration provider.");
      return;
    }
    if (providerStatus(req.auth!.workspace.id, provider) !== "connected") {
      ok(res, { status: providerStatus(req.auth!.workspace.id, provider), message: "This integration is not connected." });
      return;
    }
    try {
      await getAccessToken(req.auth!.workspace.id, provider);
      run(
        "UPDATE integration_connections SET last_checked_at = ?, status = 'connected' WHERE workspace_id = ? AND provider = ?",
        nowIso(),
        req.auth!.workspace.id,
        provider,
      );
      ok(res, { status: "connected", message: "Credentials are valid and can be refreshed." });
    } catch (error) {
      ok(res, {
        status: "error",
        message: error instanceof Error ? error.message : "Could not verify the connection.",
      });
    }
  }),
);

integrationsRouter.post(
  "/:provider/demo-connect",
  requireAuth,
  asyncHandler((req, res) => {
    const provider = providerFrom(req.params.provider);
    if (!provider) {
      fail(res, 400, "invalid_provider", "Unknown integration provider.");
      return;
    }
    if (!req.auth!.workspace.isDemo) {
      fail(res, 403, "demo_only", "Demo connections are only available in the demo workspace. Use simulation mode without connecting an account.");
      return;
    }
    const existing = getConnectionRow(req.auth!.workspace.id, provider);
    const now = nowIso();
    if (existing) {
      run("UPDATE integration_connections SET status = 'demo', last_checked_at = ? WHERE id = ?", now, existing.id);
    } else {
      run(
        `INSERT INTO integration_connections (id, workspace_id, provider, status, granted_scopes, account_label, connected_at, last_checked_at)
         VALUES (?, ?, ?, 'demo', '', 'Demo (simulated)', ?, ?)`,
        newId("con"),
        req.auth!.workspace.id,
        provider,
        now,
        now,
      );
    }
    ok(res, { success: true, status: "demo", note: "Demo connection only. No real account is linked and no real actions will run." });
  }),
);
