import * as React from "react";
import { cn } from "../../lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "purple" | "outline";

const TONES: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  warning: "bg-amber-50 text-amber-700 border-amber-200/70",
  danger: "bg-rose-50 text-rose-700 border-rose-200/70",
  info: "bg-blue-50 text-blue-700 border-blue-200/70",
  neutral: "bg-slate-100 text-slate-600 border-slate-200/70",
  purple: "bg-primary-soft text-primary border-primary/15",
  outline: "bg-transparent text-ink-secondary border-line",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const map: Record<string, { tone: Tone; text: string }> = {
    active: { tone: "success", text: "Active" },
    draft: { tone: "neutral", text: "Draft" },
    needs_configuration: { tone: "warning", text: "Needs configuration" },
    paused: { tone: "neutral", text: "Paused" },
    error: { tone: "danger", text: "Error" },
    queued: { tone: "info", text: "Queued" },
    running: { tone: "info", text: "Running" },
    waiting: { tone: "warning", text: "Waiting" },
    succeeded: { tone: "success", text: "Succeeded" },
    partially_succeeded: { tone: "warning", text: "Partly succeeded" },
    failed: { tone: "danger", text: "Failed" },
    cancelled: { tone: "neutral", text: "Cancelled" },
    skipped: { tone: "neutral", text: "Skipped" },
    connected: { tone: "success", text: "Connected" },
    demo: { tone: "info", text: "Demo connection" },
    disconnected: { tone: "neutral", text: "Not connected" },
    setup_required: { tone: "warning", text: "Setup required" },
  };
  const meta = map[status] ?? { tone: "neutral" as Tone, text: status };
  return (
    <Badge tone={meta.tone} dot className={className}>
      {label ?? meta.text}
    </Badge>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>{children}</div>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} aria-hidden="true" />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} role="separator" />;
}

export function Progress({ value, tone = "primary", className }: { value: number; tone?: "primary" | "warning" | "danger" | "success"; className?: string }) {
  const colors = {
    primary: "bg-primary",
    warning: "bg-warning",
    danger: "bg-danger",
    success: "bg-success",
  };
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", colors[tone])} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      role="status"
      aria-label="Loading"
    />
  );
}
