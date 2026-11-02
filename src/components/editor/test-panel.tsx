import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FlaskConical,
  Loader2,
  MinusCircle,
  Play,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { runWorkflowTest } from "@/lib/executions.functions";
import { NODE_SPECS, type NodeType, type ValidationIssue } from "@/lib/workflow-schema";
import { formatDuration } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type TestResult = Awaited<ReturnType<typeof runWorkflowTest>>;

const STEP_ICON = {
  succeeded: CheckCircle2,
  failed: XCircle,
  waiting: Clock,
  skipped: MinusCircle,
} as const;

const STEP_TONE = {
  succeeded: "text-success",
  failed: "text-error",
  waiting: "text-warning",
  skipped: "text-muted-foreground",
} as const;

export function TestPanel({
  open,
  onOpenChange,
  workflowId,
  triggerType,
  sampleInput,
  connectedIntegrations,
  blockingIssues,
  onBeforeRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  triggerType: NodeType | null;
  sampleInput: string;
  connectedIntegrations: ("google_mail" | "google_sheets")[];
  blockingIssues: ValidationIssue[];
  onBeforeRun: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"simulation" | "live">("simulation");
  const [sample, setSample] = useState(sampleInput);
  const [inputError, setInputError] = useState<string | null>(null);
  const run = useServerFn(runWorkflowTest);
  const supportsSample = triggerType === "manual.trigger" || triggerType === "schedule.trigger";
  const liveReady = connectedIntegrations.includes("google_mail") && connectedIntegrations.includes("google_sheets");

  const mutation = useMutation({
    mutationFn: async (selectedMode: "simulation" | "live") => {
      const ok = await onBeforeRun();
      if (!ok) throw new Error("Save the workflow before running a test.");
      let parsed: Record<string, unknown> | undefined;
      if (supportsSample && sample.trim()) {
        try {
          const value = JSON.parse(sample);
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Sample input must be a JSON object.");
          }
          parsed = value as Record<string, unknown>;
        } catch {
          throw new Error("Sample input must be valid JSON, for example {\"text\":\"hello\"}.");
        }
      }
      return run({ data: { workflowId, mode: selectedMode, sampleInput: parsed } });
    },
    onError: (err) => setInputError(err instanceof Error ? err.message : "Test failed."),
  });

  const result: TestResult | undefined = mutation.data;
  const modeLabel = mode === "simulation" ? "Simulation" : "Live";

  const summary = useMemo(() => {
    if (!result?.ok || !result.steps) return null;
    const succeeded = result.steps.filter((s) => s.status === "succeeded").length;
    return { succeeded, total: result.steps.length };
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" /> Test workflow
          </DialogTitle>
          <DialogDescription>
            Runs the last saved version. Failures are reported honestly — nothing is marked successful unless it ran.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 p-4">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as "simulation" | "live"); setInputError(null); mutation.reset(); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simulation">Simulation</TabsTrigger>
                <TabsTrigger value="live">Live</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "simulation" ? (
              <Alert className="border-primary/30 bg-accent/40">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <AlertTitle>Simulation mode</AlertTitle>
                <AlertDescription>
                  No real emails are sent and no spreadsheets are changed. Sample data is used and every step is labelled as
                  simulated.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant={liveReady ? "default" : "destructive"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Live mode performs real actions</AlertTitle>
                <AlertDescription>
                  {liveReady
                    ? "Emails may be sent and spreadsheet rows may be added using your connected accounts."
                    : "Connect Gmail and Google Sheets on the Integrations page first. Live mode is blocked until they are connected."}
                </AlertDescription>
              </Alert>
            )}

            {blockingIssues.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fix these before running</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {blockingIssues.slice(0, 5).map((issue) => (
                      <li key={issue.message}>{issue.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {supportsSample && (
              <div className="space-y-1.5">
                <Label htmlFor="test-sample" className="text-xs">
                  Sample trigger input (JSON, optional)
                </Label>
                <Textarea
                  id="test-sample"
                  className="min-h-20 font-mono text-xs"
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  placeholder={'{"text": "Invoice INV-2043 for $420.00"}'}
                />
                <p className="text-[10px] text-muted-foreground">
                  This value is passed to the trigger and can be referenced with variable syntax.
                </p>
              </div>
            )}

            {inputError && (
              <Alert variant="destructive">
                <AlertTitle>Could not run the test</AlertTitle>
                <AlertDescription>{inputError}</AlertDescription>
              </Alert>
            )}

            {result && !result.ok && (
              <Alert variant="destructive">
                <AlertTitle>Test did not run</AlertTitle>
                <AlertDescription>
                  {result.limitError ??
                    result.validation.find((v) => v.level === "error")?.message ??
                    "The workflow has blocking errors."}
                </AlertDescription>
              </Alert>
            )}

            {result?.ok && result.steps && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className={
                      result.status === "succeeded"
                        ? "text-success border-success/40 bg-success/10"
                        : result.status === "failed"
                          ? "text-error border-error/40 bg-error/10"
                          : "text-warning border-warning/40 bg-warning/10"
                    }
                  >
                    {result.status?.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline" className={result.mode === "simulation" ? "text-primary" : "text-info"}>
                    {result.mode === "simulation" ? "SIMULATED RUN" : "LIVE RUN"}
                  </Badge>
                  {summary && (
                    <span className="text-muted-foreground">
                      {summary.succeeded}/{summary.total} steps succeeded
                    </span>
                  )}
                  {result.executionId && (
                    <Link
                      to="/history"
                      search={{ executionId: result.executionId }}
                      className="ml-auto text-primary hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      Open in history →
                    </Link>
                  )}
                </div>

                <div className="space-y-1.5">
                  {result.steps.map((step) => {
                    const Icon = STEP_ICON[step.status as keyof typeof STEP_ICON] ?? Clock;
                    const tone = STEP_TONE[step.status as keyof typeof STEP_TONE] ?? "text-muted-foreground";
                    const label = NODE_SPECS[step.nodeType as NodeType]?.label ?? step.nodeType;
                    return (
                      <div key={step.nodeId} className="rounded-lg border border-border">
                        <div className="flex items-center gap-2 px-2.5 py-2 text-xs">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
                          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{step.nodeId}</span>
                          {step.attempts > 1 && (
                            <Badge variant="outline" className="text-[9px] text-warning">
                              {step.attempts} attempts
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{formatDuration(step.durationMs)}</span>
                        </div>
                        {step.errorMessage && (
                          <p className={`border-t border-border px-2.5 py-1.5 text-[11px] ${tone}`}>{step.errorMessage}</p>
                        )}
                        {(Object.keys(step.output ?? {}).length > 0 || Object.keys(step.input ?? {}).length > 0) && (
                          <details className="border-t border-border">
                            <summary className="flex cursor-pointer items-center gap-1 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                              <ChevronDown className="h-3 w-3" /> Input and output
                            </summary>
                            <div className="grid gap-2 p-2.5 pt-0 sm:grid-cols-2">
                              <Preview title="Input" value={step.input} />
                              <Preview title="Output" value={step.output} />
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <span className="text-[11px] text-muted-foreground">
            {mode === "simulation" ? "Safe to run — nothing leaves FlowMate." : "Real actions will be attempted."}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setInputError(null);
              mutation.mutate(mode);
            }}
            disabled={mutation.isPending || blockingIssues.length > 0 || (mode === "live" && !liveReady)}
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {mutation.isPending ? "Running…" : mutation.data ? "Run again" : `Run ${modeLabel.toLowerCase()} test`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="max-h-40 overflow-auto rounded-md bg-surface-muted p-2 text-[10px] leading-snug">
        {value && Object.keys(value as Record<string, unknown>).length > 0
          ? JSON.stringify(value, null, 2)
          : "—"}
      </pre>
    </div>
  );
}
