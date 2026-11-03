import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  ChevronRight,
  Clock,
  FlaskConical,
  Mail,
  MousePointerClick,
  Plus,
  Search,
  Sparkles,
  Wand2,
  Workflow,
} from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, CardBody, Skeleton } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Label, Textarea } from "../components/ui/Input";
import { ErrorState } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { NodeIcon, ProviderIcon } from "../lib/icons";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { GenerateResponse, TemplateItem, WorkflowDetail } from "../lib/types";
import type { WorkflowDefinition } from "@shared/workflow";
import { getNodeDefinition, providerForNode } from "@shared/nodes";
import { cn, providerLabel } from "../lib/utils";

type Tab = "ai" | "template" | "blank";

const EXAMPLES = [
  "When an invoice email arrives, extract the invoice number, vendor and amount, then add a row to my Invoices spreadsheet.",
  "Every morning at 9am, summarize yesterday's unread emails and email me the summary.",
  "When a lead submits the contact form, extract their name and email, then send a confirmation email.",
  "Find unread emails from customers, summarize each one, and append the summary to a support sheet.",
];

const BLANK_STARTERS = [
  {
    type: "manual.trigger",
    title: "Manual trigger",
    description: "Start on demand or with sample input. Best for learning the editor.",
    icon: <MousePointerClick size={17} />,
    config: {},
  },
  {
    type: "schedule.trigger",
    title: "Schedule trigger",
    description: "Run daily, weekly or hourly in UTC. Best for recurring reports.",
    icon: <Clock size={17} />,
    config: { frequency: "daily", time: "09:00", dayOfWeek: "1" },
  },
  {
    type: "gmail.new_email",
    title: "Gmail trigger",
    description: "Use the newest email matching a search query. Requires Gmail for live runs.",
    icon: <Mail size={17} />,
    config: { query: "is:unread" },
  },
];

export default function NewAutomationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>("ai");

  return (
    <PageContainer>
      <Link to="/automations" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink">
        <ArrowLeft size={13} /> Back to automations
      </Link>
      <PageTitle
        title="Create an automation"
        description="Start with a description, a reviewed template, or a blank trigger. Every option creates a draft — nothing is activated automatically."
      />

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <StartTab
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={<Wand2 size={17} />}
          title="Describe with AI"
          description="Turn a sentence into a reviewable plan."
          badge="Recommended"
        />
        <StartTab
          active={tab === "template"}
          onClick={() => setTab("template")}
          icon={<Blocks size={17} />}
          title="Start from a template"
          description="Six reviewed starting points."
        />
        <StartTab
          active={tab === "blank"}
          onClick={() => setTab("blank")}
          icon={<Plus size={17} />}
          title="Start blank"
          description="Choose a trigger and build by hand."
        />
      </div>

      <div className="mt-5">
        {tab === "ai" ? <AiStarter onCreated={(id) => navigate(`/automations/${id}`)} /> : null}
        {tab === "template" ? <TemplateStarter onCreated={(id) => navigate(`/automations/${id}`)} /> : null}
        {tab === "blank" ? <BlankStarter onCreated={(id) => navigate(`/automations/${id}`)} /> : null}
      </div>
    </PageContainer>
  );
}

function StartTab({
  active,
  onClick,
  icon,
  title,
  description,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary bg-white ring-1 ring-primary/20" : "border-line bg-white/70 hover:bg-white",
      )}
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", active ? "bg-primary text-white" : "bg-app text-ink-secondary")}>
        {icon}
      </span>
      <span className="mt-2.5 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
        {badge ? <Badge tone="purple">{badge}</Badge> : null}
      </span>
      <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-secondary">{description}</span>
    </button>
  );
}

function AiStarter({ onCreated }: { onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GenerateResponse | null>(null);
  const [name, setName] = React.useState("");

  const generate = async () => {
    if (prompt.trim().length < 10) {
      setError("Describe the task in at least 10 characters so the planner has enough context.");
      return;
    }
    setError(null);
    setGenerating(true);
    setResult(null);
    try {
      const response = await apiPost<GenerateResponse>("/workflows/generate", { prompt: prompt.trim() });
      setResult(response);
      setName(response.plan.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const createDraft = async () => {
    if (!result) return;
    if (name.trim().length < 1) {
      setError("Give the automation a name before creating the draft.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const detail = await apiPost<WorkflowDetail>("/workflows", {
        name: name.trim(),
        description: result.plan.description,
        definition: result.plan.definition,
      });
      toast({
        title: "Draft created",
        description: "Review the highlighted configuration, test in simulation mode, then activate.",
        variant: "success",
      });
      onCreated(detail.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-ink">Describe what should happen</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
                Be specific about the trigger, the data and the destination. FlowMate only proposes allowlisted Gmail, Google
                Sheets, AI, logic and utility steps.
              </p>
            </div>
            <Badge tone="purple">
              <Sparkles size={11} /> AI planner
            </Badge>
          </div>

          <div>
            <Label htmlFor="prompt" required>
              Automation description
            </Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="When an email with an invoice arrives, extract the invoice number and amount, then add a row to my Invoices sheet."
              rows={5}
              maxLength={2000}
              disabled={generating}
            />
            <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-secondary">
              <span>Plain language is fine. Do not include passwords or API keys.</span>
              <span>{prompt.length}/2000</span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-ink">Try an example</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-full border border-line bg-app/60 px-2.5 py-1 text-left text-[10.5px] text-ink-secondary transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                >
                  {example.length > 64 ? `${example.slice(0, 61)}…` : example}
                </button>
              ))}
            </div>
          </div>

          {error ? <ErrorState title="Could not generate a plan" description={error} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void generate()} loading={generating} disabled={prompt.trim().length < 10}>
              <Sparkles size={15} /> {result ? "Regenerate plan" : "Generate plan"}
            </Button>
            {result ? (
              <Button variant="ghost" onClick={() => setResult(null)} disabled={creating}>
                Start over
              </Button>
            ) : null}
            <span className="ml-auto text-[10.5px] text-ink-secondary">Generation is limited by your plan.</span>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        {generating ? (
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-12 w-full" />
              ))}
              <p className="text-[11px] text-ink-secondary">Planning allowlisted steps…</p>
            </CardBody>
          </Card>
        ) : result ? (
          <PlanPreview
            result={result}
            name={name}
            onNameChange={setName}
            creating={creating}
            onCreate={() => void createDraft()}
          />
        ) : (
          <Card>
            <CardBody>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Wand2 size={19} />
              </div>
              <h3 className="mt-3 text-[13px] font-semibold text-ink">How generation works</h3>
              <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-ink-secondary">
                <li className="flex gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-success" /> The planner maps your request to known step types.
                </li>
                <li className="flex gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-success" /> Generated code is never executed. Only step config is stored.
                </li>
                <li className="flex gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-success" /> You review missing configuration before saving.
                </li>
                <li className="flex gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-success" /> Saving creates a draft; activation is a separate action.
                </li>
              </ul>
              <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5 text-[10.5px] leading-relaxed text-amber-800">
                <strong className="font-semibold">Provider status:</strong> if no server-side AI key is configured, a deterministic
                local demo planner is used and the result is labelled. It does not call an external AI service.
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function PlanPreview({
  result,
  name,
  onNameChange,
  creating,
  onCreate,
}: {
  result: GenerateResponse;
  name: string;
  onNameChange: (value: string) => void;
  creating: boolean;
  onCreate: () => void;
}) {
  const { plan } = result;
  const isLocal = plan.source === "local-demo";
  const orderedNodes = React.useMemo(() => {
    const byId = new Map(plan.definition.nodes.map((node) => [node.id, node]));
    const order: string[] = [];
    const visited = new Set<string>();
    const outgoing = new Map<string, string>();
    for (const edge of plan.definition.edges) outgoing.set(edge.source, edge.target);
    const trigger = plan.definition.nodes.find((node) => getNodeDefinition(node.type)?.kind === "trigger");
    let current = trigger?.id;
    while (current && !visited.has(current)) {
      visited.add(current);
      order.push(current);
      current = outgoing.get(current);
    }
    for (const node of plan.definition.nodes) if (!visited.has(node.id)) order.push(node.id);
    return order.map((id) => byId.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [plan.definition]);

  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">Proposed plan</h2>
          <Badge tone={isLocal ? "warning" : "success"}>{isLocal ? "Local demo planner" : "AI provider"}</Badge>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
          {isLocal
            ? "Generated deterministically without an AI provider. Review carefully — this is a heuristic draft."
            : `Generated by ${plan.model ?? "the configured AI provider"}. Review every field before saving.`}
        </p>
      </div>
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="plan-name" required>
            Automation name
          </Label>
          <Input id="plan-name" value={name} onChange={(event) => onNameChange(event.target.value)} maxLength={120} />
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-secondary">{plan.explanation}</p>

        <div>
          <p className="text-[11px] font-medium text-ink">Steps</p>
          <ol className="mt-1.5 space-y-1.5">
            {orderedNodes.map((node, index) => {
              const def = getNodeDefinition(node.type);
              const provider = providerForNode(node.type);
              return (
                <li key={node.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-app/40 px-2.5 py-2">
                  <NodeIcon type={node.type} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-medium text-ink">{node.title || def?.title || node.type}</p>
                    <p className="truncate text-[10px] text-ink-secondary">
                      {def?.kind === "trigger" ? "Trigger" : "Action"}
                      {provider ? ` · ${providerLabel(provider)}` : ""}
                    </p>
                  </div>
                  <span className="text-[10px] text-ink-secondary">#{index + 1}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {plan.requiredIntegrations.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium text-ink">Requires</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plan.requiredIntegrations.map((provider) => (
                <span key={provider} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-1 text-[10.5px] text-ink">
                  <ProviderIcon provider={provider} className="h-5 w-5 [&>svg]:h-3 [&>svg]:w-3" />
                  {providerLabel(provider)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {plan.missingConfiguration.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <p className="text-[11px] font-semibold text-amber-800">Configuration to complete</p>
            <ul className="mt-1 space-y-1">
              {plan.missingConfiguration.map((item) => (
                <li key={item} className="flex gap-1.5 text-[10.5px] leading-relaxed text-amber-800">
                  <span aria-hidden="true">•</span> {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {plan.notes.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium text-ink">Planner notes</p>
            <ul className="mt-1 space-y-1">
              {plan.notes.map((note) => (
                <li key={note} className="flex gap-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                  <span aria-hidden="true">•</span> {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button className="w-full" onClick={onCreate} loading={creating} disabled={!name.trim()}>
          <Plus size={15} /> Create draft and open editor
        </Button>
        <p className="text-center text-[10px] text-ink-secondary">Nothing is saved or activated until you click this button.</p>
      </CardBody>
    </Card>
  );
}

function TemplateStarter({ onCreated }: { onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<TemplateItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [busySlug, setBusySlug] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ items: TemplateItem[] }>("/templates");
      setItems(response.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const useTemplate = async (template: TemplateItem) => {
    setBusySlug(template.slug);
    try {
      const detail = await apiPost<WorkflowDetail & { note?: string }>(`/templates/${template.slug}/instantiate`, {});
      toast({
        title: "Template copied as a draft",
        description: "Review highlighted configuration before activating. Nothing was activated automatically.",
        variant: "success",
      });
      onCreated(detail.id);
    } catch (err) {
      toast({ title: "Could not use template", description: errorMessage(err), variant: "error" });
    } finally {
      setBusySlug(null);
    }
  };

  const filtered = items.filter((template) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.category.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Card key={item}>
            <CardBody className="space-y-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-8 w-28" />
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-ink-secondary">Templates create a new draft copy. Existing templates are never modified.</p>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates…" className="pl-8" aria-label="Search templates" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardBody className="flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Blocks size={16} />
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  <Badge tone="outline">{template.category}</Badge>
                  <Badge tone="neutral">{template.complexity}</Badge>
                  {template.demoOnly ? <Badge tone="warning">Simulation only</Badge> : null}
                </div>
              </div>
              <h3 className="mt-2.5 text-[13px] font-semibold text-ink">{template.name}</h3>
              <p className="mt-1 flex-1 text-[11px] leading-relaxed text-ink-secondary">{template.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {template.integrations.map((provider) => (
                  <span key={provider} className="inline-flex items-center gap-1 rounded border border-line bg-app/60 px-1.5 py-0.5 text-[10px] text-ink-secondary">
                    <ProviderIcon provider={provider} className="h-4 w-4 [&>svg]:h-2.5 [&>svg]:w-2.5" />
                    {providerLabel(provider)}
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-ink-secondary">{template.definition.nodes.length} steps</span>
              </div>
              <Button className="mt-3 w-full" variant="secondary" size="sm" loading={busySlug === template.slug} onClick={() => void useTemplate(template)}>
                Use template <ChevronRight size={13} />
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
      {filtered.length === 0 ? <p className="py-8 text-center text-[12px] text-ink-secondary">No templates match “{search}”.</p> : null}
    </div>
  );
}

function BlankStarter({ onCreated }: { onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState(BLANK_STARTERS[0]);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: "trigger_1",
          type: selected.type,
          title: selected.title,
          config: selected.config,
          position: { x: 80, y: 140 },
        },
      ],
      edges: [],
    };
    try {
      const detail = await apiPost<WorkflowDetail>("/workflows", {
        name: name.trim() || `Untitled ${selected.title.toLowerCase()}`,
        definition,
      });
      toast({ title: "Draft created", description: "Add an action step, then test in simulation mode.", variant: "success" });
      onCreated(detail.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardBody>
          <h2 className="text-[14px] font-semibold text-ink">Choose a starting trigger</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">
            Every workflow needs exactly one trigger. You can change it later from the node picker.
          </p>
          <div className="mt-4 space-y-2">
            {BLANK_STARTERS.map((starter) => (
              <button
                key={starter.type}
                type="button"
                onClick={() => setSelected(starter)}
                aria-pressed={selected.type === starter.type}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  selected.type === starter.type ? "border-primary bg-primary-soft/50 ring-1 ring-primary/20" : "border-line bg-white hover:bg-app",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", selected.type === starter.type ? "bg-primary text-white" : "bg-app text-ink-secondary")}>
                  {starter.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-ink">{starter.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-secondary">{starter.description}</span>
                </span>
                {selected.type === starter.type ? <Check size={15} className="ml-auto shrink-0 text-primary" /> : null}
              </button>
            ))}
          </div>
          <div className="mt-5 max-w-md">
            <Label htmlFor="blank-name">Automation name</Label>
            <Input
              id="blank-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`e.g. ${selected.title} automation`}
              maxLength={120}
            />
            <p className="hint">You can rename it any time in the editor.</p>
          </div>
          {error ? <div className="mt-3"><ErrorState description={error} /></div> : null}
          <Button className="mt-4" onClick={() => void create()} loading={creating}>
            <Workflow size={15} /> Create blank draft
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
            <FlaskConical size={14} className="text-warning" /> What happens next
          </div>
          <ol className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-ink-secondary">
            <li className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-app text-[9px] font-semibold text-ink">1</span>
              The editor opens with your trigger selected.
            </li>
            <li className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-app text-[9px] font-semibold text-ink">2</span>
              Add action steps with the node picker, then configure each one.
            </li>
            <li className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-app text-[9px] font-semibold text-ink">3</span>
              Fix validation issues and run a simulation test.
            </li>
            <li className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-app text-[9px] font-semibold text-ink">4</span>
              Activate only when you are satisfied. Live mode needs a real connection.
            </li>
          </ol>
          <Link to="/help#editor" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            Editor guide <ArrowRight size={12} />
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
