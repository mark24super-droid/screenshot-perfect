import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, FlaskConical, Play, Radio, RotateCw } from "lucide-react";
import { Badge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox, Label, Textarea } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import { NodeIcon } from "../../lib/icons";
import { ApiError, apiGet, apiPost, errorMessage } from "../../lib/api";
import type { ExecutionDetail } from "../../lib/types";
import { formatDuration, safeJson } from "../../lib/utils";
import { useEditorStore } from "./editorStore";
import { cn } from "../../lib/utils";

const SAMPLE_INPUT = JSON.stringify(
  {
    subject: "Invoice INV-1042 from Northwind",
    from: "billing@northwind.example",
    message: "Hi, please find invoice INV-1042 for $1,250.00 due on 2026-12-01. Let me know if you need anything else.",
  },
  null,
  2,
);

export function TestDialog({
  open,
  onClose,
  onEnsureSaved,
}: {
  open: boolean;
  onClose: () => void;
  onEnsureSaved: () => Promise<boolean>;
}) {
  const workflowId = useEditorStore((state) => state.workflowId);
  const mode = useEditorStore((state) => state.mode);
  const setMode = useEditorStore((state) => state.setMode);
  const validation = useEditorStore((state) => state.validation);
  const connections = useEditorStore((state) => state.connections);
  const [inputText, setInputText] = React.useState("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [execution, setExecution] = React.useState<ExecutionDetail | null>(null);
  const [liveConfirmed, setLiveConfirmed] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setRunning(false);
      setError(null);
      setExecution(null);
      setInputError(null);
      setLiveConfirmed(false);
      setInputText("");
    } else {
      cancelledRef.current = false;
    }
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [open]);

  const poll = React.useCallback(async (executionId: string, attempt = 0) => {
    if (cancelledRef.current) return;
    try {
      const detail = await apiGet<ExecutionDetail>(`/executions/${executionId}`);
      if (cancelledRef.current) return;
      setExecution(detail);
      if (["queued", "running", "waiting"].includes(detail.status) && attempt < 90) {
        timerRef.current = window.setTimeout(() => void poll(executionId, attempt + 1), 900);
      } else {
        setRunning(false);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setError(errorMessage(err));
      setRunning(false);
    }
  }, []);

  const run = async () => {
    if (!workflowId) return;
    setError(null);
    setInputError(null);
    let parsedInput: Record<string, unknown> | undefined;
    if (inputText.trim()) {
      try {
        const parsed = JSON.parse(inputText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Input must be a JSON object.");
        parsedInput = parsed as Record<string, unknown>;
      } catch (err) {
        setInputError(err instanceof Error ? err.message : "Enter valid JSON.");
        return;
      }
    }
    if (!validation.valid) {
      setError("Fix the blocking validation issues before testing.");
      return;
    }
    setRunning(true);
    setExecution(null);
    const saved = await onEnsureSaved();
    if (!saved) {
      setRunning(false);
      return;
    }
    try {
      const created = await apiPost<{ executionId: string }>(`/workflows/${workflowId}/test`, {
        mode,
        input: parsedInput,
      });
      void poll(created.executionId);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setError(
          `${err.message} ${(err.details as Array<{ message?: string }>)
            .map((detail) => detail.message)
            .filter(Boolean)
            .slice(0, 3)
            .join(" ")}`,
        );
      } else {
        setError(errorMessage(err));
      }
      setRunning(false);
    }
  };

  const liveBlocked = mode === "live" && (!validation.valid || !liveConfirmed);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Test this automation"
      description="A test creates a real execution record. Simulation runs never send email or change a spreadsheet."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button onClick={() => void run()} loading={running} disabled={!validation.valid || liveBlocked}>
            <Play size={14} /> {mode === "live" ? "Run live test" : "Run simulation test"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">Run mode</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("simulation")}
              disabled={running}
              aria-pressed={mode === "simulation"}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors",
                mode === "simulation" ? "border-primary bg-primary-soft/60 ring-1 ring-primary/20" : "border-line hover:bg-app",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                <FlaskConical size={13} /> Simulation
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-secondary">Deterministic sample data. No external actions.</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("live")}
              disabled={running}
              aria-pressed={mode === "live"}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-colors",
                mode === "live" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "border-line hover:bg-app",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                <Radio size={13} /> Live
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-secondary">Real provider calls. Can send email or write rows.</span>
            </button>
          </div>
        </div>

        {mode === "live" ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Live actions are real</p>
                <p className="mt-0.5">
                  A live test can send email from the connected Gmail account or append a row to a real spreadsheet. Use a test recipient or
                  test sheet where possible.
                </p>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              {(["gmail", "google_sheets", "ai"] as const).map((provider) => (
                <div key={provider} className="flex items-center justify-between gap-1 rounded border border-amber-200 bg-white/60 px-1.5 py-1">
                  <span className="text-[10px] capitalize">{provider === "google_sheets" ? "Sheets" : provider}</span>
                  <StatusBadge status={connections[provider]} />
                </div>
              ))}
            </div>
            <Checkbox
              checked={liveConfirmed}
              onChange={setLiveConfirmed}
              label="I understand this test can perform real actions"
              description="Nothing is sent unless a send/write step is configured and reachable."
            />
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[10.5px] leading-relaxed text-blue-800">
            <FlaskConical size={13} className="mt-0.5 shrink-0" />
            Simulation uses the real engine with deterministic adapters. Step outputs are sample data, and the run is labelled simulation
            everywhere it appears.
          </div>
        )}

        {!validation.valid ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-relaxed text-rose-800">
            <p className="font-semibold">Fix these before testing</p>
            <ul className="mt-1 space-y-0.5">
              {validation.errors.slice(0, 6).map((issue, index) => (
                <li key={`${issue.code}-${index}`}>• {issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="test-input">Trigger input (optional JSON)</Label>
            <button type="button" onClick={() => setInputText(SAMPLE_INPUT)} className="text-[10px] font-medium text-primary hover:underline" disabled={running}>
              Use sample input
            </button>
          </div>
          <Textarea
            id="test-input"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder={'{\n  "message": "Sample form submission"\n}'}
            rows={4}
            className="font-mono text-[11px]"
            disabled={running}
          />
          <p className="hint">Manual triggers expose this object as {"{{trigger.input}}"}. Other triggers ignore it.</p>
          {inputError ? <p className="mt-1 text-[10.5px] text-danger">{inputError}</p> : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-relaxed text-rose-800" role="alert">
            {error}
          </div>
        ) : null}

        {execution ? (
          <div className="rounded-lg border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-app/40 px-3 py-2">
              <StatusBadge status={execution.status} />
              <Badge tone={execution.mode === "live" ? "warning" : "neutral"}>{execution.mode === "live" ? "Live" : "Simulation"}</Badge>
              <span className="text-[10.5px] text-ink-secondary">{formatDuration(execution.durationMs)}</span>
              <Link to={`/history/${execution.id}`} onClick={onClose} className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline">
                Full log <ExternalLink size={11} />
              </Link>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {execution.steps.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-ink-secondary">
                  {["queued", "running"].includes(execution.status) ? "Waiting for the first step…" : "No steps were recorded."}
                </p>
              ) : (
                <div className="divide-y divide-line">
                  {execution.steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-2 px-3 py-2">
                      <span className="mt-0.5 text-[9px] tabular-nums text-ink-secondary">{String(index + 1).padStart(2, "0")}</span>
                      <NodeIcon type={step.nodeType} size="sm" className="h-6 w-6 [&>svg]:h-3 [&>svg]:w-3" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] font-medium text-ink">{step.nodeTitle || step.nodeType}</p>
                          <StatusBadge status={step.status} />
                          <span className="text-[9.5px] text-ink-secondary">{formatDuration(step.durationMs)}</span>
                        </div>
                        {step.errorMessage ? <p className="mt-0.5 text-[10px] leading-relaxed text-danger">{step.errorMessage}</p> : null}
                        {step.output ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[9.5px] font-medium text-primary">Output</summary>
                            <pre className="mt-1 max-h-28 overflow-auto rounded bg-app p-1.5 text-[9px] leading-relaxed text-ink">{safeJson(step.output, 1200)}</pre>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {execution.status === "failed" ? (
              <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[10.5px] text-danger">
                <AlertTriangle size={12} /> {execution.errorSummary || "The execution failed. Open the full log for details."}
              </div>
            ) : null}
            {execution.status === "succeeded" ? (
              <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[10.5px] text-success">
                <CheckCircle2 size={12} /> {execution.mode === "live" ? "Live test completed." : "Simulation completed. No external action was taken."}
              </div>
            ) : null}
          </div>
        ) : running ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-app/40 px-3 py-3 text-[11px] text-ink-secondary">
            <RotateCw size={13} className="animate-spin" /> Saving and queueing the test execution…
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
