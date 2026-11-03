import { AppError } from "../lib/errors";
import { extractFields, summarizeText } from "../services/ai";
import {
  gmailGet,
  gmailList,
  gmailSend,
  getAccessToken,
  parseSheetName,
  parseSpreadsheetId,
  sheetsAppend,
  sheetsRead,
} from "../services/google";
import { optionalString, requireNumber, requireString, validateEmailList } from "./resolve";
import { SAMPLE_EMAIL, SAMPLE_EMAILS, SAMPLE_MANUAL_INPUT, type HandlerContext, type NodeHandler } from "./types";

const manualTrigger: NodeHandler = async (ctx) => {
  const provided =
    ctx.executionInput && typeof ctx.executionInput === "object" && Object.keys(ctx.executionInput as object).length > 0
      ? (ctx.executionInput as Record<string, unknown>)
      : null;
  const input = provided ?? SAMPLE_MANUAL_INPUT;
  return {
    triggered_at: new Date().toISOString(),
    input,
    sample_data: !provided,
    ...(ctx.mode === "simulation" ? { simulated: true } : {}),
  };
};

const scheduleTrigger: NodeHandler = async () => ({
  scheduled_at: new Date().toISOString(),
});

const gmailNewEmail: NodeHandler = async (ctx) => {
  const query = requireString(ctx.config, "query", "Gmail search query");
  const label = optionalString(ctx.config, "label");
  if (ctx.mode === "simulation") {
    return {
      ...SAMPLE_EMAIL,
      simulated: true,
      meta: { source: "simulation", note: "Simulated inbox message. No real email was read." },
    };
  }
  const token = await getAccessToken(ctx.workspaceId, "gmail");
  const finalQuery = label ? `${query} label:${label}` : query;
  const messages = await gmailList(token, finalQuery, 1);
  if (messages.length === 0) {
    throw new AppError("no_matching_email", "No email matched this trigger's search query. Adjust the query or wait for a new message.", {
      status: 404,
    });
  }
  const email = await gmailGet(token, messages[0].id);
  return { ...email, meta: { source: "gmail" } };
};

const gmailSearchEmails: NodeHandler = async (ctx) => {
  const query = requireString(ctx.config, "query", "Gmail search query");
  const maxResults = requireNumber(ctx.config, "maxResults", 10, 1, 25);
  if (ctx.mode === "simulation") {
    const combined = SAMPLE_EMAILS.map((m) => `From: ${m.from}\nSubject: ${m.subject}\n${m.snippet}`).join("\n\n");
    return {
      messages: SAMPLE_EMAILS,
      count: SAMPLE_EMAILS.length,
      combined_text: combined,
      simulated: true,
      meta: { source: "simulation", note: "Simulated inbox data. No real emails were read." },
    };
  }
  const token = await getAccessToken(ctx.workspaceId, "gmail");
  const ids = await gmailList(token, query, Math.min(maxResults, 10));
  const messages = [];
  for (const item of ids) {
    const email = await gmailGet(token, item.id);
    messages.push({
      subject: email.subject,
      from: email.from,
      snippet: email.snippet,
      received_at: email.received_at,
      message_id: email.message_id,
    });
  }
  return {
    messages,
    count: messages.length,
    combined_text: messages.map((m) => `From: ${m.from}\nSubject: ${m.subject}\n${m.snippet}`).join("\n\n"),
    meta: { source: "gmail" },
  };
};

const gmailSendEmail: NodeHandler = async (ctx) => {
  const to = validateEmailList(requireString(ctx.config, "to", "Recipient"), "Recipient");
  const subject = requireString(ctx.config, "subject", "Subject");
  const body = requireString(ctx.config, "body", "Message body");
  const cc = optionalString(ctx.config, "cc");
  const bcc = optionalString(ctx.config, "bcc");
  if (ctx.mode === "simulation") {
    return {
      message_id: `sim_${ctx.executionId.slice(-8)}`,
      status: "simulated",
      to,
      subject,
      simulated: true,
      meta: { source: "simulation", note: "Simulation only — no email was sent." },
    };
  }
  const token = await getAccessToken(ctx.workspaceId, "gmail");
  const result = await gmailSend(token, { to, subject, body, cc, bcc });
  return { ...result, to, subject, meta: { source: "gmail" } };
};

const sheetsAddRow: NodeHandler = async (ctx) => {
  const spreadsheetId = parseSpreadsheetId(requireString(ctx.config, "spreadsheetId", "Spreadsheet"));
  const sheetName = parseSheetName(requireString(ctx.config, "sheetName", "Worksheet name"));
  const mapping = Array.isArray(ctx.config.mapping) ? (ctx.config.mapping as Array<{ column?: string; value?: string }>) : [];
  const rows = mapping.filter((m) => m && (m.column ?? "").trim());
  if (rows.length === 0) {
    throw new AppError("missing_mapping", "Add at least one column mapping for the spreadsheet row.", { status: 400 });
  }
  const values = rows.map((r) => String(r.value ?? ""));
  const record: Record<string, string> = {};
  rows.forEach((r, i) => {
    record[(r.column ?? "").trim()] = values[i];
  });
  if (ctx.mode === "simulation") {
    const lastCol = String.fromCharCode(64 + Math.min(26, Math.max(1, values.length)));
    return {
      updatedRange: `${sheetName}!A2:${lastCol}2`,
      rowIndex: 2,
      values: record,
      simulated: true,
      meta: { source: "simulation", note: "Simulation only — no spreadsheet was modified." },
    };
  }
  const token = await getAccessToken(ctx.workspaceId, "google_sheets");
  const result = await sheetsAppend(token, spreadsheetId, sheetName, values);
  return { ...result, values: record, meta: { source: "google_sheets" } };
};

const sheetsFindRow: NodeHandler = async (ctx) => {
  const spreadsheetId = parseSpreadsheetId(requireString(ctx.config, "spreadsheetId", "Spreadsheet"));
  const sheetName = parseSheetName(requireString(ctx.config, "sheetName", "Worksheet name"));
  const column = requireString(ctx.config, "column", "Column header");
  const value = requireString(ctx.config, "value", "Value to match");

  if (ctx.mode === "simulation") {
    return {
      found: true,
      row: { [column]: value, Name: "Jordan Lee", Email: "jordan@example.com" },
      rowIndex: 4,
      simulated: true,
      meta: { source: "simulation", note: "Simulation only — no spreadsheet was read." },
    };
  }

  const token = await getAccessToken(ctx.workspaceId, "google_sheets");
  const rows = await sheetsRead(token, spreadsheetId, sheetName);
  if (rows.length === 0) {
    return { found: false, row: null, rowIndex: null, meta: { source: "google_sheets" } };
  }
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = headers.indexOf(column.trim().toLowerCase());
  if (colIndex === -1) {
    throw new AppError("column_not_found", `Column “${column}” was not found in the first row of ${sheetName}.`, { status: 400 });
  }
  const matchIndex = rows.findIndex((row, index) => index > 0 && (row[colIndex] ?? "").trim().toLowerCase() === value.trim().toLowerCase());
  if (matchIndex === -1) {
    return { found: false, row: null, rowIndex: null, meta: { source: "google_sheets" } };
  }
  const row: Record<string, string> = {};
  rows[0].forEach((header, i) => {
    if (header) row[header] = rows[matchIndex][i] ?? "";
  });
  return { found: true, row, rowIndex: matchIndex + 1, meta: { source: "google_sheets" } };
};

const sheetsNewRow: NodeHandler = async (ctx) => {
  if (ctx.mode === "live") {
    throw new AppError(
      "demo_only_node",
      "Google Sheets new-row triggers are simulation-only in this release. Use a schedule or manual trigger for live runs.",
      { status: 400 },
    );
  }
  const sheetName = optionalString(ctx.config, "sheetName") || "Sheet1";
  return {
    row: { Name: "Jordan Lee", Email: "", Company: "Brightside Co.", Source: "Website" },
    rowIndex: 12,
    sheetName,
    simulated: true,
    meta: { source: "simulation", note: "Simulated new row — no spreadsheet was read." },
  };
};

const aiSummarize: NodeHandler = async (ctx) => {
  const text = requireString(ctx.config, "text", "Source text");
  const style = optionalString(ctx.config, "style") || "concise";
  const maxLength = requireNumber(ctx.config, "maxLength", 600, 100, 4000);
  const result = await summarizeText({ text, style, maxLength, mode: ctx.mode });
  return {
    summary: result.summary,
    source_length: result.source_length,
    simulated: result.meta.source !== "provider",
    meta: result.meta,
  };
};

const aiExtract: NodeHandler = async (ctx) => {
  const text = requireString(ctx.config, "text", "Source text");
  const fields = requireString(ctx.config, "fields", "Fields to extract");
  const result = await extractFields({ text, fields, mode: ctx.mode });
  return {
    ...result,
    simulated: result.meta.source !== "provider",
  };
};

const logicFilter: NodeHandler = async (ctx) => {
  const left = optionalString(ctx.config, "left");
  const operator = optionalString(ctx.config, "operator") || "exists";
  const right = optionalString(ctx.config, "right");
  let passed = false;
  switch (operator) {
    case "exists":
      passed = left.trim().length > 0;
      break;
    case "equals":
      passed = left.trim().toLowerCase() === right.trim().toLowerCase();
      break;
    case "not_equals":
      passed = left.trim().toLowerCase() !== right.trim().toLowerCase();
      break;
    case "contains":
      passed = left.toLowerCase().includes(right.toLowerCase());
      break;
    case "greater_than":
      passed = Number(left) > Number(right);
      break;
    case "less_than":
      passed = Number(left) < Number(right);
      break;
    default:
      throw new AppError("invalid_operator", "Choose a valid filter operator in the step settings.", { status: 400 });
  }
  return {
    passed,
    value: left,
    compared_to: right,
    note: passed ? "Condition met." : "Condition not met — later steps are skipped.",
  };
};

const delay: NodeHandler = async (ctx) => {
  const seconds = requireNumber(ctx.config, "seconds", 5, 1, 60);
  if (ctx.mode === "simulation") {
    return { waited_ms: 0, requested_seconds: seconds, simulated: true };
  }
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return { waited_ms: seconds * 1000 };
};

export const HANDLERS: Record<string, NodeHandler> = {
  "manual.trigger": manualTrigger,
  "schedule.trigger": scheduleTrigger,
  "gmail.new_email": gmailNewEmail,
  "gmail.search_emails": gmailSearchEmails,
  "gmail.send_email": gmailSendEmail,
  "google_sheets.new_row": sheetsNewRow,
  "google_sheets.add_row": sheetsAddRow,
  "google_sheets.find_row": sheetsFindRow,
  "ai.summarize": aiSummarize,
  "ai.extract": aiExtract,
  "logic.filter": logicFilter,
  "utility.delay": delay,
};

export function getHandler(type: string): NodeHandler | undefined {
  return HANDLERS[type];
}
