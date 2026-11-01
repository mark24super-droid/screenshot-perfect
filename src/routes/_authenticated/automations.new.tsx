import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Zap,
  Workflow as WorkflowIcon,
  Sparkles,
  ArrowRight,
  Loader2,
  FileSpreadsheet,
  Mail,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { createWorkflow, listTemplates, instantiateTemplate } from "@/lib/workflows.functions";
import { generateWorkflow, type GeneratedPlan } from "@/lib/ai.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NODE_SPECS, INTEGRATION_LABELS, type NodeType } from "@/lib/workflow-schema";

export const Route = createFileRoute("/_authenticated/automations/new")({
  head: () => ({
    meta: [
      { title: "Create Automation — FlowMate AI" },
      { name: "description", content: "Describe your task and let AI build the workflow." },
      { property: "og:title", content: "Create Automation — FlowMate AI" },
      { property: "og:description", content: "Describe your task and let AI build the workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateAutomationPage,
});

const EXAMPLE_PROMPTS = [
  "When I receive a new email with an invoice, extract the invoice details and save them to Google Sheets.",
  "Save each new lead from my contact form into a spreadsheet and prepare a confirmation email.",
  "Summarize my latest support messages into a short report.",
  "Extract contact details from any text I paste and organize them.",
];

type Mode = "choose" | "ai" | "template" | "manual";

function CreateAutomationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createWorkflow);
  const generate = useServerFn(generateWorkflow);
  const fetchTemplates = useServerFn(listTemplates);
  const useTemplateFn = useServerFn(instantiateTemplate);

  const [mode, setMode] = useState<Mode>("choose");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates(), retry: 1 });

  const generateMutation = useMutation({
    mutationFn: (p: string) => generate({ data: { prompt: p } }),
    onSuccess: (res) => {
      if (res.ok) {
        setPlan(res.plan);
        setClarification(res.plan.clarification);
        setAiError(null);
      } else {
        setAiError(res.error);
        setClarification(res.clarification ?? null);
      }
    },
    onError: (e) => setAiError(e instanceof Error ? e.message : "Generation failed."),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description: string; definition?: unknown }) =>
      create({ data: input as never }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Workflow saved as a draft. Configure it in the editor.");
      navigate({ to: "/automations/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the workflow."),
  });

  const templateMutation = useMutation({
    mutationFn: (slug: string) => useTemplateFn({ data: { slug } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Template copied — finish configuring it in the editor.");
      navigate({ to: "/automations/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not use this template."),
  });

  async function startManual() {
    // Empty workflow with a starter manual trigger so the editor has a canvas.
    await createMutation.mutateAsync({
      name: "New Automation",
      description: "",
      definition: {
        nodes: [
          { id: "trigger_1", type: "manual.trigger", config: {}, position: { x: 80, y: 180 } },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
  }

  if (plan) {
    const d = plan.definition;
    const triggerNode = d.nodes.find((n) => n.type.endsWith(".trigger"));
    const actionNodes = d.nodes.filter((n) => !n.type.endsWith(".trigger"));
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader title="Review your workflow" subtitle="Check the plan before saving — nothing runs until you activate it." />
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Workflow title</div>
              <div className="mt-1 text-lg font-semibold">{plan.name}</div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            </div>

            {clarification && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>One quick question</AlertTitle>
                <AlertDescription>{clarification}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Steps</div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2.5 text-sm">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <div>
                  <span className="font-medium">{triggerNode ? NODE_SPECS[triggerNode.type as NodeType].label : "Trigger"}</span>
                  <span className="block text-xs text-muted-foreground">Starts the workflow</span>
                </div>
              </div>
              {actionNodes.map((n, i) => (
                <div key={n.id}>
                  <div className="ml-4 h-4 w-px bg-border" />
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    <div>
                      <span className="font-medium">{NODE_SPECS[n.type as NodeType].label}</span>
                      <span className="block text-xs text-muted-foreground">{NODE_SPECS[n.type as NodeType].short}</span>
                    </div>
                    <span className="ml-auto text-[10px] text-muted-foreground">Step {i + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-surface-muted p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Plain-language summary</div>
              <p className="mt-1">{plan.explanation}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {plan.requiredIntegrations.length === 0 ? (
                <Badge variant="outline" className="text-success">No external integrations needed</Badge>
              ) : (
                plan.requiredIntegrations.map((i) => (
                  <Badge key={i} variant="outline" className="flex items-center gap-1">
                    {i === "google_mail" ? <Mail className="h-3 w-3" /> : <FileSpreadsheet className="h-3 w-3" />}
                    Uses {INTEGRATION_LABELS[i]}
                  </Badge>
                ))
              )}
            </div>

            {plan.missingConfiguration.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Needs configuration before it can run</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-4">
                    {plan.missingConfiguration.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  You can save it as a draft and fill these in the editor.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              createMutation.mutate({ name: plan.name, description: plan.description, definition: plan.definition })
            }
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Open Workflow Editor
          </Button>
          <Button variant="outline" onClick={() => setPlan(null)}>Start over</Button>
        </div>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          title="Describe what you want to automate"
          subtitle="Plain language is fine — FlowMate turns it into a visual workflow."
          action={<Button variant="outline" onClick={() => setMode("choose")}>Back</Button>}
        />
        <Card>
          <CardContent className="space-y-3 p-6">
            <Textarea
              className="min-h-32 text-base"
              placeholder="Tell FlowMate what you want to automate..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
            />
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Examples — click to use:</div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    {ex.length > 70 ? ex.slice(0, 70) + "…" : ex}
                  </button>
                ))}
              </div>
            </div>
            {aiError && (
              <Alert variant="destructive">
                <AlertTitle>Couldn't build the workflow</AlertTitle>
                <AlertDescription>{aiError}</AlertDescription>
              </Alert>
            )}
            <Button
              className="w-full sm:w-auto"
              onClick={() => generateMutation.mutate(prompt)}
              disabled={prompt.trim().length < 8 || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Building your workflow…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Build with AI</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "template") {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          title="Start from a template"
          subtitle="Pre-built workflows you can adapt."
          action={<Button variant="outline" onClick={() => setMode("choose")}>Back</Button>}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {(templatesQuery.data ?? []).map((t) => (
            <Card key={t.slug}>
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <Badge variant="outline" className="w-fit text-[10px]">{t.category}</Badge>
                <div className="font-medium">{t.name}</div>
                <p className="flex-1 text-sm text-muted-foreground">{t.description}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => templateMutation.mutate(t.slug)} disabled={templateMutation.isPending}>
                  Use Template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title="Create Automation"
        subtitle="Three ways to start."
        action={<Button variant="outline" asChild><Link to="/automations">Back to list</Link></Button>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={() => setMode("ai")}
          className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 font-semibold">Build with AI</div>
          <p className="mt-1 text-sm text-muted-foreground">Describe your task in plain language.</p>
        </button>
        <button
          onClick={() => setMode("template")}
          className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 font-semibold">Start from a template</div>
          <p className="mt-1 text-sm text-muted-foreground">Pick a ready-made workflow.</p>
        </button>
        <button
          onClick={startManual}
          disabled={createMutation.isPending}
          className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <WorkflowIcon className="h-5 w-5 text-primary" />}
          </div>
          <div className="mt-3 font-semibold">Build manually</div>
          <p className="mt-1 text-sm text-muted-foreground">Start with an empty canvas.</p>
        </button>
      </div>
    </div>
  );
}
