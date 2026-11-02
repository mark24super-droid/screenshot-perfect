import { memo, type ComponentType } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Clock,
  Copy,
  FileSpreadsheet,
  GitBranch,
  Mail,
  MousePointerClick,
  MoreHorizontal,
  Search,
  Send,
  Sparkles,
  Table2,
  Wand2,
  AlertTriangle,
  Check,
} from "lucide-react";
import { NODE_SPECS, type NodeType } from "@/lib/workflow-schema";
import { nodeIsConfigured, useEditorStore, type FlowNode } from "@/components/editor/editor-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const NODE_ICONS: Record<NodeType, ComponentType<{ className?: string }>> = {
  "manual.trigger": MousePointerClick,
  "schedule.trigger": Clock,
  "gmail.new_email": Mail,
  "gmail.send_email": Send,
  "google_sheets.new_row": FileSpreadsheet,
  "google_sheets.add_row": Table2,
  "google_sheets.find_row": Search,
  "ai.summarize": Sparkles,
  "ai.extract": Wand2,
  "logic.filter": GitBranch,
};

export const NODE_TONES: Record<NodeType, string> = {
  "manual.trigger": "bg-accent text-primary",
  "schedule.trigger": "bg-accent text-primary",
  "gmail.new_email": "bg-info/10 text-info",
  "gmail.send_email": "bg-info/10 text-info",
  "google_sheets.new_row": "bg-success/10 text-success",
  "google_sheets.add_row": "bg-success/10 text-success",
  "google_sheets.find_row": "bg-success/10 text-success",
  "ai.summarize": "bg-primary/10 text-primary",
  "ai.extract": "bg-primary/10 text-primary",
  "logic.filter": "bg-warning/10 text-warning",
};

function FlowNodeCard({ id, data, selected }: NodeProps<FlowNode>) {
  const spec = NODE_SPECS[data.nodeType];
  if (!spec) return null;
  const Icon = NODE_ICONS[data.nodeType] ?? Sparkles;
  const configured = nodeIsConfigured({ id, type: "flowmate", position: { x: 0, y: 0 }, data });
  const isTrigger = spec.kind === "trigger";
  const duplicateNode = useEditorStore((s) => s.duplicateNode);

  return (
    <div
      className={`group w-[248px] rounded-xl border bg-card shadow-sm transition-all ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
      }`}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary"
        />
      )}
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${NODE_TONES[data.nodeType]}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">{spec.label}</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {isTrigger ? "Trigger" : "Action"}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={`Actions for ${spec.label}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => duplicateNode(id)}>
                <Copy className="h-3.5 w-3.5" /> Duplicate node
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">{spec.short}</p>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
          {configured ? (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/10 text-success">
                <Check className="h-2.5 w-2.5" />
              </span>
              <span className="text-success">Ready</span>
            </>
          ) : (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warning/10 text-warning">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
              <span className="text-warning">Needs setup</span>
            </>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}

export const FlowNodeCardMemo = memo(FlowNodeCard);
