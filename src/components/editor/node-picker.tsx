import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  NODE_CATEGORY_LABELS,
  NODE_SPECS,
  NODE_TYPES,
  categoryNodeTypes,
  type NodeCategory,
  type NodeType,
} from "@/lib/workflow-schema";
import { NODE_ICONS, NODE_TONES } from "@/components/editor/flow-node";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORY_ORDER: NodeCategory[] = ["triggers", "email", "spreadsheets", "ai", "logic", "utilities"];

export function NodePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: NodeType) => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      types: categoryNodeTypes(category).filter((type) => {
        if (!q) return true;
        const spec = NODE_SPECS[type];
        return (
          spec.label.toLowerCase().includes(q) ||
          spec.short.toLowerCase().includes(q) ||
          type.toLowerCase().includes(q)
        );
      }),
    })).filter((g) => g.types.length > 0);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="text-base">Add a step</DialogTitle>
          <DialogDescription>Choose a trigger or action. Only implemented steps are listed.</DialogDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-9 pl-8 text-sm"
              placeholder="Search steps…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-2">
            {grouped.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No steps match “{query}”.</p>
            )}
            {grouped.map(({ category, types }) => (
              <div key={category} className="mb-2">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {NODE_CATEGORY_LABELS[category]}
                </div>
                {types.map((type) => {
                  const spec = NODE_SPECS[type];
                  const Icon = NODE_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onPick(type);
                        onOpenChange(false);
                        setQuery("");
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent/60"
                    >
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${NODE_TONES[type]}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{spec.label}</span>
                          {type === "schedule.trigger" && (
                            <Badge variant="outline" className="shrink-0 text-[9px] text-warning">
                              On demand
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{spec.short}</span>
                      </span>
                      <span className="mt-1 shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {spec.kind}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export { NODE_TYPES };
