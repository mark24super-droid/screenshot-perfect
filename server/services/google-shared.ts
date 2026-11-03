import { config } from "../config";
import { run } from "../db";
import { newId } from "../lib/crypto";

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  email?: string;
}

export interface GoogleConnection {
  id: string;
  status: string;
  tokens: GoogleTokens | null;
  accountLabel: string | null;
  scopes: string[];
}

export function googleOauthConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export async function refreshGoogleTokens(tokens: GoogleTokens): Promise<GoogleTokens> {
  if (!tokens.refresh_token) {
    throw new Error("No refresh token available");
  }
  const body = new URLSearchParams({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token refresh failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    refresh_token?: string;
  };
  return {
    ...tokens,
    access_token: json.access_token,
    expiry_date: Date.now() + json.expires_in * 1000,
    scope: json.scope ?? tokens.scope,
    refresh_token: json.refresh_token ?? tokens.refresh_token,
  };
}

export function recordConnectionCheck(connectionId: string, status: string): void {
  run("UPDATE integration_connections SET last_checked_at = ?, status = ? WHERE id = ?", new Date().toISOString(), status, connectionId);
}

export function logUsage(workspaceId: string, usageType: string, quantity = 1, metadata: Record<string, unknown> = {}): void {
  run(
    "INSERT INTO usage_records (id, workspace_id, usage_type, quantity, recorded_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    newId("usg"),
    workspaceId,
    usageType,
    quantity,
    new Date().toISOString(),
    JSON.stringify(metadata),
  );
}
