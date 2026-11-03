import { config, isAiConfigured } from "../config";
import { NODE_DEFINITIONS, requiredIntegrationsForTypes, type ProviderId } from "@shared/nodes";
import {
  autoLayout,
  sanitizeNodeConfig,
  validateDefinition,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@shared/workflow";
import { AppError } from "../lib/errors";
import { newId } from "../lib/crypto";
import { run } from "../db";

export type AiSource = "provider" | "local-demo" | "simulation";

export interface AiMeta {
  source: AiSource;
  providerConfigured: boolean;
  model: string | null;
}

export interface GeneratedPlan {
  name: string;
  description: string;
  explanation: string;
  definition: WorkflowDefinition;
  requiredIntegrations: ProviderId[];
  missingConfiguration: string[];
  source: AiSource;
  providerConfigured: boolean;
  model: string | null;
  notes: string[];
}

function meta(source: AiSource): AiMeta {
  return {
    source,
    providerConfigured: isAiConfigured(),
    model: isAiConfigured() ? config.ai.model : null,
  };
}

async function chat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, jsonMode: boolean, maxTokens = 1600): Promise<string> {
  if (!isAiConfigured()) {
    throw new AppError("ai_not_configured", "No AI provider is configured on the server.", { status: 503 });
  }
  let response: Response;
  try {
    response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
  } catch {
    throw new AppError("ai_provider_unreachable", "The AI provider could not be reached. Check the server's network and AI configuration.", {
      status: 502,
      retryable: true,
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new AppError("ai_auth_failed", "The AI provider rejected the server API key. Check AI_API_KEY.", { status: 502 });
  }
  if (response.status === 429 || response.status >= 500) {
    throw new AppError("ai_provider_busy", "The AI provider is temporarily unavailable. Please retry in a moment.", {
      status: 503,
      retryable: true,
    });
  }
  if (!response.ok) {
    throw new AppError("ai_provider_error", `The AI provider returned an error (${response.status}).`, { status: 502 });
  }
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AppError("ai_empty_response", "The AI provider returned an empty response.", { status: 502, retryable: true });
  return content;
}

function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/* ------------------------------ AI node actions ------------------------------ */

export async function summarizeText(input: {
  text: string;
  style: string;
  maxLength: number;
  mode: "simulation" | "live";
}): Promise<{ summary: string; source_length: number; meta: AiMeta }> {
  const text = (input.text || "").trim();
  if (!text) throw new AppError("empty_summary_input", "AI Summarize has no text to summarize. Check the input mapping.", { status: 400 });
  const maxLength = Math.min(4000, Math.max(100, Number(input.maxLength) || 600));

  if (input.mode === "live" && isAiConfigured()) {
    const styleInstruction =
      input.style === "bullets"
        ? "Respond with 3-6 concise bullet points."
        : input.style === "detailed"
          ? "Respond with a detailed but readable summary."
          : "Respond with one concise paragraph.";
    const content = await chat(
      [
        { role: "system", content: `You summarize text for an automation. ${styleInstruction} Keep it under ${maxLength} characters. Do not invent facts.` },
        { role: "user", content: text.slice(0, 12000) },
      ],
      false,
      700,
    );
    return { summary: clampText(content.trim(), maxLength), source_length: text.length, meta: meta("provider") };
  }

  if (input.mode === "live" && !isAiConfigured()) {
    throw new AppError(
      "ai_not_configured",
      "AI steps need an AI provider in live mode. Configure AI_API_KEY on the server, or run this workflow in simulation mode.",
      { status: 409 },
    );
  }

  return { summary: localSummarize(text, input.style, maxLength), source_length: text.length, meta: meta("simulation") };
}

export function localSummarize(text: string, style: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 2);
  if (style === "bullets") {
    const points = sentences.slice(0, 5).map((s) => `• ${clampText(s, Math.max(60, Math.floor(maxLength / 4)))}`);
    return clampText(points.join("\n") || `• ${clean}`, maxLength);
  }
  if (style === "detailed") {
    return clampText(sentences.slice(0, 6).join(" "), maxLength);
  }
  return clampText(sentences.slice(0, 2).join(" ") || clean, maxLength);
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const AMOUNT_RE = /(?:\$|USD\s?)\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/i;
const INVOICE_RE = /\b(?:invoice|inv)[\s#:-]*([A-Z0-9-]{3,})/i;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/;

export async function extractFields(input: {
  text: string;
  fields: string;
  mode: "simulation" | "live";
}): Promise<Record<string, unknown> & { extracted: Record<string, string>; fields_found: number; meta: AiMeta }> {
  const text = (input.text || "").trim();
  if (!text) throw new AppError("empty_extract_input", "AI Extract has no text to read. Check the input mapping.", { status: 400 });
  const requested = input.fields
    .split(",")
    .map((f) => f.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((f) => /^[a-z][a-z0-9_]{0,39}$/.test(f))
    .slice(0, 20);
  if (requested.length === 0) {
    throw new AppError("no_extract_fields", "Add at least one field to extract, for example invoice_number, amount.", { status: 400 });
  }

  let extracted: Record<string, string> = {};
  let source: AiSource = "simulation";

  if (input.mode === "live" && isAiConfigured()) {
    const content = await chat(
      [
        {
          role: "system",
          content:
            "Extract structured fields from the user's text. Return ONLY a JSON object. Use exactly the requested keys. " +
            'Use an empty string when a value is not present. Never invent values. Requested keys: ' +
            requested.join(", "),
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
      true,
      700,
    );
    const parsed = parseJsonObject(content);
    for (const key of requested) {
      const value = parsed?.[key];
      extracted[key] = value === undefined || value === null ? "" : String(value).slice(0, 500);
    }
    source = "provider";
  } else if (input.mode === "live" && !isAiConfigured()) {
    throw new AppError(
      "ai_not_configured",
      "AI steps need an AI provider in live mode. Configure AI_API_KEY on the server, or run this workflow in simulation mode.",
      { status: 409 },
    );
  } else {
    extracted = localExtract(text, requested);
  }

  const fields_found = Object.values(extracted).filter((v) => v && v.trim()).length;
  return {
    extracted,
    ...extracted,
    fields_found,
    meta: meta(source),
  };
}

export function localExtract(text: string, fields: string[]): Record<string, string> {
  const email = text.match(EMAIL_RE)?.[0] ?? "";
  const amount = text.match(AMOUNT_RE)?.[1]?.replace(/,/g, "") ?? "";
  const invoice = text.match(INVOICE_RE)?.[1] ?? "";
  const date = text.match(DATE_RE)?.[1] ?? "";
  const nameMatch = text.match(/(?:my name is|i am|this is|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const companyMatch = text.match(/(?:at|from|company:?)\s+([A-Z][A-Za-z0-9&.' -]{2,40})/);
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (/email|e-mail/.test(field)) out[field] = email;
    else if (/amount|total|price|cost/.test(field)) out[field] = amount;
    else if (/invoice|inv_?number|reference/.test(field)) out[field] = invoice;
    else if (/date|due/.test(field)) out[field] = date;
    else if (/name/.test(field) && !/company|vendor/.test(field)) out[field] = nameMatch?.[1] ?? "";
    else if (/company|vendor|organization/.test(field)) out[field] = companyMatch?.[1]?.trim() ?? "";
    else if (/message|body|summary|intent|note/.test(field)) out[field] = clampText(text, 300);
    else if (/phone/.test(field)) out[field] = text.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0]?.trim() ?? "";
    else out[field] = "";
  }
  return out;
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ---------------------------- Workflow generation ---------------------------- */

const ALLOWED_TYPES = new Set(NODE_DEFINITIONS.map((n) => n.type));

interface RawPlan {
  name?: unknown;
  description?: unknown;
  explanation?: unknown;
  trigger?: { id?: unknown; type?: unknown; config?: unknown };
  nodes?: unknown;
  edges?: unknown;
  missingConfiguration?: unknown;
}

function nodeCatalogForPrompt() {
  return NODE_DEFINITIONS.map((def) => ({
    type: def.type,
    kind: def.kind,
    title: def.title,
    provider: def.provider ?? null,
    demoOnly: Boolean(def.demoOnly),
    fields: def.fields.map((f) => ({
      key: f.key,
      type: f.type,
      required: Boolean(f.required),
      ...(f.options ? { options: f.options.map((o) => o.value) } : {}),
    })),
    outputs: def.outputs.map((o) => o.key),
  }));
}

function buildDefinition(raw: RawPlan): { definition: WorkflowDefinition; warnings: string[] } {
  const warnings: string[] = [];
  const rawNodes: Array<{ id: string; type: string; config: Record<string, unknown>; title?: string }> = [];

  if (raw.trigger && typeof raw.trigger === "object") {
    const trigger = raw.trigger as { id?: unknown; type?: unknown; config?: unknown };
    if (typeof trigger.type === "string") {
      rawNodes.push({
        id: typeof trigger.id === "string" ? trigger.id : "trigger",
        type: trigger.type,
        config: trigger.config && typeof trigger.config === "object" ? (trigger.config as Record<string, unknown>) : {},
      });
    }
  }
  if (Array.isArray(raw.nodes)) {
    for (const item of raw.nodes.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const n = item as Record<string, unknown>;
      if (typeof n.type !== "string") continue;
      rawNodes.push({
        id: typeof n.id === "string" ? n.id : `step_${rawNodes.length + 1}`,
        type: n.type,
        config: n.config && typeof n.config === "object" ? (n.config as Record<string, unknown>) : {},
        title: typeof n.title === "string" ? n.title.slice(0, 80) : undefined,
      });
    }
  }

  const supported = rawNodes.filter((n) => ALLOWED_TYPES.has(n.type));
  const rejected = rawNodes.filter((n) => !ALLOWED_TYPES.has(n.type));
  if (rejected.length) {
    warnings.push(`Ignored ${rejected.length} unsupported step(s) proposed by the planner.`);
  }
  if (supported.length === 0) {
    throw new AppError("ai_plan_invalid", "The AI did not propose any supported workflow steps. Try describing the task differently.", {
      status: 422,
    });
  }

  // Ensure exactly one trigger and place it first.
  const triggers = supported.filter((n) => NODE_DEFINITIONS.find((d) => d.type === n.type)?.kind === "trigger");
  if (triggers.length === 0) {
    throw new AppError("ai_plan_missing_trigger", "The AI plan is missing a trigger. Add one manually or rephrase the request.", {
      status: 422,
    });
  }
  const trigger = triggers[0];
  if (triggers.length > 1) warnings.push("The planner proposed more than one trigger; only the first was kept.");

  const ordered = [trigger, ...supported.filter((n) => n !== trigger)];

  // Map ids to safe unique ids.
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  const nodes: WorkflowNode[] = ordered.map((node, index) => {
    const base = node.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || `step_${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}_${suffix++}`;
    used.add(id);
    idMap.set(node.id, id);
    return {
      id,
      type: node.type,
      ...(node.title ? { title: node.title } : {}),
      config: sanitizeNodeConfig(node.type, node.config),
      position: { x: 0, y: 0 },
    };
  });

  // This release executes linear workflows only. Build a clean linear chain in
  // the planner's node order, ignoring invalid/branching AI edges.
  if (Array.isArray(raw.edges) && raw.edges.length > 0) {
    const edgeTargets = new Set(
      raw.edges
        .filter((e): e is { source: string; target: string } => Boolean(e && typeof e === "object" && typeof (e as Record<string, unknown>).source === "string" && typeof (e as Record<string, unknown>).target === "string"))
        .map((e) => e.target),
    );
    const orderedByEdges = [...nodes].sort((a, b) => {
      const aIsTarget = edgeTargets.has([...idMap.entries()].find(([, v]) => v === a.id)?.[0] ?? "");
      const bIsTarget = edgeTargets.has([...idMap.entries()].find(([, v]) => v === b.id)?.[0] ?? "");
      return Number(aIsTarget) - Number(bIsTarget);
    });
    if (orderedByEdges[0]?.id !== nodes[0].id) {
      warnings.push("The planner's connections were simplified into a single supported execution path.");
    }
  }

  const edges = nodes.slice(1).map((node, index) => ({
    id: `e_${nodes[index].id}_${node.id}`,
    source: nodes[index].id,
    target: node.id,
  }));

  const definition: WorkflowDefinition = autoLayout({ version: 1, nodes, edges });
  return { definition, warnings };
}

export async function generateWorkflowPlan(input: {
  prompt: string;
  workspaceId: string;
  userId: string;
  demoFallback?: boolean;
}): Promise<GeneratedPlan> {
  const prompt = input.prompt.trim();
  if (prompt.length < 10) {
    throw new AppError("prompt_too_short", "Describe the task in a little more detail so FlowMate can plan it.", { status: 422 });
  }
  if (prompt.length > 2000) {
    throw new AppError("prompt_too_long", "Keep the description under 2,000 characters.", { status: 422 });
  }

  const fallbackAllowed = input.demoFallback !== false && config.ai.demoFallback;
  const notes: string[] = [];

  if (isAiConfigured()) {
    const system = `You are FlowMate AI's workflow planner. Convert a plain-language automation request into a strictly structured, linear workflow.
Return ONLY valid JSON with this shape:
{
  "name": "Short workflow name",
  "description": "One sentence description",
  "explanation": "Plain-language explanation of what will happen",
  "nodes": [{"id": "snake_case_id", "type": "one.allowed.type", "title": "Step title", "config": {}}],
  "edges": [{"source": "id", "target": "id"}],
  "missingConfiguration": ["What the user must fill in"]
}
Rules:
- Use exactly ONE trigger node and at least one action node.
- Include the trigger in "nodes" and connect all nodes in a single linear chain.
- ONLY use node types from the catalog. Never invent types or write code.
- Fill config keys from the catalog. Use "{{node_id.output}}" variables for data from earlier steps.
- Leave account-specific values empty (spreadsheet IDs, recipients) and list them in missingConfiguration.
- Google Sheets new-row triggers are simulation-only; prefer manual or schedule triggers when a real run is requested.
- Do not claim anything was connected, tested, or executed.
Allowed node catalog: ${JSON.stringify(nodeCatalogForPrompt())}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = await chat(
          [
            { role: "system", content: system },
            { role: "user", content: `Automation request: ${prompt}${attempt ? "\n\nYour previous response was invalid. Return ONLY the JSON object and use only allowed node types." : ""}` },
          ],
          true,
          1800,
        );
        const parsed = parseJsonObject(content);
        if (!parsed) throw new AppError("ai_plan_invalid_json", "The AI response was not valid JSON.", { status: 422, retryable: true });
        const built = buildDefinition(parsed as RawPlan);
        const validation = validateDefinition(built.definition);
        const missing = validation.errors
          .filter((e) => ["missing_field", "integration_not_connected"].includes(e.code))
          .map((e) => e.message);
        return {
          name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 100) : "AI automation",
          description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : "",
          explanation:
            typeof parsed.explanation === "string"
              ? parsed.explanation.trim().slice(0, 1000)
              : "The AI prepared a workflow for your review.",
          definition: built.definition,
          requiredIntegrations: requiredIntegrationsForTypes(built.definition.nodes.map((n) => n.type)),
          missingConfiguration: missing,
          source: "provider",
          providerConfigured: true,
          model: config.ai.model,
          notes: [...notes, ...built.warnings],
        };
      } catch (error) {
        if (error instanceof AppError && error.code.startsWith("ai_plan") && attempt === 0) {
          notes.push("The AI returned an unusable plan; asking it once more.");
          continue;
        }
        const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown AI error";
        if (!fallbackAllowed) {
          if (error instanceof AppError) throw error;
          throw new AppError("ai_generation_failed", "The AI planner could not produce a valid workflow. Please try again.", { status: 502 });
        }
        notes.push(`AI provider call failed (${message}). Generated with FlowMate's local demo planner instead.`);
        break;
      }
    }
  } else {
    if (!fallbackAllowed) {
      throw new AppError(
        "ai_not_configured",
        "AI workflow generation is not configured. Set AI_API_KEY on the server, or enable the local demo planner with AI_DEMO_FALLBACK=true.",
        { status: 503 },
      );
    }
    notes.push("No AI provider is configured, so this plan was generated by FlowMate's deterministic local planner.");
  }

  const local = localPlan(prompt);
  return {
    ...local,
    source: "local-demo",
    providerConfigured: isAiConfigured(),
    model: null,
    notes,
  };
}

export function localPlan(prompt: string): Omit<GeneratedPlan, "source" | "providerConfigured" | "model"> {
  const p = prompt.toLowerCase();
  const notes: string[] = [];
  const wantsSheet = /(sheet|spreadsheet|google sheet|row)/.test(p);
  const wantsEmailTrigger = /(gmail|email|inbox|e-mail)/.test(p);
  const wantsSend = /(send|reply|confirmation|notify|notification|alert|email me)/.test(p);
  const wantsSchedule = /(every day|daily|every morning|morning|schedule|hourly|weekly|every week)/.test(p);
  const wantsSummarize = /(summar|digest|report|brief)/.test(p);
  const wantsExtract = /(extract|invoice|details|fields|parse)/.test(p);
  const wantsValidate = /(validat|missing|check)/.test(p);
  const wantsSupport = /(support|ticket|customer message)/.test(p);

  const nodes: WorkflowNode[] = [];
  const add = (type: string, id: string, title: string, cfg: Record<string, unknown>) => {
    nodes.push({ id, type, title, config: cfg, position: { x: 0, y: 0 } });
  };

  let name = "New automation";
  let description = prompt.slice(0, 220);
  let explanation = "";

  if (wantsValidate && wantsSheet) {
    name = "Spreadsheet data validation";
    add("google_sheets.new_row", "new_sheet_row", "New spreadsheet row", { spreadsheetId: "", sheetName: "Leads" });
    add("logic.filter", "check_required", "Check required email", {
      left: "{{new_sheet_row.row.Email}}",
      operator: "exists",
      right: "",
    });
    add("gmail.send_email", "send_alert", "Send data alert", {
      to: "",
      subject: "A spreadsheet row needs attention",
      body: "A new row is missing required data. Please review the sheet.",
    });
    explanation =
      "When a new row appears in your spreadsheet, FlowMate checks whether the Email field is filled. If it is missing, an alert email is prepared for you.";
    notes.push("Google Sheets new-row triggers are simulation-only in this release.");
  } else if (wantsSummarize && (wantsEmailTrigger || wantsSchedule)) {
    name = "Daily email summary";
    add("schedule.trigger", "daily_schedule", "Every morning", { frequency: "daily", time: "08:00", dayOfWeek: "1" });
    add("gmail.search_emails", "recent_emails", "Read recent emails", { query: "newer_than:1d", maxResults: 10 });
    add("ai.summarize", "summarize_inbox", "Summarize emails", {
      text: "{{recent_emails.combined_text}}",
      style: "bullets",
      maxLength: 800,
      outputVariable: "summary",
    });
    if (wantsSend) {
      add("gmail.send_email", "send_report", "Send summary report", {
        to: "",
        subject: "Your daily email summary",
        body: "Here is your summary:\n\n{{summarize_inbox.summary}}",
      });
    }
    explanation =
      "FlowMate runs every morning, reads recent emails matching your query, summarizes them with AI, and prepares a report email. You choose the recipient before activation.";
  } else if (wantsInvoice(p)) {
    name = "Invoice emails to Google Sheets";
    add("gmail.new_email", "gmail_trigger", "New invoice email", { query: "is:unread subject:invoice" });
    add("ai.extract", "extract_invoice", "Extract invoice fields", {
      text: "{{gmail_trigger.body}}",
      fields: "invoice_number, vendor, amount, due_date",
      outputVariable: "extracted",
    });
    if (wantsSheet) {
      add("google_sheets.add_row", "add_invoice_row", "Save invoice to sheet", {
        spreadsheetId: "",
        sheetName: "Invoices",
        mapping: [
          { column: "Invoice number", value: "{{extract_invoice.invoice_number}}" },
          { column: "Vendor", value: "{{extract_invoice.vendor}}" },
          { column: "Amount", value: "{{extract_invoice.amount}}" },
          { column: "Due date", value: "{{extract_invoice.due_date}}" },
        ],
      });
    }
    explanation =
      "When a matching invoice email arrives, FlowMate extracts the invoice number, vendor, amount and due date, then appends them to your spreadsheet. You will need to choose the spreadsheet before running live.";
  } else if (/(lead|contact|form|signup|enquir|inquir)/.test(p)) {
    name = "Lead follow-up";
    add("manual.trigger", "form_trigger", "Form submission", {});
    add("ai.extract", "extract_lead", "Extract contact details", {
      text: "{{form_trigger.input.message}}",
      fields: "name, email, company, message",
      outputVariable: "extracted",
    });
    if (wantsSheet) {
      add("google_sheets.add_row", "save_lead", "Save lead to sheet", {
        spreadsheetId: "",
        sheetName: "Leads",
        mapping: [
          { column: "Name", value: "{{extract_lead.name}}" },
          { column: "Email", value: "{{extract_lead.email}}" },
          { column: "Company", value: "{{extract_lead.company}}" },
        ],
      });
    }
    if (wantsSend || !wantsSheet) {
      add("gmail.send_email", "send_confirmation", "Send confirmation email", {
        to: "{{extract_lead.email}}",
        subject: "Thanks for reaching out, {{extract_lead.name}}",
        body: "Hi {{extract_lead.name}},\n\nThanks for contacting us. We received your message and will get back to you shortly.\n\n— The team",
      });
    }
    explanation =
      "A form submission is used as the trigger, contact details are extracted with AI, and FlowMate prepares a confirmation email (and optionally saves the lead to a sheet). Form webhooks are not implemented, so this starts from manual/sample input.";
    notes.push("Form webhook triggers are not implemented; the workflow starts with manual input.");
  } else if (wantsSupport) {
    name = "Support message summary";
    add("manual.trigger", "support_input", "Support message", {});
    add("ai.summarize", "summarize_ticket", "Summarize message", {
      text: "{{support_input.input.message}}",
      style: "bullets",
      maxLength: 500,
      outputVariable: "summary",
    });
    explanation =
      "Paste a support message as sample input, and FlowMate produces a short bullet-point summary you can review.";
  } else if (wantsExtract || wantsSummarize) {
    name = wantsExtract ? "AI text extraction" : "AI text summary";
    add("manual.trigger", "text_input", "Paste text", {});
    if (wantsExtract) {
      const fields = detectFields(p);
      add("ai.extract", "extract_fields", "Extract structured fields", {
        text: "{{text_input.input.text}}",
        fields: fields.join(", "),
        outputVariable: "extracted",
      });
      explanation = `Paste text and FlowMate extracts ${fields.join(", ")} into structured fields you can map into later steps.`;
    } else {
      add("ai.summarize", "summarize_text", "Summarize text", {
        text: "{{text_input.input.text}}",
        style: "concise",
        maxLength: 600,
        outputVariable: "summary",
      });
      explanation = "Paste text and FlowMate produces a concise summary.";
    }
  } else {
    name = "New AI automation";
    add("manual.trigger", "start", "Manual trigger", {});
    add("ai.summarize", "summarize_input", "Summarize input", {
      text: "{{start.input.text}}",
      style: "concise",
      maxLength: 600,
      outputVariable: "summary",
    });
    explanation =
      "FlowMate created a starting workflow from your description. Add or adjust steps in the editor to match exactly what you need.";
    notes.push("The request was not specific enough for a more targeted plan, so a general starting workflow was created.");
  }

  const edges = nodes.slice(1).map((node, i) => ({
    id: `e_${nodes[i].id}_${node.id}`,
    source: nodes[i].id,
    target: node.id,
  }));

  const definition = autoLayout({ version: 1, nodes, edges });
  const validation = validateDefinition(definition);
  const missingConfiguration = validation.errors
    .filter((e) => e.code === "missing_field")
    .map((e) => e.message);

  return {
    name,
    description,
    explanation,
    definition,
    requiredIntegrations: requiredIntegrationsForTypes(nodes.map((n) => n.type)),
    missingConfiguration,
    notes,
  };
}

function wantsInvoice(prompt: string): boolean {
  return /(invoice|receipt|billing)/.test(prompt);
}

function detectFields(prompt: string): string[] {
  const fields: string[] = [];
  if (/(invoice|receipt)/.test(prompt)) fields.push("invoice_number", "vendor", "amount", "due_date");
  if (/(lead|contact|form)/.test(prompt)) fields.push("name", "email", "company", "message");
  if (/(support|ticket)/.test(prompt)) fields.push("customer", "issue", "priority");
  return fields.length ? [...new Set(fields)] : ["name", "email", "company", "intent"];
}

export function recordAiGeneration(workspaceId: string, userId: string, prompt: string, source: string, success: boolean): void {
  run(
    "INSERT INTO ai_generations (id, workspace_id, user_id, prompt, source, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId("aig"),
    workspaceId,
    userId,
    prompt.slice(0, 500),
    source,
    success ? 1 : 0,
    new Date().toISOString(),
  );
}
