import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  Menu,
  X,
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
  { icon: Bot, title: "Lead capture & notification", body: "Form leads are validated, saved, and a confirmation email is prepared." },
  { icon: Sparkles, title: "Daily summary report", body: "Recent messages are condensed into a short digest you review each morning." },
  { icon: FileSpreadsheet, title: "Spreadsheet data validation", body: "New rows are checked for missing required fields and flagged for follow-up." },
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
    <div className="mx-auto mt-14 w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex h-9 items-center justify-between border-b border-border bg-surface-muted/50 px-3">
        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
          flowmate.ai/automations/invoices
        </span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Test</span>
          <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Activate</span>
        </div>
      </div>
      <div className="flex min-h-[320px]">
        {/* node palette */}
        <div className="hidden w-40 flex-col border-r border-border bg-sidebar p-2 sm:flex">
          <div className="mb-2 flex items-center gap-2 px-1">
            <FlowMateLogo className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Workflow Builder</span>
          </div>
          {[
            { icon: Play, label: "Triggers" },
            { icon: Mail, label: "Gmail" },
            { icon: FileSpreadsheet, label: "Sheets" },
            { icon: Bot, label: "AI Tools" },
            { icon: Zap, label: "Logic" },
          ].map((item, i) => (
            <div key={item.label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"}`}>
              <item.icon className="h-3 w-3" /> {item.label}
            </div>
          ))}
        </div>
        {/* canvas */}
        <div className="canvas-grid-dots relative flex-1 p-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-3 pt-8">
            <NodeMock icon={Play} title="Manual Trigger" sub="Start with sample data" status="success" />
            <div className="h-5 w-px bg-border" />
            <NodeMock icon={Bot} title="AI: Extract Data" sub="Pull out invoice fields" status="success" />
            <div className="h-5 w-px bg-border" />
            <NodeMock icon={FileSpreadsheet} title="Google Sheets: Add Row" sub="Append the results" status="pending" />
          </div>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-0.5 text-[9px] text-muted-foreground">
            100% · Fit
          </span>
        </div>
        {/* inspector */}
        <div className="hidden w-44 flex-col gap-3 border-l border-border p-3 md:flex">
          <div className="text-[11px] font-semibold">Step settings</div>
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Spreadsheet ID</div>
            <div className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-[10px] text-muted-foreground">1AbC…x9K</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Column values</div>
            {["Invoice Number", "Amount", "Date"].map((f) => (
              <div key={f} className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-[10px]">{f}</div>
            ))}
          </div>
          <div className="mt-auto rounded-md border border-primary/30 bg-accent px-2 py-1.5 text-center text-[10px] font-medium text-primary">
            Ready to test
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeMock({ icon: Icon, title, sub, status }: { icon: typeof Play; title: string; sub: string; status: "success" | "pending" }) {
  return (
    <div className="flex w-60 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${status === "success" ? "bg-accent" : "bg-warning/10"}`}>
        <Icon className={`h-3.5 w-3.5 ${status === "success" ? "text-primary" : "text-warning"}`} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{title}</div>
        <div className="truncate text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <CheckCircle2 className={`ml-auto h-3.5 w-3.5 ${status === "success" ? "text-success" : "hidden text-warning"}`} />
      {status === "pending" && <span className="ml-auto h-3.5 w-3.5 rounded-full border-2 border-warning/50" />}
    </div>
  );
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const freePlan = PLANS.find((p) => p.id === "free")!;

  return (
    <div className="min-h-screen bg-background">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <FlowMateLogo className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">FlowMate AI</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#templates" className="transition-colors hover:text-foreground">Templates</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="hidden items-center gap-1.5 md:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">Start building free</Link>
            </Button>
          </div>
          {/* mobile nav */}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-border bg-card px-4 pb-4 pt-2 md:hidden">
            <div className="flex flex-col">
              {[
                { href: "#how-it-works", label: "How it works" },
                { href: "#templates", label: "Templates" },
                { href: "#pricing", label: "Pricing" },
                { href: "#faq", label: "FAQ" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-2 py-2.5 text-sm text-foreground hover:bg-accent"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="mt-2 flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" className="flex-1" asChild>
                <Link to="/signup">Start building free</Link>
              </Button>
            </div>
          </nav>
        )}
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-14 text-center sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-powered no-code automation
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Describe the work.{" "}
          <span className="text-primary">FlowMate builds the workflow.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Turn plain-language instructions into validated, visual workflows that connect
          Gmail, Google Sheets and AI steps — then test before anything runs live.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/signup">
              Start building free <ArrowRight className="ml-0.5 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#templates">Explore templates</a>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Free plan includes {freePlan.features[0]} and {freePlan.features[1]} — enforced by the product, not guessed.
        </p>
        <EditorPreviewMock />
      </section>

      {/* how it works */}
      <section id="how-it-works" className="border-t border-border bg-card py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-xl">
            <div className="text-xs font-medium uppercase tracking-wider text-primary">How it works</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Four steps from idea to a running automation</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">0{i + 1}</span>
                </div>
                <div className="mt-4 font-medium">{step.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* templates */}
      <section id="templates" className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <div className="text-xs font-medium uppercase tracking-wider text-primary">Templates</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Start from a proven example</h2>
            <p className="mt-2 text-muted-foreground">Every one of these ships inside the app as a configurable template — describe your own if none fit.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/signup">Get started free</Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <div key={ex.title} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                <ex.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="font-medium">{ex.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ex.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* benefits + trust */}
      <section className="border-t border-border bg-card py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Why teams pick FlowMate</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <b.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{b.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* trust */}
          <div className="mt-10 rounded-xl border border-border bg-surface-muted/40 p-6">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-5 w-5 text-success" /> What FlowMate can and can't do with your accounts
            </div>
            <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Connect Gmail and Google Sheets with your own secure authorization — and disconnect anytime.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Integrations request only the permissions their steps need, and always show you exactly what they are.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Workflows never execute until they are configured, tested, and switched on by you.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Simulated runs are clearly labelled — FlowMate never pretends a real email was sent.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-xl">
          <div className="text-xs font-medium uppercase tracking-wider text-primary">Pricing</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Simple, honest pricing</h2>
          <p className="mt-2 text-muted-foreground">Monthly limits that are enforced by the product, not guessed.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border bg-card p-6 ${
                plan.id === "pro" ? "border-primary/50 ring-1 ring-primary/20" : "border-border"
              }`}
            >
              {plan.id === "pro" && (
                <span className="absolute right-5 top-5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground">Most popular</span>
              )}
              <div className="text-base font-medium">{plan.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{plan.priceLabel}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" variant={plan.id === "pro" ? "default" : "outline"} asChild>
                <Link to="/signup">{plan.id === "free" ? "Start free" : `Choose ${plan.name}`}</Link>
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Paid-plan checkout is on the roadmap; every account starts on Free today.
        </p>
      </section>

      {/* faq */}
      <section id="faq" className="border-t border-border bg-card py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-sm font-medium sm:text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16">
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your first automation is one sentence away.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Describe the task. Review the workflow. Test it with sample data — free.
          </p>
          <Button size="lg" className="mt-7" asChild>
            <Link to="/signup">Start building free <ArrowRight className="ml-0.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <FlowMateLogo className="h-5 w-5" />
              <span className="text-sm font-semibold">FlowMate AI</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered visual automation for individuals, freelancers and small teams.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium">Product</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#how-it-works" className="hover:text-foreground">How it works</a></li>
              <li><a href="#templates" className="hover:text-foreground">Templates</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
              <li><Link to="/signup" className="hover:text-foreground">Get started</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium">Legal</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><span>Privacy policy — coming soon</span></li>
              <li><span>Terms of service — coming soon</span></li>
              <li><Link to="/help" className="hover:text-foreground">Help &amp; documentation</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
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
