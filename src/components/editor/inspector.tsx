import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  Info,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  INTEGRATION_LABELS,
  NODE_SPECS,
  nodeProvider,
  type ConfigFieldSpec,
  type NodeType,
  type ValidationIssue,
  type WorkflowDefinition,
} from "@/lib/workflow-schema";
import { nodeIsConfigured, useEditorStore } from "@/components/editor/editor-store";
import { NODE_ICONS, NODE_TONES } from "@/components/editor/flow-node";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const OUTPUT_HINTS: Record<NodeType, string[]> = {
  "manual.trigger": ["text"],
  "schedule.trigger": ["text"],
  "gmail.new_email": ["subject", "from", "body", "date", "snippet"],
  "gmail.send_email": ["message_id", "sent"],
  "google_sheets.new_row": ["row", "row_number"],
  "google_sheets.add_row": ["row_number"],
  "google_sheets.find_row": ["found", "row"],
  "ai.summarize": ["summary"],
  "ai.extract": [],
  "logic.filter": ["passed", "value"],
};

function outputFields(type: NodeType, config: Record<string, unknown>): string[] {
  if (type === "ai.extract") {
    const fields = Array.isArray(config["fields"]) ? config["fields"].map(String) : [];
    return [...fields, "data"];
  }
  return OUTPUT_HINTS[type] ?? [];
}

export interface InspectorProps {
  definition: WorkflowDefinition;
  validation: ValidationIssue[];
  connectedIntegrations: ("google_mail" | "google_sheets")[];
  lastTest?: { status: string; at: string } | null | undefined;
  onClose?: (() => void) | undefined;
}

export function Inspector({ definition, validation, connectedIntegrations, lastTest, onClose }: InspectorProps) {
  const selectedId = useEditorStore((s) => s.selectedId);
  const nodes = useEditorStore((s) => s.nodes);
  const description = useEditorStore((s) => s.description);
  const status = useEditorStore((s) => s.status);
  const setMeta = useEditorStore((s) => s.setMeta);
  const deleteNode = useEditorStore((s) => s.deleteNode);
  const selectNode = useEditorStore((s) => s.selectNode);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  if (!selected) {
    const blocking = validation.filter((v) => v.level === "error");
    const warnings = validation.filter((v) => v.level === "warning");
    const trigger = definition.nodes.find((n) => NODE_SPECS[n.type]?.kind === "trigger");
    return (
      <ScrollArea className="h-full">
        <div className="space-y-5 p-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Automation overview</h2>
              {onClose && (
                <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={onClose} aria-label="Close panel">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a node on the canvas to configure it, or review the workflow health below.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="text-muted-foreground">Status</div>
              <div className="mt-0.5 font-medium capitalize">{status.replace("_", " ")}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="text-muted-foreground">Nodes</div>
              <div className="mt-0.5 font-medium">{definition.nodes.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="text-muted-foreground">Trigger</div>
              <div className="mt-0.5 truncate font-medium">
                {trigger ? NODE_SPECS[trigger.type].label : "None"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="text-muted-foreground">Integrations</div>
              <div className="mt-0.5 font-medium">{definition.nodes.length ? integrationSummary(definition) : "—"}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validation
            </div>
            {blocking.length === 0 && warnings.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <span>Everything is configured. Activate the workflow when you are ready.</span>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {[...blocking, ...warnings].slice(0, 8).map((issue, i) => (
                  <li
                    key={`${issue.message}-${i}`}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                      issue.level === "error" ? "border-error/30 bg-error/5" : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <AlertTriangle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${issue.level === "error" ? "text-error" : "text-warning"}`}
                    />
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => issue.nodeId && selectNode(issue.nodeId)}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <Label htmlFor="workflow-description" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </Label>
            <Textarea
              id="workflow-description"
              className="mt-1.5 min-h-20 text-sm"
              placeholder="What does this automation do?"
              value={description}
              maxLength={500}
              onChange={(e) => setMeta({ description: e.target.value })}
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connections
            </div>
            <div className="space-y-1.5">
              {(["google_mail", "google_sheets"] as const).map((provider) => {
                const connected = connectedIntegrations.includes(provider);
                return (
                  <div key={provider} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-2 text-xs">
                    <span>{INTEGRATION_LABELS[provider]}</span>
                    <Badge variant="outline" className={connected ? "text-success" : "text-muted-foreground"}>
                      {connected ? "Connected" : "Not connected"}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Simulations run without connections. Live runs require both accounts to be connected.
            </p>
          </div>

          {lastTest && (
            <div className="rounded-lg border border-border bg-surface-muted p-2.5 text-xs">
              <div className="text-muted-foreground">Last test</div>
              <div className="mt-0.5 font-medium capitalize">
                {lastTest.status.replace("_", " ")} · {new Date(lastTest.at).toLocaleString()}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-surface-muted p-2.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Tip: press <kbd className="rounded border border-border bg-card px-1">Delete</kbd> to remove a selected node
              and <kbd className="rounded border border-border bg-card px-1">Ctrl/⌘ Z</kbd> to undo.
            </span>
          </div>
        </div>
      </ScrollArea>
    );
  }

  const spec = NODE_SPECS[selected.data.nodeType];
  const Icon = NODE_ICONS[selected.data.nodeType];
  const nodeIssues = validation.filter((v) => v.nodeId === selected.id);
  const requiredMissing = new Set(
    nodeIssues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .filter((m) => m.includes("missing a value")),
  );
  const configured = nodeIsConfigured(selected);

  return (
    <NodeConfigPanel
      key={selected.id}
      nodeId={selected.id}
      nodeType={selected.data.nodeType}
      config={selected.data.config}
      label={spec.label}
      short={spec.short}
      Icon={Icon}
      tone={NODE_TONES[selected.data.nodeType]}
      isTrigger={spec.kind === "trigger"}
      configured={configured}
      issues={nodeIssues}
      requiredMissing={requiredMissing}
      definition={definition}
      onDelete={() => deleteNode(selected.id)}
      onClose={onClose}
    />
  );
}

function integrationSummary(definition: WorkflowDefinition) {
  const set = new Set<string>();
  for (const node of definition.nodes) {
    const provider = nodeProvider(node.type);
    if (provider !== "flowmate") set.add(INTEGRATION_LABELS[provider]);
  }
  return set.size ? [...set].join(", ") : "None";
}

interface ConfigPanelProps {
  nodeId: string;
  nodeType: NodeType;
  config: Record<string, unknown>;
  label: string;
  short: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
  isTrigger: boolean;
  configured: boolean;
  issues: ValidationIssue[];
  requiredMissing: Set<string>;
  definition: WorkflowDefinition;
  onDelete: () => void;
  onClose?: (() => void) | undefined;
}

function NodeConfigPanel(props: ConfigPanelProps) {
  const { nodeId, nodeType, config, label, short, Icon, tone, isTrigger, configured, issues, definition, onDelete, onClose } = props;
  const updateConfig = useEditorStore((s) => s.updateConfig);
  const spec = NODE_SPECS[nodeType];
  const [activeField, setActiveField] = useState<string>(
    spec.fields?.find((f) => f.type === "text" || f.type === "textarea")?.key ?? "",
  );

  const variables = useMemo(() => {
    return definition.nodes
      .filter((n) => n.id !== nodeId)
      .map((n) => ({
        nodeId: n.id,
        label: NODE_SPECS[n.type].label,
        fields: outputFields(n.type, n.config),
      }))
      .filter((v) => v.fields.length > 0);
  }, [definition.nodes, nodeId]);

  function insertVariable(token: string) {
    if (!activeField) return;
    const current = config[activeField];
    const text = typeof current === "string" ? current : "";
    updateConfig(nodeId, activeField, `${text}${text && !text.endsWith(" ") ? " " : ""}${token}`);
  }

  const errorsFor = (fieldKey: string) =>
    issues.find((i) => i.level === "error" && i.message.includes("missing a value") && i.message.includes(fieldLabel(fieldKey)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2.5 border-b border-border p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{label}</h2>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isTrigger ? "Trigger" : "Action"} · {configured ? "Ready" : "Needs setup"}
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">{short}</p>

          {issues.length > 0 && (
            <div className="space-y-1.5">
              {issues.slice(0, 4).map((issue, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] ${
                    issue.level === "error" ? "border-error/30 bg-error/5 text-error" : "border-warning/30 bg-warning/5"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {(spec.fields ?? []).map((field) => (
              <FieldEditor
                key={field.key}
                field={field}
                value={config[field.key]}
                error={errorsFor(field.key)?.message}
                onFocus={() => setActiveField(field.key)}
                onChange={(value) => updateConfig(nodeId, field.key, value)}
              />
            ))}
            {(spec.fields ?? []).length === 0 && (
              <p className="rounded-md bg-surface-muted p-2.5 text-xs text-muted-foreground">
                This step has no settings to configure.
              </p>
            )}
          </div>

          {variables.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Braces className="h-3.5 w-3.5 text-primary" /> Available variables
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Click a field to insert it into the focused setting.
                </p>
                <div className="mt-2 space-y-2">
                  {variables.map((v) => (
                    <div key={v.nodeId}>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{v.label}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {v.fields.map((field) => {
                          const token = `{{${v.nodeId}.${field}}}`;
                          return (
                            <button
                              key={field}
                              type="button"
                              onClick={() => insertVariable(token)}
                              disabled={!activeField}
                              className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                            >
                              {token}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full text-error hover:text-error" size="sm">
                <Trash2 className="h-3.5 w-3.5" /> Delete node
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this node?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{label}” and its connections will be removed. This cannot be undone unless you use Undo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </ScrollArea>
    </div>
  );
}

function fieldLabel(key: string) {
  return (
    Object.values(NODE_SPECS)
      .flatMap((s) => s.fields ?? [])
      .find((f) => f.key === key)?.label ?? key
  );
}

function FieldEditor({
  field,
  value,
  error,
  onFocus,
  onChange,
}: {
  field: ConfigFieldSpec;
  value: unknown;
  error?: string | undefined;
  onFocus: () => void;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.key}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1 text-xs">
        {field.label}
        {field.required && <span className="text-error">*</span>}
      </Label>
      {field.type === "textarea" && (
        <Textarea
          id={id}
          className={`min-h-20 text-xs ${error ? "border-error" : ""}`}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "text" && (
        <Input
          id={id}
          className={`h-8 text-xs ${error ? "border-error" : ""}`}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "number" && (
        <Input
          id={id}
          type="number"
          className={`h-8 text-xs ${error ? "border-error" : ""}`}
          placeholder={field.placeholder}
          value={typeof value === "number" ? value : typeof value === "string" ? value : ""}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      )}
      {field.type === "select" && (
        <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-8 text-xs" onFocus={onFocus}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.type === "fields" && (
        <FieldsEditor value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} onFocus={onFocus} />
      )}
      {field.type === "mapping" && (
        <MappingEditor
          value={value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}}
          onChange={onChange}
          onFocus={onFocus}
        />
      )}
      {field.help && <p className="text-[10px] leading-snug text-muted-foreground">{field.help}</p>}
      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
}

function FieldsEditor({
  value,
  onChange,
  onFocus,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  onFocus: () => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const clean = draft.trim().replace(/[^a-zA-Z0-9_]/g, "_");
    if (!clean || value.includes(clean)) {
      setDraft("");
      return;
    }
    onChange([...value, clean]);
    setDraft("");
  }
  return (
    <div className="space-y-1.5" onFocus={onFocus}>
      <div className="flex flex-wrap gap-1">
        {value.map((field) => (
          <span key={field} className="inline-flex items-center gap-1 rounded border border-border bg-accent/40 px-1.5 py-0.5 font-mono text-[10px]">
            {field}
            <button type="button" aria-label={`Remove ${field}`} onClick={() => onChange(value.filter((v) => v !== field))}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          className="h-8 text-xs"
          placeholder="invoice_number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={add} aria-label="Add field">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MappingEditor({
  value,
  onChange,
  onFocus,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onFocus: () => void;
}) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-1.5" onFocus={onFocus}>
      {entries.map(([key, v], i) => (
        <div key={`${key}-${i}`} className="flex gap-1">
          <Input
            className="h-8 w-2/5 text-xs"
            value={key}
            placeholder="Column"
            onChange={(e) => {
              const next = { ...value };
              delete next[key];
              next[e.target.value] = v;
              onChange(next);
            }}
          />
          <Input
            className="h-8 flex-1 text-xs"
            value={typeof v === "string" ? v : JSON.stringify(v)}
            placeholder="{{extract_1.amount}}"
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Remove ${key}`}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => {
          let name = "Column";
          let i = 2;
          while (name in value) {
            name = `Column ${i}`;
            i += 1;
          }
          onChange({ ...value, [name]: "" });
        }}
      >
        <Plus className="h-3 w-3" /> Add column
      </Button>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <ArrowRight className="h-2.5 w-2.5" /> Values support variables from earlier steps.
      </div>
    </div>
  );
}
