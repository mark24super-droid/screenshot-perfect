import * as React from "react";
import { cn, initials } from "../../lib/utils";
import { Button } from "./Button";

export function Avatar({
  name,
  color = "#635BEB",
  size = "md",
  className,
}: {
  name: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-14 w-14 text-lg",
  };
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", sizes[size], className)}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-ink-secondary">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-rose-200 bg-rose-50/60 p-5", className)} role="alert">
      <h3 className="text-sm font-semibold text-rose-800">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-rose-700">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1 rounded-lg border border-line bg-white p-1", className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            value === item.value ? "bg-primary-soft text-primary" : "text-ink-secondary hover:bg-app hover:text-ink",
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className="ml-1.5 text-[10px] opacity-70">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
