import { config } from "../config";
import { get, parseJson, run } from "../db";
import { decryptJson, encryptJson } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { googleOauthConfigured, refreshGoogleTokens, type GoogleTokens } from "./google-shared";

export type GoogleProvider = "gmail" | "google_sheets";

interface ConnectionRow {
  id: string;
  provider: string;
  status: string;
  encrypted_credentials: string | null;
  granted_scopes: string | null;
  account_label: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
}

export function getConnectionRow(workspaceId: string, provider: string): ConnectionRow | undefined {
  return get<ConnectionRow>(
    "SELECT id, provider, status, encrypted_credentials, granted_scopes, account_label, connected_at, last_checked_at FROM integration_connections WHERE workspace_id = ? AND provider = ?",
    workspaceId,
    provider,
  );
}

export function providerStatus(workspaceId: string, provider: GoogleProvider): "connected" | "demo" | "setup_required" | "disconnected" | "error" {
  const row = getConnectionRow(workspaceId, provider);
  if (row?.status === "connected") return "connected";
  if (row?.status === "demo") return "demo";
  if (row?.status === "error") return "error";
  if (!googleOauthConfigured()) return "setup_required";
  return "disconnected";
}

export async function getAccessToken(workspaceId: string, provider: GoogleProvider): Promise<string> {
  const row = getConnectionRow(workspaceId, provider);
  if (!row || row.status !== "connected") {
    throw new AppError(
      "integration_not_connected",
      `${provider === "gmail" ? "Gmail" : "Google Sheets"} is not connected for this workspace. Connect it in Integrations, or run in simulation mode.`,
      { status: 409 },
    );
  }
  const tokens = decryptJson<GoogleTokens>(row.encrypted_credentials);
  if (!tokens?.access_token) {
    throw new AppError("integration_credentials_invalid", "Stored Google credentials could not be read. Reconnect the integration.", { status: 409 });
  }
  const expiresSoon = !tokens.expiry_date || tokens.expiry_date < Date.now() + 60_000;
  if (expiresSoon && tokens.refresh_token) {
    try {
      const refreshed = await refreshGoogleTokens(tokens);
      run(
        "UPDATE integration_connections SET encrypted_credentials = ?, last_checked_at = ? WHERE id = ?",
        encryptJson(refreshed),
        new Date().toISOString(),
        row.id,
      );
      return refreshed.access_token;
    } catch {
      run("UPDATE integration_connections SET status = 'error', last_checked_at = ? WHERE id = ?", new Date().toISOString(), row.id);
      throw new AppError(
        "google_authorization_expired",
        "Google authorization has expired or was revoked. Reconnect the integration to continue.",
        { status: 409 },
      );
    }
  }
  return tokens.access_token;
}

export async function googleFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  provider: GoogleProvider = "gmail",
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new AppError("google_network_error", "Could not reach Google. Check the server's network connection and try again.", {
      status: 502,
      retryable: true,
    });
  }
  if (response.status === 401) {
    throw new AppError("google_authorization_expired", "Google authorization expired. Reconnect the integration in Integrations.", {
      status: 409,
    });
  }
  if (response.status === 429 || response.status >= 500) {
    throw new AppError("google_temporary_error", "Google returned a temporary error. FlowMate will retry this step.", {
      status: 502,
      retryable: true,
    });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AppError(
      "google_request_failed",
      `${provider === "gmail" ? "Gmail" : "Google Sheets"} rejected the request (${response.status}). Check the configuration and permissions.`,
      { status: 400, details: text.slice(0, 300) },
    );
  }
  return response;
}

export function parseSpreadsheetId(input: string): string {
  const value = (input || "").trim();
  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = urlMatch ? urlMatch[1] : value;
  if (!id || !/^[a-zA-Z0-9-_]{10,}$/.test(id)) {
    throw new AppError("invalid_spreadsheet", "Enter a valid Google Sheets ID or full spreadsheet URL.", { status: 400 });
  }
  return id;
}

export function parseSheetName(input: string): string {
  const value = (input || "").trim();
  if (!value) throw new AppError("invalid_sheet_name", "Enter the worksheet name, for example Sheet1.", { status: 400 });
  if (value.length > 100) throw new AppError("invalid_sheet_name", "Worksheet name is too long.", { status: 400 });
  return value;
}

/* ----------------------------- Gmail helpers ----------------------------- */

export interface ParsedEmail {
  message_id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  body: string;
  received_at: string;
}

function header(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBody(payload: Record<string, unknown> | undefined): string {
  if (!payload) return "";
  const mimeType = String(payload.mimeType || "");
  const body = payload.body as { data?: string } | undefined;
  if (mimeType === "text/plain" && body?.data) return decodeBase64Url(body.data);
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const found = extractBody(part);
      if (found) return found;
    }
  }
  if (body?.data) return decodeBase64Url(body.data);
  return "";
}

export async function gmailList(accessToken: string, query: string, maxResults = 10): Promise<Array<{ id: string }>> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query || "is:unread");
  url.searchParams.set("maxResults", String(Math.min(25, Math.max(1, maxResults))));
  const response = await googleFetch(url.toString(), accessToken, {}, "gmail");
  const json = (await response.json()) as { messages?: Array<{ id: string }> };
  return json.messages ?? [];
}

export async function gmailGet(accessToken: string, id: string): Promise<ParsedEmail> {
  const response = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    accessToken,
    {},
    "gmail",
  );
  const json = (await response.json()) as {
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<Record<string, unknown>>; mimeType?: string };
  };
  const headers = json.payload?.headers ?? [];
  return {
    message_id: json.id,
    subject: header(headers, "Subject"),
    from: header(headers, "From"),
    to: header(headers, "To"),
    snippet: json.snippet ?? "",
    body: extractBody(json.payload as Record<string, unknown> | undefined) || json.snippet || "",
    received_at: json.internalDate ? new Date(Number(json.internalDate)).toISOString() : new Date().toISOString(),
  };
}

export async function gmailSend(
  accessToken: string,
  input: { to: string; subject: string; body: string; cc?: string; bcc?: string },
): Promise<{ message_id: string; status: string }> {
  const lines = [
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    ...(input.bcc ? [`Bcc: ${input.bcc}`] : []),
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
  const response = await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    accessToken,
    { method: "POST", body: JSON.stringify({ raw }) },
    "gmail",
  );
  const json = (await response.json()) as { id?: string };
  return { message_id: json.id ?? "unknown", status: "sent" };
}

/* ----------------------------- Sheets helpers ----------------------------- */

export async function sheetsAppend(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: string[],
): Promise<{ updatedRange: string; rowIndex: number | null }> {
  const range = `${sheetName}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await googleFetch(url, accessToken, { method: "POST", body: JSON.stringify({ values: [values] }) }, "google_sheets");
  const json = (await response.json()) as { updates?: { updatedRange?: string; updatedRows?: number } };
  const updatedRange = json.updates?.updatedRange ?? `${sheetName}!A1`;
  const match = updatedRange.match(/!A(\d+)/i);
  return { updatedRange, rowIndex: match ? Number(match[1]) : null };
}

export async function sheetsRead(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const range = `${sheetName}!A1:Z1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const response = await googleFetch(url, accessToken, {}, "google_sheets");
  const json = (await response.json()) as { values?: string[][] };
  return json.values ?? [];
}

export function googleScopesFor(provider: GoogleProvider): string[] {
  if (provider === "gmail") {
    return ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
  }
  return ["openid", "email", "profile", "https://www.googleapis.com/auth/spreadsheets"];
}

export function storedScopes(row: ConnectionRow | undefined): string[] {
  if (!row?.granted_scopes) return [];
  return row.granted_scopes.split(/[\s,]+/).filter(Boolean);
}

export function connectionSummary(workspaceId: string, provider: GoogleProvider) {
  const row = getConnectionRow(workspaceId, provider);
  const tokens = row ? decryptJson<GoogleTokens>(row.encrypted_credentials) : null;
  return {
    provider,
    status: providerStatus(workspaceId, provider),
    accountLabel: row?.account_label ?? null,
    scopes: storedScopes(row),
    connectedAt: row?.connected_at ?? null,
    lastCheckedAt: row?.last_checked_at ?? null,
    oauthConfigured: googleOauthConfigured(),
    hasRefreshToken: Boolean(tokens?.refresh_token),
    encryptionConfigured: Boolean(config.tokenEncryptionKey),
  };
}

export { googleOauthConfigured };
