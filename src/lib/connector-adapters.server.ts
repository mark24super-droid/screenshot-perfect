// Live Gmail / Google Sheets adapters calling the provider on behalf of the
// signed-in user through the Lovable connector gateway. Every function here is
// server-only: connection keys never leave the server.
import { callAsAppUser, appUserReconnectRequired } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GOOGLE_MAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
];

export type LiveOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "not_connected"; message: string }
  | { kind: "reconnect_required"; message: string }
  | { kind: "provider_error"; message: string };

async function withKey<T>(
  userId: string,
  connectorId: "google_mail" | "google_sheets",
  run: (connectionKey: string) => Promise<{ kind: "ok"; data: T } | { kind: "provider_error"; message: string }>,
): Promise<LiveOutcome<T>> {
  let connectionKey: string | null;
  try {
    connectionKey = await getConnectionKeyForUser(userId, connectorId);
  } catch {
    connectionKey = null;
  }
  if (!connectionKey) {
    return { kind: "not_connected", message: `${connectorId === "google_mail" ? "Gmail" : "Google Sheets"} is not connected yet. Connect it on the Integrations page, or run this workflow in simulation mode.` };
  }
  try {
    const result = await run(connectionKey);
    return result;
  } catch (err) {
    console.error(`${connectorId} adapter error`, err);
    return { kind: "provider_error", message: "The provider request failed. Check the connection and try again." };
  }
}

async function gatewayCall(
  connectorId: "google_mail" | "google_sheets",
  connectionKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: connectionKey,
    connectorId,
    path,
    init,
    requiredScopes: connectorId === "google_mail" ? GOOGLE_MAIL_SCOPES : GOOGLE_SHEETS_SCOPES,
  });
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

export function fetchLatestEmail(userId: string, filter: string): Promise<LiveOutcome<{ subject: string; from: string; body: string; date: string; snippet: string }>> {
  return withKey(userId, "google_mail", async (key) => {
    const q = filter ? `is:inbox ${filter}` : "is:inbox";
    const listRes = await gatewayCall("google_mail", key, `/gmail/v1/users/me/messages?maxResults=1&q=${encodeURIComponent(q)}`);
    if (await appUserReconnectRequired(listRes)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!listRes.ok) return { kind: "provider_error" as const, message: `Gmail search failed (${listRes.status})` };
    const list = (await listRes.json()) as { messages?: { id: string }[] };
    const id = list.messages?.[0]?.id;
    if (!id) return { kind: "provider_error" as const, message: "No matching email found. The trigger will wait until a new email arrives." };

    const msgRes = await gatewayCall(
      "google_mail",
      key,
      `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    );
    if (await appUserReconnectRequired(msgRes)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!msgRes.ok) return { kind: "provider_error" as const, message: `Gmail read failed (${msgRes.status})` };
    const msg = (await msgRes.json()) as {
      snippet?: string;
      payload?: { headers?: { name: string; value: string }[] };
    };
    const headers = msg.payload?.headers ?? [];
    const header = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    return {
      kind: "ok",
      data: {
        subject: header("Subject"),
        from: header("From"),
        date: header("Date"),
        snippet: msg.snippet ?? "",
        body: msg.snippet ?? "",
      },
    };
  });
}

export function sendEmail(userId: string, to: string, subject: string, body: string): Promise<LiveOutcome<{ message_id: string; sent: boolean }>> {
  return withKey(userId, "google_mail", async (key) => {
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n");
    const res = await gatewayCall("google_mail", key, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(email) }),
    });
    if (await appUserReconnectRequired(res)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "provider_error" as const, message: `Gmail send failed (${res.status}): ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { kind: "ok", data: { message_id: data.id ?? "sent", sent: true } };
  });
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

function spreadsheetRange(worksheet: string | undefined, columns: string[]): string {
  const sheet = worksheet || "Sheet1";
  const lastCol = columns.length ? String.fromCharCode(64 + Math.min(columns.length, 26)) : "Z";
  return `'${sheet}'!A1:${lastCol}1`;
}

export function appendSheetRow(
  userId: string,
  spreadsheetId: string | undefined,
  worksheet: string | undefined,
  values: Record<string, unknown>,
): Promise<LiveOutcome<{ row_number: number }>> {
  return withKey(userId, "google_sheets", async (key) => {
    if (!spreadsheetId) {
      return { kind: "provider_error" as const, message: "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode." };
    }
    const columns = Object.keys(values);
    const row = columns.map((c) => {
      const v = values[c];
      return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
    });
    const res = await gatewayCall(
      "google_sheets",
      key,
      `/sheets/v4/spreadsheets/${spreadsheetId}/values/${spreadsheetRange(worksheet, columns)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      },
    );
    if (await appUserReconnectRequired(res)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "provider_error" as const, message: `Sheets append failed (${res.status}): ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { updates?: { updatedRange?: string } };
    const range = data.updates?.updatedRange ?? "";
    const match = range.match(/(\d+)(?::\d+)?$/);
    return { kind: "ok", data: { row_number: match ? Number(match[1]) : 0 } };
  });
}

export function findSheetRow(
  userId: string,
  spreadsheetId: string | undefined,
  worksheet: string | undefined,
  column: string,
  value: string,
): Promise<LiveOutcome<{ found: boolean; row: Record<string, unknown> | null }>> {
  return withKey(userId, "google_sheets", async (key) => {
    if (!spreadsheetId) {
      return { kind: "provider_error" as const, message: "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode." };
    }
    const sheet = worksheet || "Sheet1";
    const res = await gatewayCall("google_sheets", key, `/sheets/v4/spreadsheets/${spreadsheetId}/values/'${sheet}'!A:Z`);
    if (await appUserReconnectRequired(res)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!res.ok) return { kind: "provider_error" as const, message: `Sheets read failed (${res.status})` };
    const data = (await res.json()) as { values?: unknown[][] };
    const rows = data.values ?? [];
    if (!rows.length) return { kind: "ok", data: { found: false, row: null } };
    const [headers, ...body] = rows;
    const colIdx = headers.findIndex((h) => String(h).toLowerCase() === column.toLowerCase());
    if (colIdx === -1) return { kind: "ok", data: { found: false, row: null } };
    const found = body.find((r) => String(r[colIdx] ?? "") === value);
    if (!found) return { kind: "ok", data: { found: false, row: null } };
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => (row[String(h)] = found[i] ?? ""));
    return { kind: "ok", data: { found: true, row } };
  });
}

export function fetchLatestSheetRow(
  userId: string,
  spreadsheetId: string | undefined,
  worksheet: string | undefined,
): Promise<LiveOutcome<{ row: Record<string, unknown>; row_number: number }>> {
  return withKey(userId, "google_sheets", async (key) => {
    if (!spreadsheetId) {
      return { kind: "provider_error" as const, message: "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode." };
    }
    const sheet = worksheet || "Sheet1";
    const res = await gatewayCall("google_sheets", key, `/sheets/v4/spreadsheets/${spreadsheetId}/values/'${sheet}'!A:Z`);
    if (await appUserReconnectRequired(res)) return { kind: "provider_error" as const, message: "reconnect" };
    if (!res.ok) return { kind: "provider_error" as const, message: `Sheets read failed (${res.status})` };
    const data = (await res.json()) as { values?: unknown[][] };
    const rows = data.values ?? [];
    if (rows.length < 2) return { kind: "provider_error" as const, message: "The worksheet has no data rows yet." };
    const headers = rows[0];
    const last = rows[rows.length - 1];
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => (row[String(h)] = last[i] ?? ""));
    return { kind: "ok", data: { row, row_number: rows.length } };
  });
}
