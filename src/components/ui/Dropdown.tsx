import * as React from "react";
import { cn } from "../../lib/utils";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  align = "end",
  width = "w-48",
  label = "Open menu",
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  width?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 animate-fade-in rounded-lg border border-line bg-white p-1 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            width,
          )}
        >
          {items.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
              {item.separatorBefore ? <div className="my-1 h-px bg-line" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  item.danger ? "text-danger hover:bg-rose-50" : "text-ink hover:bg-app",
                )}
              >
                {item.icon ? <span className="text-ink-secondary [.text-danger_&]:text-danger">{item.icon}</span> : null}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
