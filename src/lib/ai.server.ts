// Server-only helper for Lovable AI Gateway Responses calls.
// Streams every call (SSE) and returns collected text — never buffers.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly safeMessage: string,
  ) {
    super(message);
  }
}

interface ResponsesRequest {
  model: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}

function requireKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiUnavailableError("missing key", 401, "AI is not configured for this workspace yet.");
  return key;
}

/**
 * One structured Responses call. Streams the SSE response and returns the
 * model's final text. Gateway errors surface as AiUnavailableError with a
 * user-safe message (safeMessage) — never retry in a loop.
 */
export async function runStructuredCompletion(req: ResponsesRequest): Promise<string> {
  const key = requireKey();
  const body = {
    model: req.model,
    stream: true,
    store: false,
    include: ["reasoning.encrypted_content"],
    reasoning: { effort: "low", summary: "auto" },
    max_output_tokens: req.maxOutputTokens ?? 4000,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: req.input }],
      },
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

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let safeMessage = "The AI service could not complete this request.";
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } };
      const msg = parsed.message ?? parsed.error?.message;
      if (res.status === 402 && msg) safeMessage = msg;
      if (res.status === 429) safeMessage = "The AI service is busy right now. Try again in a moment.";
    } catch {
      // keep default message
    }
    console.error(`AI gateway error [${res.status}]: ${text.slice(0, 500)}`);
    throw new AiUnavailableError(`gateway ${res.status}`, res.status, safeMessage);
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
