import {
  Braces,
  Clock,
  Filter,
  Inbox,
  Mail,
  Play,
  PlusSquare,
  Search,
  Send,
  Sparkles,
  Table2,
  Timer,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { getNodeDefinition } from "@shared/nodes";
import { cn } from "./utils";

const ICONS: Record<string, LucideIcon> = {
  Play,
  Clock,
  Mail,
  Send,
  Inbox,
  Table2,
  PlusSquare,
  Search,
  Sparkles,
  Braces,
  Filter,
  Timer,
  Workflow,
};

export function iconForName(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Workflow;
}

const TONE: Record<string, string> = {
  "manual.trigger": "bg-primary-soft text-primary",
  "schedule.trigger": "bg-blue-50 text-info",
  "gmail.new_email": "bg-rose-50 text-rose-600",
  "gmail.search_emails": "bg-rose-50 text-rose-600",
  "gmail.send_email": "bg-rose-50 text-rose-600",
  "google_sheets.new_row": "bg-emerald-50 text-success",
  "google_sheets.add_row": "bg-emerald-50 text-success",
  "google_sheets.find_row": "bg-emerald-50 text-success",
  "ai.summarize": "bg-violet-50 text-primary",
  "ai.extract": "bg-violet-50 text-primary",
  "logic.filter": "bg-amber-50 text-warning",
  "utility.delay": "bg-slate-100 text-ink-secondary",
};

export function NodeIcon({
  type,
  className,
  size = "md",
}: {
  type: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const def = getNodeDefinition(type);
  const Icon = iconForName(def?.icon);
  const dimensions = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const iconSize = size === "sm" ? 14 : size === "lg" ? 21 : 17;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-black/[0.03]",
        dimensions,
        TONE[type] ?? "bg-app text-ink-secondary",
        className,
      )}
      aria-hidden="true"
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  );
}

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  if (provider === "gmail") {
    return (
      <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600", className)} aria-hidden="true">
        <Mail size={18} />
      </span>
    );
  }
  if (provider === "google_sheets") {
    return (
      <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-success", className)} aria-hidden="true">
        <Table2 size={18} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-primary", className)} aria-hidden="true">
      <Sparkles size={18} />
    </span>
  );
}
