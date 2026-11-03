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
