import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  FileSpreadsheet,
  Sparkles,
  Workflow,
  ShieldCheck,
  History,
  Plug,
  Bot,
  FileText,
  Lock,
  Play,
  ChevronDown,
  Bell,
  Search,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { PLANS } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowMate AI — Automate Your Work Without Writing Code" },
      {
        name: "description",
        content:
          "Describe what you want to automate in plain language. FlowMate AI turns your instructions into visual workflows that connect Gmail, Google Sheets and AI steps.",
      },
      { property: "og:title", content: "FlowMate AI — Automate Your Work Without Writing Code" },
      {
        property: "og:description",
        content:
          "Describe a task in plain language and FlowMate AI builds a visual workflow you can test, activate and trust.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const HOW_IT_WORKS = [
  { icon: FileText, title: "Describe your task", body: "Type what you want automated in plain language — no blocks to wire by hand unless you want to." },
  { icon: Bot, title: "Let AI create the workflow", body: "FlowMate turns your instruction into a structured, validated workflow you can review." },
  { icon: Plug, title: "Connect your apps", body: "Link Gmail and Google Sheets with your own secure authorization. Simulations run until you do." },
  { icon: Play, title: "Test and activate", body: "Run the workflow on sample data first. Activate it only when every step is configured." },
];

const EXAMPLES = [
  { icon: Mail, title: "Email to spreadsheet", body: "New invoice emails are scanned, details extracted, and rows appended to a sheet." },
  { icon: Bell, title: "Lead capture & notification", body: "Form leads are validated, saved, and a confirmation email is prepared." },
  { icon: Sparkles, title: "Daily summary report", body: "Recent messages are condensed into a short digest each morning." },
  { icon: FileSpreadsheet, title: "Form submission follow-up", body: "Every submission is stored and answered with a follow-up email." },
];

const BENEFITS = [
  { icon: Workflow, title: "No coding required", body: "Build automations by describing them. The visual editor stays editable and human-readable." },
  { icon: History, title: "Execution history", body: "Every run is recorded with per-node status, duration and clear error details." },
  { icon: ShieldCheck, title: "Human-readable configuration", body: "Each node shows exactly what it does with your data — no hidden scripts." },
  { icon: Lock, title: "Your accounts, your control", body: "Integrations use your own authorization and can be disconnected at any time." },
];

const FAQS = [
  { q: "Do I need to know how to code?", a: "No. You describe what you want in plain language, and FlowMate builds a visual workflow you can review and adjust. Every node shows its settings in simple fields." },
  { q: "Which integrations are supported?", a: "The first release supports Gmail and Google Sheets, plus built-in AI steps for summarizing and extracting data. More integrations can be added over time." },
  { q: "Do I need API credentials?", a: "No API keys to manage. You connect your own Google account once, securely, and can disconnect it at any time from the Integrations page." },
  { q: "Is my data secure?", a: "Your connection credentials are stored server-side in encrypted form, never in your browser. Workflows only run the steps you configure and nothing is executed from AI output." },
  { q: "What happens when a workflow fails?", a: "Every execution is recorded. The history view shows exactly which node failed, why, and a plain-language explanation so you can fix and retry." },
  { q: "How much does it cost?", a: "There's a Free plan with monthly limits, and paid plans with higher allowances. Limits are shown honestly on the pricing page — no unlimited promises." },
];

function EditorPreviewMock() {
  return (
    <div className="mx-auto mt-12 w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-error/70" />
          <div className="h-2 w-2 rounded-full bg-warning/70" />
          <div className="h-2 w-2 rounded-full bg-success/70" />
        </div>
        <div className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" /> Search nodes
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">Test</span>
          <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">Publish</span>
        </div>
      </div>
      <div className="flex min-h-[340px]">
        {/* sidebar */}
        <div className="hidden w-40 flex-col gap-1 border-r border-border bg-sidebar p-2 sm:flex">
          <div className="mb-2 flex items-center gap-2 px-1">
            <FlowMateLogo className="h-5 w-5" />
            <span className="text-[11px] font-semibold">FlowMate AI</span>
          </div>
          {[
            { icon: LayoutDashboard, label: "Dashboard" },
            { icon: Workflow, label: "Automations" },
            { icon: Zap, label: "Templates" },
            { icon: History, label: "History" },
            { icon: Plug, label: "Integrations" },
          ].map((item, i) => (
            <div key={item.label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${i === 1 ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"}`}>
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </div>
          ))}
        </div>
        {/* canvas */}
        <div className="canvas-grid-dots relative flex-1 p-6">
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-2">
            <span className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">Save</span>
            <span className="rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-medium">Test Workflow</span>
          </div>
          <div className="mx-auto flex w-fit flex-col items-center gap-3 pt-10">
            <NodeMock icon={Play} title="Manual Trigger" sub="Start this workflow" status="success" />
            <div className="h-6 w-px bg-border" />
            <NodeMock icon={Sparkles} title="AI: Extract Data" sub="Pull out the fields you need" status="success" />
            <div className="h-6 w-px bg-border" />
            <NodeMock icon={FileSpreadsheet} title="Google Sheets: Add Row" sub="Append the results" status="warning" />
          </div>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-[9px] text-muted-foreground">
            100% · Fit
          </span>
        </div>
        {/* inspector */}
        <div className="hidden w-44 flex-col gap-3 border-l border-border p-3 md:flex">
          <div className="text-[11px] font-semibold">Node Settings</div>
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Spreadsheet</div>
            <div className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-[10px]">Leads 2026</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Row values</div>
            {["Name", "Email", "Company"].map((f) => (
              <div key={f} className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-[10px]">{f}</div>
            ))}
          </div>
          <div className="mt-auto rounded-md bg-primary px-2 py-1.5 text-center text-[10px] font-medium text-primary-foreground">Save node</div>
        </div>
      </div>
    </div>
  );
}

function NodeMock({ icon: Icon, title, sub, status }: { icon: typeof Play; title: string; sub: string; status: "success" | "warning" }) {
  return (
    <div className="flex w-64 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${status === "success" ? "bg-accent" : "bg-warning/15"}`}>
        <Icon className={`h-4 w-4 ${status === "success" ? "text-primary" : "text-warning"}`} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{title}</div>
        <div className="truncate text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <CheckCircle2 className={`ml-auto h-4 w-4 ${status === "success" ? "text-success" : "text-warning"}`} />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <FlowMateLogo className="h-7 w-7" />
            <span className="text-base font-semibold">FlowMate AI</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#templates" className="hover:text-foreground">Templates</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Start Building Free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-powered no-code automation
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Automate Your Work.{" "}
          <span className="text-primary">Without Writing Code.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Describe what you want to automate. FlowMate AI turns your instructions into visual
          workflows that help you get repetitive work done.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/signup">
              Start Building Free <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#templates">Explore Templates</a>
          </Button>
        </div>
        <EditorPreviewMock />
      </section>

      {/* how it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
        <p className="mt-2 text-center text-muted-foreground">Four steps from idea to a running automation.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                <step.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="mt-3 text-xs font-semibold text-primary">STEP {i + 1}</div>
              <div className="mt-1 font-semibold">{step.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* examples */}
      <section id="templates" className="border-y border-border bg-card/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Example automations</h2>
          <p className="mt-2 text-center text-muted-foreground">Start from a template, or describe your own.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <div key={ex.title} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <ex.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{ex.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{ex.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* benefits */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Why teams pick FlowMate</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                <b.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">{b.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* trust */}
        <div className="mt-10 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-success" /> What FlowMate can and can't do with your accounts
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Connect Gmail and Google Sheets with your own secure authorization — and disconnect anytime.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Integrations request only the permissions their steps need, and show you exactly what they are.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Workflows never execute until they are configured, tested, and switched on by you.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Simulated runs are always clearly labelled — FlowMate never pretends a real email was sent.</li>
          </ul>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-y border-border bg-card/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Simple, honest pricing</h2>
          <p className="mt-2 text-center text-muted-foreground">Monthly limits that are enforced, not guessed.</p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`rounded-xl border bg-card p-6 ${plan.id === "pro" ? "border-primary shadow-lg" : "border-border"}`}>
                {plan.id === "pro" && (
                  <span className="mb-2 inline-block rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Most popular</span>
                )}
                <div className="text-lg font-semibold">{plan.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.priceLabel}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" variant={plan.id === "pro" ? "default" : "outline"} asChild>
                  <Link to="/signup">{plan.id === "free" ? "Start free" : `Choose ${plan.name}`}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-8">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium sm:text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground">
          <h2 className="text-2xl font-bold sm:text-3xl">Your first automation is one sentence away.</h2>
          <p className="mx-auto mt-2 max-w-xl text-primary-foreground/80">
            Describe the task. Review the workflow. Test it with sample data — free.
          </p>
          <Button size="lg" variant="secondary" className="mt-6" asChild>
            <Link to="/signup">Start Building Free <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <FlowMateLogo className="h-6 w-6" />
              <span className="font-semibold">FlowMate AI</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              AI-powered visual automation for individuals, freelancers and small teams.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">Product</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#how-it-works" className="hover:text-foreground">How it works</a></li>
              <li><a href="#templates" className="hover:text-foreground">Templates</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
              <li><Link to="/signup" className="hover:text-foreground">Get started</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold">Legal</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><span className="cursor-default">Privacy policy</span></li>
              <li><span className="cursor-default">Terms of service</span></li>
              <li><span className="cursor-default">Documentation (coming soon)</span></li>
              <li><span className="cursor-default">Contact: via your workspace settings</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} FlowMate AI. Workflow simulations are always labelled — never presented as real external actions.
        </div>
      </footer>
    </div>
  );
}
