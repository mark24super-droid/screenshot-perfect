import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runStructuredCompletion, AiUnavailableError } from "@/lib/ai.server";
import { NODE_TYPES, NODE_SPECS, nodeTypeSchema, autoLayout, type WorkflowDefinition, type NodeType } from "@/lib/workflow-schema";
import { getPlan } from "@/lib/plans";
import { getUsageSnapshot, recordUsage } from "@/lib/usage.server";

const MODEL = "openai/gpt-6-astra";

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
    const plan = getPlan("free");
    const usage = await getUsageSnapshot(supabase, workspace.id, plan.limits);
    if (usage.aiGenerationsThisMonth >= usage.limitAiGenerations) {
      return {
        ok: false,
        error: `You've reached your monthly limit of ${usage.limitAiGenerations} AI generations on the ${plan.name} plan. Upgrade for a higher allowance, or start from a template.`,
      };
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
        model: MODEL,
        input: `${systemPrompt}\n\n${userPrompt}`,
        schemaName: "workflow_plan",
        jsonSchema: planJsonSchema as unknown as Record<string, unknown>,
        maxOutputTokens: 4000,
      });
    } catch (err) {
      if (err instanceof AiUnavailableError) return { ok: false, error: err.safeMessage };
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
    if (!triggerType.success) {
      return { ok: false, error: "The AI proposed an unsupported trigger. Try describing the task differently." };
    }
    const cleanedNodes: { id: string; type: NodeType; config: Record<string, unknown> }[] = [];
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
      let id = (action.id ?? "").replace(/[^a-zA-Z0-9_]/g, "") || `${type.data.replace(".", "_")}_${actionIndex}`;
      while (seenIds.has(id)) id = `${id}_${actionIndex}`;
      seenIds.add(id);
      cleanedNodes.push({ id, type: type.data, config: coerceConfigValues(type.data, configPairsToObject(action.config)) });
      actionIndex += 1;
    }

    if (cleanedNodes.length < 2) {
      return { ok: false, error: "The AI couldn't turn this into a multi-step workflow. Add more detail about what should happen." };
    }

    // Edges follow the returned chain, filtered to real ids, trigger first.
    const chainIds = [triggerId, ...(parsed.chain ?? [])].filter(
      (id, i, arr) => seenIds.has(id) && arr.indexOf(id) === i,
    );
    const ordered = [...chainIds, ...seenIds].filter(
      (id, i, arr) => arr.indexOf(id) === i,
    );
    const edges = [] as { id: string; source: string; target: string }[];
    for (let i = 0; i < ordered.length - 1; i++) {
      edges.push({ id: `edge_${i + 1}`, source: ordered[i], target: ordered[i + 1] });
    }

    const missingConfiguration: string[] = [];
    for (const node of cleanedNodes) {
      for (const field of NODE_SPECS[node.type].requiredFields ?? []) {
        const v = node.config[field.key];
        if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
          missingConfiguration.push(`${NODE_SPECS[node.type].label} needs a ${field.label.toLowerCase()}`);
        }
      }
      if (node.type === "ai.extract") {
        const fields = node.config.fields;
        if (!Array.isArray(fields) || fields.length === 0) missingConfiguration.push("AI Extract needs fields to extract");
      }
    }

    const definition = autoLayout({
      nodes: cleanedNodes.map((n) => ({ ...n, position: undefined })),
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    await recordUsage(supabase, workspace.id, "ai_generation");

    return {
      ok: true,
      plan: {
        name: (parsed.name ?? "New Automation").slice(0, 80),
        description: (parsed.description ?? "").slice(0, 300),
        definition,
        requiredIntegrations: (parsed.requiredIntegrations ?? []).filter(
          (i): i is "google_mail" | "google_sheets" => i === "google_mail" || i === "google_sheets",
        ),
        missingConfiguration,
        explanation: parsed.explanation ?? "",
        clarification: clarificationOf(parsed),
      },
    };
  });

interface ParsedPlanShape {
  clarification?: string;
}

function clarificationOf(parsed: ParsedPlanShape): string | null {
  const c = parsed.clarification;
  return typeof c === "string" && c.trim().length > 0 ? c.trim().slice(0, 300) : null;
}
