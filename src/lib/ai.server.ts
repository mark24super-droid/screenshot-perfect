// Server-only AI client.
//
// Two providers are supported, in priority order:
//   1. Any OpenAI-compatible chat-completions endpoint configured with
//      AI_API_KEY + AI_BASE_URL (+ AI_MODEL).
//   2. The Lovable AI Gateway Responses API (LOVABLE_API_KEY) used by the
//      hosted environment.
//
// Nothing here runs in the browser and no key is ever shipped to the client.

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const LOVABLE_DEFAULT_MODEL = "openai/gpt-6-astra";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly safeMessage: string,
  ) {
    super(message);
  }
}

export interface StructuredCompletionRequest {
  /** Overrides the configured model when provided. */
  model?: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  system?: string;
}

type Provider =
  | { kind: "openai"; baseUrl: string; apiKey: string; model: string }
  | { kind: "lovable"; apiKey: string; model: string };

export function resolveAiProvider(): Provider | null {
  const apiKey = process.env["AI_API_KEY"];
  const baseUrl = process.env["AI_BASE_URL"];
  if (apiKey && baseUrl) {
    return {
      kind: "openai",
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      model: process.env["AI_MODEL"] || OPENAI_DEFAULT_MODEL,
    };
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    return {
      kind: "lovable",
      apiKey: lovableKey,
      model: process.env["AI_MODEL"] || LOVABLE_DEFAULT_MODEL,
    };
  }
  return null;
}

export function isAiConfigured(): boolean {
  return resolveAiProvider() !== null;
}

function requireProvider(): Provider {
  const provider = resolveAiProvider();
  if (!provider) {
    throw new AiUnavailableError(
      "no provider",
      401,
      "AI is not configured yet. Simulation mode uses deterministic sample results instead.",
    );
  }
  return provider;
}

function unavailableMessage(status: number, text: string): string {
  let safeMessage = "The AI service could not complete this request.";
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } };
    const msg = parsed.message ?? parsed.error?.message;
    if (status === 402 && msg) safeMessage = msg;
    if (status === 429) safeMessage = "The AI service is busy right now. Try again in a moment.";
    if (status === 401 || status === 403) safeMessage = "The configured AI provider rejected this request. Check AI_API_KEY.";
  } catch {
    // keep default message
  }
  return safeMessage;
}

/** Extract plain text from an OpenAI-compatible message content value. */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

async function callOpenAiCompatible(
  provider: Extract<Provider, { kind: "openai" }>,
  req: StructuredCompletionRequest,
): Promise<string> {
  const body = {
    model: req.model ?? provider.model,
    temperature: 0,
    max_tokens: req.maxOutputTokens ?? 4000,
    messages: [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      { role: "user", content: req.input },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
    },
  };

  const send = (payload: unknown) =>
    fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  let res = await send(body);
  // Some compatible providers do not implement json_schema. Fall back to
  // json_object once, with the schema described in the prompt.
  if (res.status === 400 || res.status === 422) {
    const detail = await res.clone().text().catch(() => "");
    if (/response_format|json_schema|schema/i.test(detail)) {
      res = await send({
        ...body,
        response_format: { type: "json_object" },
        messages: [
          ...(req.system ? [{ role: "system", content: req.system }] : []),
          {
            role: "user",
            content: `${req.input}\n\nReturn only JSON matching this JSON Schema:\n${JSON.stringify(req.jsonSchema)}`,
          },
        ],
      });
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`AI provider error [${res.status}]: ${text.slice(0, 500)}`);
    throw new AiUnavailableError(`provider ${res.status}`, res.status, unavailableMessage(res.status, text));
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown }; text?: string }[];
  };
  const text = contentToText(data.choices?.[0]?.message?.content) || data.choices?.[0]?.text || "";
  if (!text.trim()) {
    throw new AiUnavailableError("no output", 500, "The AI service returned no answer. Try rephrasing your request.");
  }
  return text;
}

async function callLovable(
  provider: Extract<Provider, { kind: "lovable" }>,
  req: StructuredCompletionRequest,
): Promise<string> {
  const body = {
    model: req.model ?? provider.model,
    stream: true,
    store: false,
    include: ["reasoning.encrypted_content"],
    reasoning: { effort: "low", summary: "auto" },
    max_output_tokens: req.maxOutputTokens ?? 4000,
    input: [
      ...(req.system ? [{ role: "system", content: [{ type: "input_text", text: req.system }] }] : []),
      { role: "user", content: [{ type: "input_text", text: req.input }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: req.schemaName,
        strict: true,
        schema: req.jsonSchema,
      },
    },
  };

  const res = await fetch(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`AI gateway error [${res.status}]: ${text.slice(0, 500)}`);
    throw new AiUnavailableError(`gateway ${res.status}`, res.status, unavailableMessage(res.status, text));
  }
  if (!res.body) throw new AiUnavailableError("empty body", 500, "The AI service returned an empty response.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          outputText += event.delta;
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  if (!outputText.trim()) {
    throw new AiUnavailableError("no output", 500, "The AI service returned no answer. Try rephrasing your request.");
  }
  return outputText;
}

/**
 * One structured completion. Returns the model's final text, which callers
 * must still validate against their Zod schema before using.
 */
export async function runStructuredCompletion(req: StructuredCompletionRequest): Promise<string> {
  const provider = requireProvider();
  if (provider.kind === "openai") return callOpenAiCompatible(provider, req);
  return callLovable(provider, req);
}
