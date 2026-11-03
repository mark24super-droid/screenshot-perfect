import * as React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleAlert, Plus, Trash2 } from "lucide-react";
import type { ValidationIssue, WorkflowNode } from "@shared/workflow";
import { getNodeDefinition, isTriggerType, nodeSummary, type ProviderId } from "@shared/nodes";
import { NodeIcon } from "../../lib/icons";
import { cn, providerLabel } from "../../lib/utils";

export interface EditorNodeData extends Record<string, unknown> {
  node: WorkflowNode;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  hasOutgoing: boolean;
  onAddAfter: (id: string) => void;
  onDelete: (id: string) => void;
}

export type EditorFlowNode = Node<EditorNodeData, "fm">;

export const WorkflowNodeCard = React.memo(function WorkflowNodeCard({ data, selected }: NodeProps<EditorFlowNode>) {
  const { node, errors, warnings, hasOutgoing, onAddAfter, onDelete } = data;
  const definition = getNodeDefinition(node.type);
  const isTrigger = isTriggerType(node.type);
  const provider = definition?.provider as ProviderId | undefined;
  const hasError = errors.length > 0;
  const hasWarning = warnings.length > 0 && !hasError;

  return (
    <div
      className={cn(
        "group relative w-[236px] rounded-xl border bg-white shadow-card transition-shadow",
        selected ? "border-primary ring-2 ring-primary/20" : hasError ? "border-danger/50" : hasWarning ? "border-warning/60" : "border-line",
      )}
    >
      {!isTrigger ? <Handle type="target" position={Position.Left} className="!bg-[#b7b3f5]" aria-label="Incoming connection" /> : null}
      <Handle type="source" position={Position.Right} className="!bg-[#b7b3f5]" aria-label="Outgoing connection" />

      <div className="flex items-start gap-2.5 p-3">
        <NodeIcon type={node.type} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-ink">{node.title || definition?.title || node.type}</p>
          <p className="mt-0.5 truncate text-[10px] text-ink-secondary">
            {definition?.title ?? node.type}
            {provider ? ` · ${providerLabel(provider)}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",
            isTrigger ? "bg-primary-soft text-primary" : "bg-app text-ink-secondary",
          )}
        >
          {isTrigger ? "Trigger" : "Action"}
        </span>
      </div>

      <div className="mx-3 rounded-lg bg-app/70 px-2 py-1.5">
        <p className="line-clamp-2 text-[10px] leading-relaxed text-ink-secondary">{nodeSummary(node.type, node.config ?? {})}</p>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2">
        {hasError ? (
          <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-danger">
            <CircleAlert size={10} /> {errors.length} {errors.length === 1 ? "issue" : "issues"}
          </span>
        ) : hasWarning ? (
          <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-warning">
            <AlertTriangle size={10} /> {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9.5px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Configured
          </span>
        )}
        <span className="ml-auto font-mono text-[8.5px] text-ink-secondary/70">{node.id}</span>
        <button
          type="button"
          className="nodrag nopan rounded p-1 text-ink-secondary opacity-0 transition-opacity hover:bg-rose-50 hover:text-danger focus:opacity-100 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(node.id);
          }}
          aria-label={`Delete ${node.title || definition?.title || node.type}`}
          title="Delete step"
        >
          <Trash2 size={11} />
        </button>
        <button
          type="button"
          className="nodrag nopan flex h-5 w-5 items-center justify-center rounded border border-line bg-white text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
          onClick={(event) => {
            event.stopPropagation();
            onAddAfter(node.id);
          }}
          aria-label={hasOutgoing ? "Insert a step after this one" : "Add a step after this one"}
          title={hasOutgoing ? "Insert step after this one" : "Add step after this one"}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
});
