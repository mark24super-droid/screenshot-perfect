import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function shortId(id: string, length = 10): string {
  if (!id) return "—";
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncate(value: string, length = 80): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
}

export function safeJson(value: unknown, maxLength = 4000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text) return "null";
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n… truncated` : text;
  } catch {
    return String(value);
  }
}

export function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  return Promise.reject(new Error("Clipboard is not available"));
}

export const STATUS_META: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "purple" }> = {
  draft: { label: "Draft", tone: "neutral" },
  needs_configuration: { label: "Needs configuration", tone: "warning" },
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  waiting: { label: "Waiting", tone: "warning" },
  succeeded: { label: "Succeeded", tone: "success" },
  partially_succeeded: { label: "Partly succeeded", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  skipped: { label: "Skipped", tone: "neutral" },
  connected: { label: "Connected", tone: "success" },
  demo: { label: "Demo connection", tone: "info" },
  disconnected: { label: "Not connected", tone: "neutral" },
  setup_required: { label: "Setup required", tone: "warning" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: titleCase(status), tone: "neutral" as const };
}

export function providerLabel(provider: string): string {
  if (provider === "gmail") return "Gmail";
  if (provider === "google_sheets") return "Google Sheets";
  if (provider === "ai") return "AI";
  return provider;
}
