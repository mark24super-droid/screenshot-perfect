import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runStructuredCompletion, AiUnavailableError, isAiConfigured } from "@/lib/ai.server";
import {
  NODE_TYPES,
  NODE_SPECS,
  nodeTypeSchema,
  autoLayout,
  integrationForWorkflow,
  isTriggerType,
  validateWorkflow,
  type WorkflowDefinition,
  type NodeType,
} from "@/lib/workflow-schema";
import { getPlan } from "@/lib/plans";
import { getUsageSnapshot, recordUsage } from "@/lib/usage.server";

// The plan the model returns. Config values arrive as key/value string pairs
// so the schema can be strict; they are converted to a config object here.
const planJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short human workflow name, max 80 chars" },
    description: { type: "string", description: "One-sentence description of what the workflow does" },
    trigger: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: [...NODE_TYPES] },
        config: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, value: { type: "string" } },
            required: ["key", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["id", "type", "config"],
      additionalProperties: false,
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: [...NODE_TYPES] },
          config: {
            type: "array",
            items: {
              type: "object",
              properties: { key: { type: "string" }, value: { type: "string" } },
              required: ["key", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "type", "config"],
        additionalProperties: false,
      },
    },
    chain: {
      type: "array",
      description: "Execution order as node ids, starting with the trigger id",
      items: { type: "string" },
    },
    requiredIntegrations: {
      type: "array",
      items: { type: "string", enum: ["google_mail", "google_sheets"] },
    },
    explanation: { type: "string", description: "Plain-language explanation for a non-technical user" },
    clarification: {
      type: "string",
      description: "If the request is too ambiguous to build confidently, a concise clarifying question; otherwise empty string",
    },
  },
  required: ["name", "description", "trigger", "actions", "chain", "requiredIntegrations", "explanation", "clarification"],
  additionalProperties: false,
} as const;

function configPairsToObject(pairs: { key: string; value: string }[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, value } of pairs ?? []) {
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function coerceConfigValues(type: NodeType, config: Record<string, unknown>): Record<string, unknown> {
  const spec = NODE_SPECS[type];
  const out: Record<string, unknown> = { ...config };
  for (const field of spec.fields ?? []) {
    const v = out[field.key];
    if (v === undefined) continue;
    if (field.type === "number" && typeof v === "string") {
      const n = Number(v);
      if (!Number.isNaN(n)) out[field.key] = n;
    }
    if (field.type === "fields" && typeof v === "string") {
      out[field.key] = v.split(/[,\n]/).map((f) => f.trim()).filter(Boolean);
    }
    if (field.type === "mapping" && typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out[field.key] = parsed;
      } catch {
        // leave the string; validation surfaces the missing mapping
      }
    }
    if ((field.type === "text" || field.type === "textarea") && typeof v !== "string") {
      out[field.key] = String(v);
    }
  }
  return out;
}

export interface GeneratedPlan {
  name: string;
  description: string;
  definition: WorkflowDefinition;
  requiredIntegrations: ("google_mail" | "google_sheets")[];
  missingConfiguration: string[];
  explanation: string;
  clarification: string | null;
  /** True when the plan came from the deterministic fallback, not an LLM. */
  demoMode: boolean;
}

interface DraftNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
}

function finishPlan(input: {
  name: string;
  description: string;
  nodes: DraftNode[];
  explanation: string;
  clarification?: string | null;
  demoMode: boolean;
}): GeneratedPlan {
  const edges = input.nodes.slice(0, -1).map((node, i) => ({
    id: `edge_${i + 1}`,
    source: node.id,
    target: input.nodes[i + 1]!.id,
  }));
  const definition = autoLayout({
    nodes: input.nodes.map((n) => ({ ...n, position: undefined })),
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  const missingConfiguration: string[] = [];
  for (const node of definition.nodes as DraftNode[]) {
    for (const field of NODE_SPECS[node.type].requiredFields ?? []) {
      const v = node.config[field.key];
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        missingConfiguration.push(`${NODE_SPECS[node.type].label} needs a ${field.label.toLowerCase()}`);
      }
    }
    if (node.type === "ai.extract") {
      const fields = node.config["fields"];
      if (!Array.isArray(fields) || fields.length === 0) missingConfiguration.push("AI Extract needs fields to extract");
    }
  }
  // Validation is the source of truth for anything the AI may have mangled.
  for (const issue of validateWorkflow(definition)) {
    if (issue.level === "error" && !missingConfiguration.includes(issue.message)) {
      missingConfiguration.push(issue.message);
    }
  }

  return {
    name: input.name.slice(0, 80),
    description: input.description.slice(0, 300),
    definition,
    requiredIntegrations: integrationForWorkflow(definition),
    missingConfiguration,
    explanation: input.explanation,
    clarification: input.clarification ?? null,
    demoMode: input.demoMode,
  };
}

/**
 * Deterministic fallback used when no AI provider is configured. It still
 * produces a real, schema-valid workflow graph that the user must review and
 * configure — it never claims to be AI output.
 */
export function buildDemoPlan(prompt: string): GeneratedPlan {
  const p = prompt.toLowerCase();
  const wantsEmailIn = /gmail|email|inbox|mail/.test(p);
  const wantsSheet = /sheet|spreadsheet|row|table/.test(p);
  const wantsSummary = /summar|report|digest|overview/.test(p);
  const wantsNotify = /notify|notification|alert|send|confirmation|reply/.test(p);
  const invoice = /invoice|receipt|bill/.test(p);
  const lead = /lead|form|customer|contact|signup/.test(p);

  const sampleText = invoice
    ? "Invoice INV-2043 from Bright Studio. Amount due: $420.00. Payment is due by 2026-11-14. Contact: billing@brightstudio.example"
    : lead
      ? "New lead: Jane Doe, jane@example.com, company Acme Ltd. She asked about the Pro plan."
      : "New message from a customer asking about pricing and onboarding.";

  const trigger: DraftNode = wantsEmailIn && !wantsSummary
    ? {
        id: "trigger_1",
        type: "gmail.new_email",
        config: { filter: invoice ? "has:attachment" : /lead|form/.test(p) ? "newer_than:1d" : "" },
      }
    : {
        id: "trigger_1",
        type: "manual.trigger",
        config: {
          sampleInput: JSON.stringify({
            text: sampleText,
            subject: invoice ? "Invoice INV-2043 from Bright Studio" : "New request",
            from: "customer@example.com",
            body: sampleText,
          }),
        },
      };

  const nodes: DraftNode[] = [trigger];

  if (wantsSummary) {
    nodes.push({
      id: "summarize_1",
      type: "ai.summarize",
      config: {
        source: "{{trigger_1.body}}",
        style: "paragraph",
        maxLength: 120,
      },
    });
  } else {
    nodes.push({
      id: "extract_1",
      type: "ai.extract",
      config: {
        source: "{{trigger_1.body}}",
        fields: invoice ? ["invoice_number", "amount", "date"] : ["name", "email", "request"],
      },
    });
  }

  if (wantsSheet) {
    nodes.push({
      id: "sheets_1",
      type: "google_sheets.add_row",
      config: {
        spreadsheetId: "",
        worksheet: "Sheet1",
        row: invoice
          ? {
              "Invoice Number": "{{extract_1.invoice_number}}",
              Amount: "{{extract_1.amount}}",
              Date: "{{extract_1.date}}",
            }
          : {
              Name: "{{extract_1.name}}",
              Email: "{{extract_1.email}}",
              Request: "{{extract_1.request}}",
            },
      },
    });
  }

  if (wantsNotify || wantsSummary) {
    nodes.push({
      id: "email_1",
      type: "gmail.send_email",
      config: {
        to: "{{trigger_1.from}}",
        subject: wantsSummary ? "Your automated summary" : "We received your request",
        body: wantsSummary ? "{{summarize_1.summary}}" : "Thanks! We received your message and will reply shortly.",
      },
    });
  }

  const name = wantsSummary
    ? "Daily message summary"
    : invoice && wantsSheet
      ? "Invoice email to spreadsheet"
      : lead
        ? "Lead capture follow-up"
        : wantsSheet
          ? "Extract text into a spreadsheet"
          : "New automation";

  return finishPlan({
    name,
    description: prompt.slice(0, 200),
    nodes,
    explanation:
      "Demo plan. No AI provider is configured, so FlowMate built this starter workflow from keywords in your description. Review every step, fill in the missing settings, and test it in simulation mode before activating.",
    demoMode: true,
  });
}

export const generateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ prompt: z.string().trim().min(8).max(2000) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; plan: GeneratedPlan } | { ok: false; error: string; clarification?: string }> => {
    const { supabase, userId } = context as { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string; claims: unknown };

    // Workspace + usage limit.
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at")
      .limit(1)
      .single();
    if (wsError || !workspace) throw new Error("No workspace found for this account.");
    // AI is optional; usage metering is not. The limit applies to demo plans
    // and real generations alike — demo plans cost no provider tokens but are
    // still product usage, and metering both keeps counters unambiguous.
    const plan = getPlan("free");
    const usage = await getUsageSnapshot(supabase, workspace.id, plan.limits);
    if (usage.aiGenerationsThisMonth >= usage.limitAiGenerations) {
      return {
        ok: false,
        error: `You've reached your monthly limit of ${usage.limitAiGenerations} AI generations on the ${plan.name} plan. Upgrade for a higher allowance, or start from a template.`,
      };
    }
    // One generation exactly once per successful response — failed attempts
    // (provider errors, unreadable or invalid plans) are never metered, so
    // retries cannot double-count.
    if (!isAiConfigured()) {
      await recordUsage(supabase, workspace.id, "ai_generation", 1);
      return { ok: true, plan: buildDemoPlan(data.prompt) };
    }

    const nodeCatalogue = NODE_TYPES.map((t) => {
      const spec = NODE_SPECS[t];
      const configKeys = (spec.fields ?? []).map((f) => `${f.key} (${f.label})`).join(", ");
      return `- ${t} — ${spec.kind}, ${spec.short} Config keys: ${configKeys || "none"}.`;
    }).join("\n");

    const systemPrompt = `You convert a non-technical user's automation request into a structured workflow plan.

Allowed node types and their config keys:
${nodeCatalogue}

Rules:
- Pick exactly one trigger node. Use manual.trigger with a sampleInput JSON string when the request has no clear automatic trigger (e.g. daily reports, form submissions without a supported trigger).
- Actions must come from the list. Never invent node types, config keys, or executable code.
- Use variable references {{node_id.field}} to pass data between nodes. trigger outputs: for manual.trigger use fields of your sampleInput; for gmail.new_email use subject, from, body, date, snippet; for google_sheets.new_row use row.
- ai.extract output fields are the names in its fields config. ai.summarize outputs summary. Filter outputs passed/value.
- chain lists node ids in execution order, trigger first, then each action.
- requiredIntegrations lists only google_mail / google_sheets nodes actually used.
- Write explanation for someone who has never seen a workflow.
- If the request is too vague to build confidently, set clarification to one concise question and still produce your best-guess plan.`;

    const userPrompt = `Automation request: ${data.prompt}`;

    let raw: string;
    try {
      raw = await runStructuredCompletion({
        input: `${systemPrompt}\n\n${userPrompt}`,
        schemaName: "workflow_plan",
        jsonSchema: planJsonSchema as unknown as Record<string, unknown>,
        maxOutputTokens: 4000,
      });
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        // Misconfiguration is recoverable: hand the user a demo plan instead
        // of a dead end, and label it honestly.
        if ([401, 403, 404].includes(err.status)) {
          // Same metering as the configured path: this must-read demo plan
          // counts exactly once, like any other successful generation.
          const demo = buildDemoPlan(data.prompt);
          await recordUsage(supabase, workspace.id, "ai_generation", 1);
          return {
            ok: true,
            plan: { ...demo, explanation: `${err.safeMessage} ${demo.explanation}` },
          };
        }
        return { ok: false, error: err.safeMessage };
      }
      throw err;
    }

    let parsed: {
      name?: string;
      description?: string;
      trigger?: { id?: string; type?: string; config?: { key: string; value: string }[] };
      actions?: { id?: string; type?: string; config?: { key: string; value: string }[] }[];
      chain?: string[];
      requiredIntegrations?: string[];
      explanation?: string;
      clarification?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "The AI returned a response we couldn't read. Try rephrasing your request." };
    }

    // Hard server-side validation: no model output is trusted.
    const triggerType = nodeTypeSchema.safeParse(parsed.trigger?.type);
    if (!triggerType.success || !isTriggerType(triggerType.data)) {
      return { ok: false, error: "The AI proposed an unsupported trigger. Try describing the task differently." };
    }
    const cleanedNodes: DraftNode[] = [];
    const triggerId = (parsed.trigger?.id ?? "trigger_1").replace(/[^a-zA-Z0-9_]/g, "") || "trigger_1";
    cleanedNodes.push({
      id: triggerId,
      type: triggerType.data,
      config: coerceConfigValues(triggerType.data, configPairsToObject(parsed.trigger?.config)),
    });

    const seenIds = new Set([triggerId]);
    let actionIndex = 1;
    for (const action of parsed.actions ?? []) {
      const type = nodeTypeSchema.safeParse(action?.type);
      if (!type.success) continue; // silently drop unsupported node types
      if (isTriggerType(type.data)) continue; // exactly one trigger is allowed
      let id = (action.id ?? "").replace(/[^a-zA-Z0-9_]/g, "") || `${type.data.replace(".", "_")}_${actionIndex}`;
      while (seenIds.has(id)) id = `${id}_${actionIndex}`;
      seenIds.add(id);
      cleanedNodes.push({ id, type: type.data, config: coerceConfigValues(type.data, configPairsToObject(action.config)) });
      actionIndex += 1;
    }

    if (cleanedNodes.length < 2) {
      return { ok: false, error: "The AI couldn't turn this into a multi-step workflow. Add more detail about what should happen." };
    }

    // The model may return the actions out of chain order. Reorder them to the
    // chain, keeping any unmentioned nodes after it, so edges form a real path.
    const chainIds = [triggerId, ...(parsed.chain ?? [])].filter(
      (id, i, arr) => seenIds.has(id) && arr.indexOf(id) === i,
    );
    const byId = new Map(cleanedNodes.map((n) => [n.id, n]));
    const orderedNodes: DraftNode[] = [];
    const added = new Set<string>();
    for (const id of chainIds) {
      const node = byId.get(id);
      if (node && !added.has(id)) {
        orderedNodes.push(node);
        added.add(id);
      }
    }
    for (const node of cleanedNodes) {
      if (!added.has(node.id)) {
        orderedNodes.push(node);
        added.add(node.id);
      }
    }

    const result = finishPlan({
      name: parsed.name ?? "New Automation",
      description: parsed.description ?? "",
      nodes: orderedNodes,
      explanation: parsed.explanation ?? "",
      clarification: clarificationOf(parsed),
      demoMode: false,
    });

    await recordUsage(supabase, workspace.id, "ai_generation");

    return { ok: true, plan: result };
  });

interface ParsedPlanShape {
  clarification?: string;
}

function clarificationOf(parsed: ParsedPlanShape): string | null {
  const c = parsed.clarification;
  return typeof c === "string" && c.trim().length > 0 ? c.trim().slice(0, 300) : null;
}
