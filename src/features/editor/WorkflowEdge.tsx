import * as React from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

export interface EditorEdgeData extends Record<string, unknown> {
  label?: string;
  onInsert: (source: string, target: string) => void;
  onDelete: (id: string) => void;
}

export type EditorFlowEdge = Edge<EditorEdgeData, "fm">;

export function WorkflowEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<EditorFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.32,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={selected ? "selected" : undefined} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center gap-1 rounded-full border border-line bg-white px-1 py-0.5 shadow-sm"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          {data?.label ? <span className="pl-1 text-[8.5px] font-medium text-ink-secondary">{data.label}</span> : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data?.onInsert(source, target);
            }}
            className="flex h-4 w-4 items-center justify-center rounded-full text-ink-secondary hover:bg-primary-soft hover:text-primary"
            aria-label="Insert a step on this connection"
            title="Insert a step here"
          >
            <Plus size={10} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete(id);
            }}
            className="flex h-4 w-4 items-center justify-center rounded-full text-ink-secondary hover:bg-rose-50 hover:text-danger"
            aria-label="Delete this connection"
            title="Delete connection"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
