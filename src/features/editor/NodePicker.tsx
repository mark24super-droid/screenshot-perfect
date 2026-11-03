import * as React from "react";
import { Search, Sparkles } from "lucide-react";
import { CATEGORY_LABELS, NODE_DEFINITIONS, type NodeCategory } from "@shared/nodes";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { NodeIcon } from "../../lib/icons";
import { cn } from "../../lib/utils";

const ORDER: NodeCategory[] = ["trigger", "ai", "email", "spreadsheet", "logic", "utility"];

export function NodePicker({
  open,
  onClose,
  mode,
  hasTrigger,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  mode: "simulation" | "live";
  hasTrigger: boolean;
  onSelect: (type: string) => void;
}) {
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const query = search.trim().toLowerCase();
  const filtered = NODE_DEFINITIONS.filter((definition) => {
    if (!query) return true;
    return (
      definition.title.toLowerCase().includes(query) ||
      definition.description.toLowerCase().includes(query) ||
      CATEGORY_LABELS[definition.category].toLowerCase().includes(query)
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a step"
      description="Only allowlisted steps can be added. AI generation uses the same list."
      size="lg"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search steps…" className="pl-8" aria-label="Search steps" autoFocus />
        </div>

        {mode === "live" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            Live mode is selected. Simulation-only steps are disabled. You can switch back to simulation to add them.
          </div>
        ) : null}

        <div className="space-y-4">
          {ORDER.map((category) => {
            const items = filtered.filter((definition) => definition.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category}>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">{CATEGORY_LABELS[category]}</h3>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((definition) => {
                    const triggerBlocked = definition.kind === "trigger" && hasTrigger;
                    const liveBlocked = definition.demoOnly && mode === "live";
                    const disabled = triggerBlocked || liveBlocked;
                    return (
                      <button
                        key={definition.type}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelect(definition.type)}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                          disabled ? "cursor-not-allowed border-line bg-app/40 opacity-60" : "border-line bg-white hover:border-primary/30 hover:bg-primary-soft/40",
                        )}
                        title={triggerBlocked ? "Only one trigger is supported. Remove the existing trigger first." : liveBlocked ? "Simulation-only step" : definition.description}
                      >
                        <NodeIcon type={definition.type} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11.5px] font-medium text-ink">{definition.title}</span>
                            {definition.demoOnly ? <Badge tone="warning">Simulation only</Badge> : null}
                            {definition.provider === "ai" ? <Sparkles size={10} className="text-primary" /> : null}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-secondary">{definition.description}</span>
                          {definition.availabilityNote ? (
                            <span className="mt-1 block text-[9.5px] leading-relaxed text-amber-700">{definition.availabilityNote}</span>
                          ) : null}
                          {triggerBlocked ? <span className="mt-1 block text-[9.5px] text-ink-secondary">A trigger already exists.</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {filtered.length === 0 ? <p className="py-6 text-center text-[12px] text-ink-secondary">No steps match “{search}”.</p> : null}
      </div>
    </Dialog>
  );
}
