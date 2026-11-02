import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Plug, Workflow, ShieldCheck, Gauge } from "lucide-react";
import { PageHeader } from "@/components/flowmate/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help & Documentation — FlowMate AI" },
      { name: "description", content: "How FlowMate AI works, its limits and its guarantees." },
      { property: "og:title", content: "Help & Documentation — FlowMate AI" },
      { property: "og:description", content: "How FlowMate AI works, its limits and its guarantees." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});

const SECTIONS = [
  {
    icon: Workflow,
    title: "Building workflows",
    items: [
      "Create Automation → describe your task in plain language → review the AI's plan → open the editor.",
      "In the editor: drag nodes, connect outputs to inputs, and click a node to configure it in the right panel.",
      "Use {{node_id.field}} to pass data between steps — the editor warns you if a reference doesn't exist.",
      "Save often. Each save creates a version; the workflow only runs the last saved version.",
    ],
  },
  {
    icon: Gauge,
    title: "Testing and activating",
    items: [
      "Test Workflow runs the saved workflow with sample data. Results are labelled Simulation — nothing external happens.",
      "Live mode performs real actions, but only for steps whose integration is connected. Missing connections show as “Waiting” — never faked.",
      "Activation is blocked until validation passes: every required field filled, integrations connected, no loops.",
      "Schedule triggers currently run on demand only; background scheduling ships later.",
    ],
  },
  {
    icon: Plug,
    title: "Integrations",
    items: [
      "Gmail: reads messages matching your filter and sends email when a workflow includes a send step.",
      "Google Sheets: reads the latest rows, appends rows, and looks up rows by column value.",
      "Live Sheets steps need a spreadsheet ID (from the sheet's URL) in the node settings.",
      "Disconnect any time on the Integrations page — workflows fall back to waiting, not fake success.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Security & limits",
    items: [
      "Your integration credentials are stored encrypted on the server, never in your browser.",
      "The AI can only produce workflows from the supported node list — it can never run arbitrary code.",
      "Plan limits (workflows, monthly executions, AI generations) are enforced before runs happen.",
      "Execution logs are sanitized: no credentials or tokens are ever stored in history.",
    ],
  },
];

function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Help & Documentation"
        subtitle="How FlowMate works, what it can and can't do yet."
        action={<Button variant="outline" asChild><Link to="/automations/new">Create Automation</Link></Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <s.icon className="h-4.5 w-4.5 text-primary" /> {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" /> {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
