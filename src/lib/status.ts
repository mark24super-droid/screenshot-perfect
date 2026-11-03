export const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  needs_configuration: "Needs configuration",
  active: "Active",
  paused: "Paused",
  error: "Error",
};

export const STATUS_TONE: Record<string, string> = {
  draft: "text-muted-foreground",
  needs_configuration: "text-warning border-warning/40 bg-warning/10",
  active: "text-success border-success/40 bg-success/10",
  paused: "text-info border-info/40 bg-info/10",
  error: "text-error border-error/40 bg-error/10",
};

export const EXECUTION_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  succeeded: "Succeeded",
  partially_succeeded: "Partially succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const EXECUTION_STATUS_TONE: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-info border-info/40 bg-info/10",
  waiting: "text-warning border-warning/40 bg-warning/10",
  succeeded: "text-success border-success/40 bg-success/10",
  partially_succeeded: "text-warning border-warning/40 bg-warning/10",
  failed: "text-error border-error/40 bg-error/10",
  cancelled: "text-muted-foreground",
};

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * A retry always reruns in the same mode as the original execution: a live run
 * never silently degrades to simulation, and a simulation never escalates to
 * live. Anything unknown is treated as the safe default (simulation). The UI
 * surfaces the decision through retryLabelFor and a live-mode confirmation.
 */
export function retryModeFor(originalMode: string | null | undefined): "simulation" | "live" {
  return originalMode === "live" ? "live" : "simulation";
}

/** Honest label for a retry action — never mislabels a live retry as simulation. */
export function retryLabelFor(mode: "simulation" | "live"): string {
  return mode === "live" ? "Retry live execution" : "Retry simulation";
}
