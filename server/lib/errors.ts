export class AppError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  details?: unknown;

  constructor(code: string, message: string, options: { status?: number; retryable?: boolean; details?: unknown } = {}) {
    super(message);
    this.code = code;
    this.status = options.status ?? 400;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

const SECRET_KEY_RE = /(password|secret|token|authorization|apikey|api_key|credential|refresh)/i;

/** Bounded, redacted copy of execution data for persistence and display. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value.length > 1200 ? `${value.slice(0, 1200)}… [truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (count >= 25) break;
      if (SECRET_KEY_RE.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeForLog(item, depth + 1);
      }
      count++;
    }
    return out;
  }
  return String(value);
}

export function userMessageForError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof Error) {
    return { code: "execution_error", message: "This step failed unexpectedly. Check the configuration and try again.", retryable: false };
  }
  return { code: "execution_error", message: "This step failed unexpectedly.", retryable: false };
}
