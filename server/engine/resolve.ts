import { AppError } from "../lib/errors";
import { getByPath } from "@shared/workflow";

/** Resolve every {{node.path}} reference in a config object (including mappings). */
export function resolveConfig(config: Record<string, unknown>, context: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const resolveString = (value: string): string =>
    value.replace(/\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\s*\}\}/g, (_full, nodeId: string, path: string) => {
      const found = getByPath(context[nodeId], path);
      if (found === undefined || found === null) return "";
      if (typeof found === "object") {
        try {
          return JSON.stringify(found);
        } catch {
          return "";
        }
      }
      return String(found);
    });

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return resolveString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = walk(item);
      return out;
    }
    return value;
  };
  return walk(config) as Record<string, unknown>;
}

export function requireString(config: Record<string, unknown>, key: string, label: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("missing_configuration", `${label} is required. Open the step settings and fill it in.`, { status: 400 });
  }
  return value.trim();
}

export function optionalString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

export function requireNumber(config: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const n = Number(config[key]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function validateEmailList(value: string, label: string): string {
  const emails = value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.length === 0) {
    throw new AppError("missing_recipient", `${label} is empty. Set a recipient in the step settings.`, { status: 400 });
  }
  const invalid = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (invalid) {
    throw new AppError("invalid_recipient", `“${invalid}” is not a valid email address. Check ${label.toLowerCase()}.`, { status: 400 });
  }
  return emails.join(", ");
}
