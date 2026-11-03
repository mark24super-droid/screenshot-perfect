import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  NODE_CATEGORY_LABELS,
  NODE_SPECS,
  categoryNodeTypes,
  type NodeCategory,
  type NodeType,
} from "@/lib/workflow-schema";
import { NODE_ICONS, NODE_TONES } from "@/components/editor/flow-node";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORY_ORDER: NodeCategory[] = ["triggers", "email", "spreadsheets", "ai", "logic", "utilities"];

const DRAG_MIME = "application/flowmate-node";

/**
 * Persistent left-hand node palette for the editor (reference design).
 * Draws from the same NODE_SPECS source of truth as the modal NodePicker —
 * clicking an item routes through the shared editor-store `addNode`, so there
 * is exactly one node-creation implementation. Drag-drop onto the canvas is
 * enabled when the canvas wires a drop handler (`draggable`).
 */
export function NodePalette({
  onPick,
  draggable = false,
}: {
  /** Adds the node via the shared editor-store logic. */
  onPick: (type: NodeType) => void;
  /** When true, palette items carry a drag payload for canvas drop placement. */
  draggable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<NodeCategory>>(new Set());

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
          NODE_CATEGORY_LABELS[category]?.toLowerCase().includes(q) ||
          type.toLowerCase().includes(q)
        );
      }),
    })).filter((g) => g.types.length > 0);
  }, [query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <FlowMateLogo className="h-6 w-6 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight">Workflow Builder</div>
          <div className="text-[10px] text-muted-foreground">Drag or click to add steps</div>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 border-border bg-white pl-8 text-xs"
            placeholder="Search steps…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search nodes"
          />
        </div>
      </div>

      {/* Categories */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1.5">
          {grouped.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">No steps match “{query}”.</p>
          )}
          {grouped.map(({ category, types }) => {
            const isCollapsed = collapsed.has(category) && !query;
            return (
              <div key={category} className="mb-1">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {NODE_CATEGORY_LABELS[category]}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                {!isCollapsed &&
                  types.map((type) => {
                    const spec = NODE_SPECS[type];
                    const Icon = NODE_ICONS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        draggable={draggable}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_MIME, type);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => onPick(type)}
                        className="flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-accent/60 active:bg-accent"
                      >
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${NODE_TONES[type]}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium leading-tight">{spec.label}</span>
                            {type === "schedule.trigger" && (
                              <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px] text-warning">
                                On demand
                              </Badge>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {spec.short}
                          </span>
                        </span>
                        <span className="mt-1 shrink-0 text-[8px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          {spec.kind}
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Drag payload id exported so the canvas drop handler recognizes palette items. */
export const NODE_DRAG_MIME = DRAG_MIME;
