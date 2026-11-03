import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert, X } from "lucide-react";
import type { ValidationIssue, ValidationResult } from "@shared/workflow";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/utils";

export function ValidationPanel({
  open,
  onClose,
  validation,
  mode,
  onSelectNode,
}: {
  open: boolean;
  onClose: () => void;
  validation: ValidationResult;
  mode: "simulation" | "live";
  onSelectNode: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-white shadow-[0_-8px_24px_rgba(32,33,42,0.08)]">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3">
        <p className="text-[11px] font-semibold text-ink">Validation</p>
        <Badge tone={validation.valid ? "success" : "danger"}>
          {validation.valid ? "No blocking issues" : `${validation.errors.length} ${validation.errors.length === 1 ? "error" : "errors"}`}
        </Badge>
        {validation.warnings.length > 0 ? <Badge tone="warning">{validation.warnings.length} warnings</Badge> : null}
        <span className="hidden text-[10px] text-ink-secondary sm:inline">
          Checked in {mode === "live" ? "live" : "simulation"} mode
        </span>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-ink-secondary hover:bg-app hover:text-ink" aria-label="Close validation panel">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto p-2">
        {validation.errors.length === 0 && validation.warnings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] text-emerald-800">
            <CheckCircle2 size={14} /> This workflow is valid. Test it in simulation mode before activating.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {validation.errors.length > 0 ? (
              <div>
                <p className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-danger">Blocking errors</p>
                <div className="space-y-1">
                  {validation.errors.map((issue, index) => (
                    <IssueRow key={`${issue.code}-${index}`} issue={issue} tone="danger" onSelect={onSelectNode} />
                  ))}
                </div>
              </div>
            ) : null}
            {validation.warnings.length > 0 ? (
              <div>
                <p className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-warning">Warnings</p>
                <div className="space-y-1">
                  {validation.warnings.map((issue, index) => (
                    <IssueRow key={`${issue.code}-${index}`} issue={issue} tone="warning" onSelect={onSelectNode} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function IssueRow({ issue, tone, onSelect }: { issue: ValidationIssue; tone: "danger" | "warning"; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => issue.nodeId && onSelect(issue.nodeId)}
      disabled={!issue.nodeId}
      className={cn(
        "flex w-full items-start gap-1.5 rounded-md border px-2 py-1.5 text-left text-[10.5px] leading-relaxed transition-colors disabled:cursor-default",
        tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100" : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
      )}
    >
      {tone === "danger" ? <CircleAlert size={11} className="mt-0.5 shrink-0" /> : <AlertTriangle size={11} className="mt-0.5 shrink-0" />}
      <span className="flex-1">{issue.message}</span>
      {issue.nodeId ? <ChevronDown size={11} className="mt-0.5 shrink-0 -rotate-90" /> : null}
    </button>
  );
}
