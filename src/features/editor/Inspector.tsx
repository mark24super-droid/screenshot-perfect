import * as React from "react";
import { Braces, Check, ChevronDown, Copy, Plus, Sparkles, Trash2, X } from "lucide-react";
import { getNodeDefinition, isTriggerType, nodeOutputKeys, type NodeField } from "@shared/nodes";
import { Badge, StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Input, Label, Select, Textarea } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { NodeIcon } from "../../lib/icons";
import { copyToClipboard, providerLabel } from "../../lib/utils";
import { cn } from "../../lib/utils";
import { useEditorStore } from "./editorStore";

export function Inspector({
  onOpenPicker,
  onClose,
  onAutoLayout,
}: {
  onOpenPicker: () => void;
  onClose?: () => void;
  onAutoLayout: () => void;
}) {
  const definition = useEditorStore((state) => state.definition);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const validation = useEditorStore((state) => state.validation);
  const mode = useEditorStore((state) => state.mode);
  const connections = useEditorStore((state) => state.connections);
  const setSelected = useEditorStore((state) => state.setSelected);
  const updateNodeConfig = useEditorStore((state) => state.updateNodeConfig);
  const updateNodeTitle = useEditorStore((state) => state.updateNodeTitle);
  const beginEdit = useEditorStore((state) => state.beginEdit);
  const deleteNode = useEditorStore((state) => state.deleteNode);
  const setDescription = useEditorStore((state) => state.setDescription);
  const name = useEditorStore((state) => state.name);
  const description = useEditorStore((state) => state.description);
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [openVariables, setOpenVariables] = React.useState<string | null>(null);

  const node = definition.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const nodeDefinition = node ? getNodeDefinition(node.type) : undefined;
  const errors = node ? validation.errors.filter((issue) => issue.nodeId === node.id) : [];
  const warnings = node ? validation.warnings.filter((issue) => issue.nodeId === node.id) : [];

  const order = validation.order.length ? validation.order : definition.nodes.map((item) => item.id);
  const nodeIndex = node ? order.indexOf(node.id) : -1;
  const previousNodes = order
    .slice(0, nodeIndex === -1 ? order.length : nodeIndex)
    .map((id) => definition.nodes.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!node) {
    return (
      <div className="flex h-full flex-col">
        <InspectorHeader title="Workflow overview" onClose={onClose} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea
              id="workflow-description"
              value={description}
              onFocus={beginEdit}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this automation do?"
              rows={3}
              maxLength={500}
            />
            <p className="hint">Shown on the automation list and execution records.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <InfoTile label="Trigger" value={definition.nodes.find((item) => isTriggerType(item.type)) ? "Configured" : "Missing"} tone={definition.nodes.some((item) => isTriggerType(item.type)) ? "success" : "danger"} />
            <InfoTile label="Steps" value={String(definition.nodes.length)} tone="neutral" />
            <InfoTile label="Mode" value={mode === "live" ? "Live" : "Simulation"} tone={mode === "live" ? "warning" : "info"} />
            <InfoTile label="Errors" value={String(validation.errors.length)} tone={validation.errors.length ? "danger" : "success"} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Validation</p>
              <Badge tone={validation.valid ? "success" : "danger"}>{validation.valid ? "Ready to test" : `${validation.errors.length} blocking`}</Badge>
            </div>
            {validation.errors.length === 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[10.5px] leading-relaxed text-emerald-800">
                <Check size={12} className="shrink-0" /> No blocking issues. Warnings, if any, do not prevent simulation testing.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {validation.errors.slice(0, 6).map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    <button
                      type="button"
                      onClick={() => issue.nodeId && setSelected(issue.nodeId)}
                      className="w-full rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-left text-[10.5px] leading-relaxed text-rose-800 hover:bg-rose-100"
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {validation.warnings.slice(0, 4).map((issue, index) => (
                  <li key={`${issue.code}-w-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-amber-800">
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Required integrations</p>
            {validation.requiredIntegrations.length === 0 ? (
              <p className="mt-1 text-[11px] text-ink-secondary">None. This workflow uses no external providers.</p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {validation.requiredIntegrations.map((provider) => (
                  <div key={provider} className="flex items-center justify-between gap-2 rounded-md border border-line bg-app/40 px-2 py-1.5">
                    <span className="text-[11px] text-ink">{providerLabel(provider)}</span>
                    <StatusBadge status={connections[provider]} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Steps</p>
              <button type="button" onClick={onOpenPicker} className="text-[10.5px] font-medium text-primary hover:underline">
                + Add
              </button>
            </div>
            <div className="mt-1.5 space-y-1">
              {definition.nodes.length === 0 ? (
                <p className="text-[11px] text-ink-secondary">No steps yet. Add a trigger first.</p>
              ) : (
                definition.nodes.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-app"
                  >
                    <span className="text-[9px] tabular-nums text-ink-secondary">{String(index + 1).padStart(2, "0")}</span>
                    <NodeIcon type={item.type} size="sm" className="h-6 w-6 [&>svg]:h-3 [&>svg]:w-3" />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{item.title || getNodeDefinition(item.type)?.title}</span>
                    {isTriggerType(item.type) ? <Badge tone="purple">Trigger</Badge> : null}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-app/40 p-2.5">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink">
              <Sparkles size={11} className="text-primary" /> {name}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-secondary">
              Select a step to edit its fields. Drag between handles to connect steps. Changes are saved as a new version only when the
              content differs.
            </p>
            <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={onAutoLayout}>
              Auto-arrange steps
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const config = (node.config ?? {}) as Record<string, unknown>;

  const updateField = (field: NodeField, value: unknown) => {
    updateNodeConfig(node.id, { ...config, [field.key]: value });
  };

  const fieldIssues = (field: NodeField) => {
    const all = [...errors, ...warnings];
    return all.filter((issue) => issue.field === field.key);
  };

  return (
    <div className="flex h-full flex-col">
      <InspectorHeader
        title="Step inspector"
        onClose={onClose}
        right={
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete step" title="Delete step">
            <Trash2 size={14} className="text-danger" />
          </Button>
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-app/40 p-2.5">
          <NodeIcon type={node.type} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-ink">{nodeDefinition?.title ?? node.type}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-ink-secondary">{nodeDefinition?.description}</p>
          </div>
          <Badge tone={nodeDefinition?.kind === "trigger" ? "purple" : "neutral"}>{nodeDefinition?.kind === "trigger" ? "Trigger" : "Action"}</Badge>
        </div>

        {nodeDefinition?.demoOnly ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10.5px] leading-relaxed text-amber-800">
            <strong className="font-semibold">Simulation only.</strong> {nodeDefinition.availabilityNote}
          </div>
        ) : nodeDefinition?.availabilityNote ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[10.5px] leading-relaxed text-blue-800">{nodeDefinition.availabilityNote}</div>
        ) : null}

        {errors.length > 0 ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
            <p className="text-[10.5px] font-semibold text-rose-800">Fix before running</p>
            <ul className="mt-1 space-y-0.5">
              {errors.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className="text-[10px] leading-relaxed text-rose-800">
                  • {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <Label htmlFor="node-title">Step name</Label>
          <Input
            id="node-title"
            value={node.title ?? ""}
            onFocus={beginEdit}
            onChange={(event) => updateNodeTitle(node.id, event.target.value)}
            maxLength={120}
            placeholder={nodeDefinition?.title}
          />
          <p className="hint">Used in the editor and execution logs. Node ID: <code className="font-mono text-[10px]">{node.id}</code></p>
        </div>

        {nodeDefinition && nodeDefinition.fields.length === 0 ? (
          <p className="rounded-lg border border-line bg-app/40 p-2.5 text-[10.5px] leading-relaxed text-ink-secondary">
            This step has no configuration. It is ready to use once connected.
          </p>
        ) : null}

        {nodeDefinition?.fields.map((field) => {
          const issues = fieldIssues(field);
          const value = config[field.key];
          return (
            <div key={field.key} className="relative">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`field-${field.key}`} required={field.required}>
                  {field.label}
                </Label>
                {field.supportsVariables ? (
                  <button
                    type="button"
                    onClick={() => setOpenVariables((current) => (current === field.key ? null : field.key))}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9.5px] font-medium text-primary hover:bg-primary-soft"
                    aria-expanded={openVariables === field.key}
                  >
                    <Braces size={10} /> Variables
                  </button>
                ) : null}
              </div>

              {field.type === "textarea" ? (
                <Textarea
                  id={`field-${field.key}`}
                  value={typeof value === "string" ? value : ""}
                  onFocus={beginEdit}
                  onChange={(event) => updateField(field, event.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                />
              ) : field.type === "select" ? (
                <Select
                  id={`field-${field.key}`}
                  value={typeof value === "string" ? value : ""}
                  onFocus={beginEdit}
                  onChange={(event) => updateField(field, event.target.value)}
                >
                  <option value="">Choose…</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : field.type === "number" ? (
                <Input
                  id={`field-${field.key}`}
                  type="number"
                  value={typeof value === "number" || typeof value === "string" ? value : ""}
                  onFocus={beginEdit}
                  onChange={(event) => updateField(field, event.target.value)}
                  min={field.min}
                  max={field.max}
                  placeholder={field.placeholder}
                />
              ) : field.type === "mapping" ? (
                <MappingEditor
                  field={field}
                  rows={Array.isArray(value) ? (value as Array<{ column?: string; value?: string }>) : []}
                  onChange={(rows) => updateField(field, rows)}
                  onBeginEdit={beginEdit}
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  value={typeof value === "string" ? value : ""}
                  onFocus={beginEdit}
                  onChange={(event) => updateField(field, event.target.value)}
                  placeholder={field.placeholder}
                />
              )}

              {field.help ? <p className="hint">{field.help}</p> : null}
              {issues.map((issue, index) => (
                <p
                  key={`${issue.code}-${index}`}
                  className={cn("mt-1 text-[10px] leading-relaxed", issue.severity === "warning" || warnings.includes(issue) ? "text-amber-700" : "text-danger")}
                >
                  {issue.message}
                </p>
              ))}

              {openVariables === field.key ? (
                <VariableMenu
                  nodes={previousNodes}
                  onClose={() => setOpenVariables(null)}
                  onPick={(variable) => {
                    const current = typeof value === "string" ? value : "";
                    updateField(field, `${current}${current ? " " : ""}${variable}`);
                    setOpenVariables(null);
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {nodeDefinition && nodeDefinition.outputs.length > 0 ? (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Available outputs</p>
            <p className="mt-0.5 text-[10px] text-ink-secondary">Copy a reference to use in a later step.</p>
            <div className="mt-1.5 space-y-1">
              {nodeDefinition.outputs.map((output) => {
                const variable = `{{${node.id}.${output.key}}}`;
                return (
                  <div key={output.key} className="flex items-center gap-2 rounded-md border border-line bg-app/40 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-medium text-ink">{output.label}</p>
                      <p className="truncate font-mono text-[9.5px] text-ink-secondary">{variable}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded p-1 text-ink-secondary hover:bg-white hover:text-primary"
                      onClick={() => {
                        void copyToClipboard(variable)
                          .then(() => toast({ title: "Variable copied", description: variable, variant: "success" }))
                          .catch(() => toast({ title: "Clipboard unavailable", variant: "error" }));
                      }}
                      aria-label={`Copy ${output.label} variable`}
                      title="Copy variable"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {nodeDefinition?.provider ? (
          <div className="rounded-lg border border-line bg-app/40 p-2.5 text-[10px] leading-relaxed text-ink-secondary">
            Provider: <strong className="font-medium text-ink">{providerLabel(nodeDefinition.provider)}</strong> ·{" "}
            {mode === "live" ? "Live mode — external action possible." : "Simulation mode — deterministic adapter, no external action."}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteNode(node.id);
          setConfirmDelete(false);
        }}
        title="Delete this step?"
        description={
          <>
            <strong className="font-medium text-ink">{node.title || nodeDefinition?.title}</strong> and its connections will be removed.
            You can undo this from the toolbar.
          </>
        }
        confirmLabel="Delete step"
      />
    </div>
  );
}

function InspectorHeader({ title, onClose, right }: { title: string; onClose?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{title}</p>
      <div className="ml-auto flex items-center gap-1">
        {right}
        {onClose ? (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inspector" className="lg:hidden">
            <X size={15} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function InfoTile({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }) {
  const tones = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    neutral: "border-line bg-app/40 text-ink",
  };
  return (
    <div className={cn("rounded-lg border px-2 py-1.5", tones[tone])}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium">{value}</p>
    </div>
  );
}

function MappingEditor({
  field,
  rows,
  onChange,
  onBeginEdit,
}: {
  field: NodeField;
  rows: Array<{ column?: string; value?: string }>;
  onChange: (rows: Array<{ column: string; value: string }>) => void;
  onBeginEdit: () => void;
}) {
  const normalized = rows.map((row) => ({ column: row.column ?? "", value: row.value ?? "" }));
  const update = (index: number, key: "column" | "value", value: string) => {
    const next = normalized.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row));
    onChange(next);
  };
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-app/30 p-2">
      {normalized.length === 0 ? <p className="text-[10px] text-ink-secondary">No columns mapped yet.</p> : null}
      {normalized.map((row, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <Input
            value={row.column}
            onFocus={onBeginEdit}
            onChange={(event) => update(index, "column", event.target.value)}
            placeholder="Column"
            className="h-8 w-[38%] text-[11px]"
            aria-label={`${field.label} column ${index + 1}`}
          />
          <Input
            value={row.value}
            onFocus={onBeginEdit}
            onChange={(event) => update(index, "value", event.target.value)}
            placeholder="Value or {{variable}}"
            className="h-8 flex-1 text-[11px]"
            aria-label={`${field.label} value ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => onChange(normalized.filter((_, rowIndex) => rowIndex !== index))}
            className="mt-1 rounded p-1 text-ink-secondary hover:bg-rose-50 hover:text-danger"
            aria-label={`Remove mapping row ${index + 1}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          onBeginEdit();
          onChange([...normalized, { column: "", value: "" }]);
        }}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-primary hover:bg-primary-soft"
      >
        <Plus size={11} /> Add column
      </button>
    </div>
  );
}

function VariableMenu({
  nodes,
  onPick,
  onClose,
}: {
  nodes: Array<{ id: string; type: string; title?: string }>;
  onPick: (variable: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-full max-w-[320px] rounded-lg border border-line bg-white p-1.5 shadow-pop">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Variables from earlier steps</p>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-ink-secondary hover:text-ink" aria-label="Close variables">
          <ChevronDown size={12} />
        </button>
      </div>
      {nodes.length === 0 ? (
        <p className="px-1 py-2 text-[10px] text-ink-secondary">No earlier steps are available.</p>
      ) : (
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {nodes.map((node) => {
            const def = getNodeDefinition(node.type);
            const keys = nodeOutputKeys(node.type);
            if (!def || keys.length === 0) return null;
            return (
              <div key={node.id}>
                <p className="px-1 text-[9.5px] font-medium text-ink">{node.title || def.title}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {keys.slice(0, 12).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPick(`{{${node.id}.${key}}}`)}
                      className="rounded border border-line bg-app/60 px-1.5 py-0.5 font-mono text-[9px] text-ink-secondary hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
