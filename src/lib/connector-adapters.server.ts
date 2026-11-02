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

export const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export type LiveOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "not_connected"; message: string }
  | { kind: "reconnect_required"; message: string }
  | { kind: "provider_error"; message: string };

const CONNECTOR_LABEL = {
  google_mail: "Gmail",
  google_sheets: "Google Sheets",
} as const;

async function withKey<T>(
  userId: string,
  connectorId: "google_mail" | "google_sheets",
  run: (connectionKey: string) => Promise<LiveOutcome<T>>,
): Promise<LiveOutcome<T>> {
  let connectionKey: string | null;
  try {
    connectionKey = await getConnectionKeyForUser(userId, connectorId);
  } catch {
    connectionKey = null;
  }
  if (!connectionKey) {
    return {
      kind: "not_connected",
      message: `${CONNECTOR_LABEL[connectorId]} is not connected yet. Connect it on the Integrations page, or run this workflow in simulation mode.`,
    };
  }
  try {
    return await run(connectionKey);
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

/** Detect a revoked / stale credential and return the correct honest outcome. */
async function reconnectOutcome<T>(res: Response, connectorId: "google_mail" | "google_sheets"): Promise<LiveOutcome<T> | null> {
  if (!(await appUserReconnectRequired(res))) return null;
  return {
    kind: "reconnect_required",
    message: `Your ${CONNECTOR_LABEL[connectorId]} connection needs to be renewed. Reconnect it on the Integrations page, then run this workflow again.`,
  };
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64url(s: string): string {
  return b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string): string {
  const clean = safeHeader(value);
  // Keep plain ASCII headers readable; encode anything else as RFC 2047.
  return /^[\x20-\x7E]*$/.test(clean) ? clean : `=?UTF-8?B?${b64(clean)}?=`;
}

interface GmailPayload {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
}

/** Walk a Gmail MIME tree and return the best available plain-text body. */
function extractPlainText(payload: GmailPayload | undefined, depth = 0): string {
  if (!payload || depth > 8) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try {
      return fromB64Url(payload.body.data);
    } catch {
      return "";
    }
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part, depth + 1);
    if (text.trim()) return text;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

export function fetchLatestEmail(
  userId: string,
  filter: string,
): Promise<LiveOutcome<{ subject: string; from: string; body: string; date: string; snippet: string }>> {
  return withKey(userId, "google_mail", async (key) => {
    const q = filter ? `is:inbox ${filter}` : "is:inbox";
    const listRes = await gatewayCall(
      "google_mail",
      key,
      `/gmail/v1/users/me/messages?maxResults=1&q=${encodeURIComponent(q)}`,
    );
    const reconnect = await reconnectOutcome<{ subject: string; from: string; body: string; date: string; snippet: string }>(
      listRes,
      "google_mail",
    );
    if (reconnect) return reconnect;
    if (!listRes.ok) {
      return { kind: "provider_error", message: `Gmail search failed (${listRes.status}). Try again in a moment.` };
    }
    const list = (await listRes.json()) as { messages?: { id: string }[] };
    const id = list.messages?.[0]?.id;
    if (!id) {
      return {
        kind: "provider_error",
        message: "No matching email found. The trigger will wait until a new email arrives.",
      };
    }

    const msgRes = await gatewayCall("google_mail", key, `/gmail/v1/users/me/messages/${id}?format=full`);
    const msgReconnect = await reconnectOutcome<{
      subject: string;
      from: string;
      body: string;
      date: string;
      snippet: string;
    }>(msgRes, "google_mail");
    if (msgReconnect) return msgReconnect;
    if (!msgRes.ok) {
      return { kind: "provider_error", message: `Gmail read failed (${msgRes.status}). Try again in a moment.` };
    }
    const msg = (await msgRes.json()) as {
      snippet?: string;
      payload?: GmailPayload & { headers?: { name: string; value: string }[] };
    };
    const headers = msg.payload?.headers ?? [];
    const header = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    const plain = extractPlainText(msg.payload).trim();
    return {
      kind: "ok",
      data: {
        subject: header("Subject"),
        from: header("From"),
        date: header("Date"),
        snippet: msg.snippet ?? "",
        body: plain || msg.snippet || "",
      },
    };
  });
}

export function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<LiveOutcome<{ message_id: string; sent: boolean }>> {
  return withKey(userId, "google_mail", async (key) => {
    const recipients = safeHeader(to);
    if (!recipients) {
      return { kind: "provider_error", message: "The email has no recipient. Add one in the node settings." };
    }
    const lines = [`To: ${recipients}`];
    if (cc?.trim()) lines.push(`Cc: ${safeHeader(cc)}`);
    if (bcc?.trim()) lines.push(`Bcc: ${safeHeader(bcc)}`);
    lines.push(
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      // Wrap base64 at 76 chars (RFC 2045).
      b64(body).replace(/.{1,76}/g, "$&\r\n"),
    );
    const raw = lines.join("\r\n");

    const res = await gatewayCall("google_mail", key, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(raw) }),
    });
    const reconnect = await reconnectOutcome<{ message_id: string; sent: boolean }>(res, "google_mail");
    if (reconnect) return reconnect;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "provider_error", message: `Gmail send failed (${res.status}). ${text.slice(0, 160)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { kind: "ok", data: { message_id: data.id ?? "sent", sent: true } };
  });
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

/** A → A, Z → Z, AA → AA … supports sheets wider than 26 columns. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetRange(worksheet: string | undefined, range: string): string {
  const sheet = (worksheet || "Sheet1").replace(/'/g, "''");
  return `'${sheet}'!${range}`;
}

async function readSheetValues(
  connectorId: "google_sheets",
  key: string,
  spreadsheetId: string,
  worksheet: string | undefined,
): Promise<LiveOutcome<{ headers: string[]; rows: unknown[][]; range: string }>> {
  const range = sheetRange(worksheet, "A1:ZZ10000");
  const res = await gatewayCall(
    connectorId,
    key,
    `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  const reconnect = await reconnectOutcome<{ headers: string[]; rows: unknown[][]; range: string }>(res, "google_sheets");
  if (reconnect) return reconnect;
  if (!res.ok) {
    return { kind: "provider_error", message: `Sheets read failed (${res.status}). Check the spreadsheet ID and access.` };
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const values = data.values ?? [];
  const headers = (values[0] ?? []).map((h) => String(h ?? "").trim());
  return { kind: "ok", data: { headers, rows: values.slice(1), range } };
}

/** Makes sure the worksheet has a header row, writing the keys if needed. */
async function ensureHeaders(
  key: string,
  spreadsheetId: string,
  worksheet: string | undefined,
  keys: string[],
): Promise<LiveOutcome<true>> {
  const existing = await readSheetValues("google_sheets", key, spreadsheetId, worksheet);
  if (existing.kind !== "ok") return existing;
  const headers = existing.data.headers;
  const hasAllKeys = keys.every((k) => headers.includes(k));
  if (headers.some(Boolean) && hasAllKeys) return { kind: "ok", data: true };

  const merged = [...headers.filter(Boolean), ...keys.filter((k) => !headers.includes(k))];
  const range = sheetRange(worksheet, `A1:${columnLetter(merged.length - 1)}1`);
  const res = await gatewayCall(
    "google_sheets",
    key,
    `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [merged] }),
    },
  );
  const reconnect = await reconnectOutcome<true>(res, "google_sheets");
  if (reconnect) return reconnect;
  if (!res.ok) {
    return { kind: "provider_error", message: `Could not prepare the sheet header row (${res.status}).` };
  }
  return { kind: "ok", data: true };
}

export function appendSheetRow(
  userId: string,
  spreadsheetId: string | undefined,
  worksheet: string | undefined,
  values: Record<string, unknown>,
): Promise<LiveOutcome<{ row_number: number }>> {
  return withKey(userId, "google_sheets", async (key) => {
    if (!spreadsheetId) {
      return {
        kind: "provider_error",
        message:
          "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode.",
      };
    }
    const columns = Object.keys(values);
    if (!columns.length) {
      return { kind: "provider_error", message: "No column values are mapped for this row." };
    }

    const ensured = await ensureHeaders(key, spreadsheetId, worksheet, columns);
    if (ensured.kind !== "ok") return ensured;

    // Re-read the header row so values land in the right columns even if the
    // sheet already had a different column order or extra columns.
    const sheet = await readSheetValues("google_sheets", key, spreadsheetId, worksheet);
    if (sheet.kind !== "ok") return sheet;
    const headers = sheet.data.headers.filter(Boolean);
    const width = Math.max(headers.length, columns.length);
    const row: string[] = new Array(width).fill("");
    columns.forEach((column) => {
      const idx = headers.indexOf(column);
      const v = values[column];
      const text = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
      row[idx === -1 ? headers.length : idx] = text;
    });

    const range = sheetRange(worksheet, `A1:${columnLetter(row.length - 1)}1`);
    const res = await gatewayCall(
      "google_sheets",
      key,
      `/sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      },
    );
    const reconnect = await reconnectOutcome<{ row_number: number }>(res, "google_sheets");
    if (reconnect) return reconnect;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "provider_error", message: `Sheets append failed (${res.status}). ${text.slice(0, 160)}` };
    }
    const data = (await res.json()) as { updates?: { updatedRange?: string } };
    const updated = data.updates?.updatedRange ?? "";
    const match = updated.match(/(\d+)(?::\d+)?$/);
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
  return withKey<{ found: boolean; row: Record<string, unknown> | null }>(
    userId,
    "google_sheets",
    async (key) => {
    if (!spreadsheetId) {
      return {
        kind: "provider_error",
        message:
          "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode.",
      };
    }
    const sheet = await readSheetValues("google_sheets", key, spreadsheetId, worksheet);
    if (sheet.kind !== "ok") return sheet;
    const { headers, rows } = sheet.data;
    if (!headers.length) return { kind: "ok", data: { found: false, row: null } };
    const colIdx = headers.findIndex((h) => h.toLowerCase() === column.toLowerCase());
    if (colIdx === -1) return { kind: "ok", data: { found: false, row: null } };
    const found = rows.find((r) => String(r[colIdx] ?? "") === value);
    if (!found) return { kind: "ok", data: { found: false, row: null } };
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => (row[h] = found[i] ?? ""));
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
      return {
        kind: "provider_error",
        message:
          "Live mode needs a spreadsheet ID (from the sheet's URL). Add it in the node settings, or use simulation mode.",
      };
    }
    const sheet = await readSheetValues("google_sheets", key, spreadsheetId, worksheet);
    if (sheet.kind !== "ok") return sheet;
    const { headers, rows } = sheet.data;
    if (!rows.length) {
      return { kind: "provider_error", message: "The worksheet has no data rows yet." };
    }
    const last = rows[rows.length - 1]!;
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => (row[h] = last[i] ?? ""));
    return { kind: "ok", data: { row, row_number: rows.length } };
  });
}
