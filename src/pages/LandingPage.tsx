import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock,
  GitBranch,
  History,
  KeyRound,
  Lock,
  Mail,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  Table2,
  Unplug,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { PLAN_LIST } from "@shared/plans";
import { NodeIcon } from "../lib/icons";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#examples", label: "Examples" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="FlowMate AI home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
        <Workflow size={17} strokeWidth={2.2} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">FlowMate AI</span>
    </Link>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Marketing">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-[13px] text-ink-secondary transition-colors hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">
                    Start Building Free <ArrowRight size={14} />
                  </Button>
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="ml-auto rounded-md p-2 text-ink-secondary hover:bg-app sm:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="border-t border-line bg-white px-4 py-3 sm:hidden">
            <nav className="flex flex-col gap-1" aria-label="Marketing mobile">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-2 py-2 text-sm text-ink-secondary hover:bg-app hover:text-ink"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex gap-2">
              <Link to={user ? "/dashboard" : "/login"} className="flex-1">
                <Button variant="secondary" className="w-full" size="sm">
                  {user ? "Dashboard" : "Log in"}
                </Button>
              </Link>
              <Link to={user ? "/dashboard" : "/signup"} className="flex-1">
                <Button className="w-full" size="sm">
                  Start free
                </Button>
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line bg-app">
          <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <Badge tone="purple" className="mx-auto mb-5 px-2.5 py-1">
                <Sparkles size={12} /> AI-powered visual automation
              </Badge>
              <h1 className="text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[52px]">
                Automate Your Work.
                <br className="hidden sm:block" /> Without Writing Code.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-relaxed text-ink-secondary sm:text-[16px]">
                Describe what you want to automate. FlowMate AI turns your instructions into visual workflows that help you
                get repetitive work done.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <Link to={user ? "/automations/new" : "/signup"} className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto">
                    Start Building Free <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to={user ? "/templates" : "/signup?next=%2Ftemplates"} className="w-full sm:w-auto">
                  <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                    Explore Templates
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-ink-secondary">
                No credit card required · Simulation mode included · No AI provider required for the demo planner
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-6xl">
              <HeroPreview />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title="From a sentence to a working automation"
            description="FlowMate keeps the process visual and reviewable. Nothing is activated until you confirm the configuration."
          />
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <Sparkles size={18} />,
                title: "Describe your task",
                text: "Explain the repetitive work in plain language. Add examples of the fields you care about.",
              },
              {
                icon: <GitBranch size={18} />,
                title: "Let AI create the workflow",
                text: "FlowMate proposes a trigger and action steps using only supported, allowlisted nodes.",
              },
              {
                icon: <Blocks size={18} />,
                title: "Connect your apps",
                text: "Link Gmail and Google Sheets with OAuth, or keep everything in clearly labelled simulation mode.",
              },
              {
                icon: <Play size={18} />,
                title: "Test and activate",
                text: "Run a sample, inspect each step, fix validation issues, then activate when you are ready.",
              },
            ].map((step, index) => (
              <div key={step.title} className="surface relative p-5">
                <span className="absolute right-4 top-4 text-[11px] font-semibold text-line">0{index + 1}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{step.icon}</span>
                <h3 className="mt-3 text-[14px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="scroll-mt-20 border-y border-line bg-app py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Example automations"
              title="Start with work you already repeat"
              description="Every example can be opened as a template, reviewed, and tested with sample data."
            />
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: <Mail size={17} />,
                  title: "Email to spreadsheet",
                  text: "Extract invoice details from matching Gmail messages and append a row.",
                  tag: "Gmail · AI · Sheets",
                },
                {
                  icon: <Zap size={17} />,
                  title: "Lead capture and notification",
                  text: "Read a form submission, extract contact fields, and prepare a confirmation.",
                  tag: "AI · Gmail",
                },
                {
                  icon: <Clock size={17} />,
                  title: "Daily summary report",
                  text: "Read recent emails on a schedule, summarize them, and prepare a report.",
                  tag: "Schedule · Gmail · AI",
                },
                {
                  icon: <Table2 size={17} />,
                  title: "Spreadsheet validation",
                  text: "Check new rows for missing required fields and alert the right person.",
                  tag: "Sheets · Logic · Gmail",
                },
              ].map((example) => (
                <div key={example.title} className="surface p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary ring-1 ring-line">{example.icon}</span>
                  <h3 className="mt-3 text-[13.5px] font-semibold text-ink">{example.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">{example.text}</p>
                  <p className="mt-3 text-[10.5px] font-medium uppercase tracking-wide text-ink-secondary/80">{example.tag}</p>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Link to={user ? "/templates" : "/signup?next=%2Ftemplates"} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
                Browse the template library <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading eyebrow="Core benefits" title="Built for people who do not write code" align="left" />
              <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-ink-secondary">
                The editor is visual, the configuration is human-readable, and every run leaves a trace you can inspect.
                FlowMate favors reliability and clarity over automation buzzwords.
              </p>
              <div className="mt-6 space-y-2.5">
                {[
                  { icon: <BadgeCheck size={16} />, title: "No coding required", text: "Configure steps through forms, dropdowns and readable variable references." },
                  { icon: <Workflow size={16} />, title: "Visual workflows", text: "Drag rectangular nodes on a dotted canvas and connect them in a clear order." },
                  { icon: <Blocks size={16} />, title: "Connected applications", text: "Gmail and Google Sheets use official OAuth with minimum required scopes." },
                  { icon: <History size={16} />, title: "Execution history and error details", text: "See node-level status, durations, sanitized inputs and outputs." },
                  { icon: <ShieldCheck size={16} />, title: "Human-readable configuration", text: "No generated code, SQL or shell commands are ever executed." },
                ].map((benefit) => (
                  <div key={benefit.title} className="flex gap-3 rounded-lg border border-line bg-white p-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">{benefit.icon}</span>
                    <div>
                      <p className="text-[12.5px] font-medium text-ink">{benefit.title}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">{benefit.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-[12px] font-medium text-ink">Invoice emails to Google Sheets</span>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
              <div className="dot-grid relative h-[320px] p-5">
                <div className="space-y-3">
                  {[
                    { type: "gmail.new_email", title: "New invoice email", note: "Query: is:unread subject:invoice", state: "Succeeded" },
                    { type: "ai.extract", title: "Extract invoice fields", note: "invoice_number, vendor, amount, due_date", state: "Succeeded" },
                    { type: "google_sheets.add_row", title: "Save to Invoices sheet", note: "4 column mappings configured", state: "Simulated" },
                  ].map((node, index) => (
                    <div key={node.title} className="relative ml-2 max-w-[330px] rounded-lg border border-line bg-white p-3 shadow-card">
                      {index < 2 ? <span className="absolute -bottom-3 left-5 h-3 w-px bg-line" aria-hidden="true" /> : null}
                      <div className="flex items-center gap-2.5">
                        <NodeIcon type={node.type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-ink">{node.title}</p>
                          <p className="truncate text-[10.5px] text-ink-secondary">{node.note}</p>
                        </div>
                        <Badge tone={node.state === "Succeeded" ? "success" : "info"}>{node.state}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute bottom-4 right-4 rounded-lg border border-line bg-white px-3 py-2 text-[10.5px] text-ink-secondary shadow-card">
                  <p className="font-medium text-ink">Execution summary</p>
                  <p>3 of 3 steps · 1.2s · simulation</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="border-y border-line bg-app py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <SectionHeading eyebrow="Trust & control" title="You stay in control of every permission" align="left" />
                <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
                  FlowMate requests only the scopes needed for the steps you configure. Access tokens stay on the server and
                  are never stored in the browser. You can disconnect an integration at any time.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge tone="success"><Lock size={11} /> Server-side tokens</Badge>
                  <Badge tone="info"><KeyRound size={11} /> Minimum scopes</Badge>
                  <Badge tone="neutral"><Unplug size={11} /> Disconnect anytime</Badge>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: <ShieldCheck size={16} />, title: "Permissions are explicit", text: "Gmail read/send and Sheets access are requested per integration, with the exact scopes shown on the Integrations page." },
                  { icon: <Unplug size={16} />, title: "Disconnect when you want", text: "Disconnecting removes stored local credentials and attempts to revoke the Google grant." },
                  { icon: <Play size={16} />, title: "Nothing runs by default", text: "Generated workflows are drafts. Activation requires passing validation and an explicit confirmation." },
                  { icon: <Lock size={16} />, title: "No generated code execution", text: "AI output is validated against an allowlist of node types and sanitized configuration fields." },
                ].map((item) => (
                  <div key={item.title} className="surface p-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">{item.icon}</span>
                    <h3 className="mt-2.5 text-[12.5px] font-semibold text-ink">{item.title}</h3>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Pricing preview"
            title="Plans with real, published limits"
            description="No unlimited promises. Limits are enforced in the product and visible in Billing & Usage. Payments are not configured in this deployment."
          />
          <div className="mt-9 grid gap-3 lg:grid-cols-3">
            {PLAN_LIST.map((plan) => (
              <div
                key={plan.id}
                className={`surface relative flex flex-col p-5 ${plan.highlighted ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
              >
                {plan.highlighted ? (
                  <Badge tone="purple" className="absolute right-4 top-4">
                    Most popular
                  </Badge>
                ) : null}
                <h3 className="text-[15px] font-semibold text-ink">{plan.name}</h3>
                <p className="mt-1 min-h-[34px] text-[11.5px] leading-relaxed text-ink-secondary">{plan.tagline}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-[28px] font-semibold tracking-tight text-ink">${plan.priceMonthlyUsd}</span>
                  <span className="pb-1 text-[11px] text-ink-secondary">/ month</span>
                </div>
                <div className="mt-4 space-y-2 border-t border-line pt-4">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-[12px] text-ink-secondary">
                      <Check size={13} className="mt-0.5 shrink-0 text-success" />
                      {feature}
                    </div>
                  ))}
                </div>
                <Link to={user ? "/billing" : "/signup"} className="mt-5">
                  <Button variant={plan.highlighted ? "primary" : "secondary"} className="w-full">
                    {plan.id === "free" ? "Start free" : "Choose " + plan.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-secondary">
            <CircleDollarSign size={12} /> Prices and limits are configurable. No payment is processed in this demo deployment.
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line bg-app py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="FAQ" title="Questions people ask before automating" />
            <div className="mt-8 space-y-2">
              {[
                {
                  q: "Do I need to know how to code?",
                  a: "No. You build with visual nodes, forms and plain-language variables like {{gmail_new_email.subject}}. FlowMate does not execute generated code.",
                },
                {
                  q: "Which integrations are supported?",
                  a: "Gmail and Google Sheets are the initial integrations, plus AI summarize/extract steps, filters and a delay utility. More integrations can be added through the node registry and handler pattern.",
                },
                {
                  q: "Do I need my own API credentials?",
                  a: "For live Gmail and Sheets actions, the server needs Google OAuth credentials (client ID and secret). For AI generation, the server can use an OpenAI-compatible API key. Without them, simulation mode and the local demo planner still work.",
                },
                {
                  q: "How is my data secured?",
                  a: "Passwords are hashed with scrypt, sessions use httpOnly cookies, Google tokens are encrypted on the server, and every workspace resource is checked server-side. Secrets are never sent to the browser.",
                },
                {
                  q: "What happens when a workflow fails?",
                  a: "The execution is recorded with the failing node, a user-facing error, duration and sanitized input/output. Transient Google errors are retried a bounded number of times; unsafe duplicate side effects are not automatically retried.",
                },
                {
                  q: "Is there a free plan?",
                  a: "Yes. The Free plan includes 3 automations, 100 executions and 20 AI generations per month. Paid plan limits are published on the Billing page and are not unlimited.",
                },
              ].map((item) => (
                <details key={item.q} className="group surface px-4 py-3 open:shadow-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] font-medium text-ink">
                    {item.q}
                    <ChevronDown size={15} className="shrink-0 text-ink-secondary transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-ink-secondary">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-5 rounded-xl border border-line bg-primary-soft/50 p-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">Ready to automate your first task?</h2>
              <p className="mt-1 text-[12.5px] text-ink-secondary">Start with a template or describe your own workflow. Review everything before activating.</p>
            </div>
            <div className="flex gap-2">
              <Link to={user ? "/automations/new" : "/signup"}>
                <Button>Start Building Free</Button>
              </Link>
              <Link to={user ? "/templates" : "/signup?next=%2Ftemplates"}>
                <Button variant="secondary">Explore Templates</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[11.5px] leading-relaxed text-ink-secondary">
              AI-powered visual automation for individuals, freelancers and small teams. Describe the work; review the workflow.
            </p>
          </div>
          <FooterColumn
            title="Product"
            links={[
              { label: "Templates", to: "/signup?next=%2Ftemplates" },
              { label: "Pricing", to: "/signup" },
              { label: "Log in", to: "/login" },
              { label: "Create account", to: "/signup" },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: "Documentation", to: "/help" },
              { label: "Demo mode", to: "/help#demo-mode" },
              { label: "Integration setup", to: "/help#integrations" },
              { label: "FAQ", to: "/#faq" },
            ]}
          />
          <FooterColumn
            title="Legal & contact"
            links={[
              { label: "Privacy policy", to: "/privacy" },
              { label: "Terms of service", to: "/terms" },
              { label: "Contact", to: "/contact" },
            ]}
          />
        </div>
        <div className="border-t border-line px-4 py-4 text-center text-[10.5px] text-ink-secondary sm:px-6">
          © {new Date().getFullYear()} FlowMate AI. Demo deployment — no real company address or contact details are published.
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">{title}</h2>
      {description ? <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-secondary">{description}</p> : null}
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">{title}</p>
      <ul className="mt-2.5 space-y-1.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link to={link.to} className="text-[11.5px] text-ink-secondary hover:text-ink">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-pop">
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-sidebar px-3">
        <span className="h-2 w-2 rounded-full bg-[#f0b6b6]" />
        <span className="h-2 w-2 rounded-full bg-[#f3d9a4]" />
        <span className="h-2 w-2 rounded-full bg-[#b9e3cc]" />
        <span className="mx-auto rounded-md border border-line bg-white px-6 py-0.5 text-[9px] text-ink-secondary">
          app.flowmate.local/automations/invoice-emails
        </span>
        <span className="w-8" />
      </div>
      <div className="flex min-h-[360px]">
        <div className="hidden w-[168px] shrink-0 border-r border-line bg-sidebar p-2.5 md:block">
          <div className="flex items-center gap-1.5 px-1 py-1">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-white"><Workflow size={11} /></span>
            <span className="text-[10px] font-semibold text-ink">FlowMate AI</span>
          </div>
          <div className="mt-2 rounded-md border border-line bg-white px-2 py-1.5">
            <p className="text-[8px] font-medium text-ink">Acme Studio</p>
            <p className="text-[7px] text-ink-secondary">Pro plan</p>
          </div>
          <div className="mt-2 h-6 rounded-md bg-primary text-center text-[8px] font-medium leading-6 text-white">+ Create Automation</div>
          <p className="mt-3 px-1 text-[7px] font-semibold tracking-wider text-ink-secondary">MAIN</p>
          {[
            ["Dashboard", false],
            ["Automations", true],
            ["Templates", false],
            ["Activity History", false],
          ].map(([label, active]) => (
            <div key={String(label)} className={`mt-0.5 rounded px-1.5 py-1 text-[8px] ${active ? "bg-primary-soft text-primary" : "text-ink-secondary"}`}>
              {label}
            </div>
          ))}
          <p className="mt-3 px-1 text-[7px] font-semibold tracking-wider text-ink-secondary">MANAGE</p>
          {["Integrations", "Connections"].map((label) => (
            <div key={label} className="mt-0.5 rounded px-1.5 py-1 text-[8px] text-ink-secondary">{label}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-9 items-center gap-2 border-b border-line px-3">
            <span className="text-[9px] text-ink-secondary">←</span>
            <span className="text-[9px] font-medium text-ink">Invoice emails to Google Sheets</span>
            <Badge tone="success" className="text-[7px]">Active</Badge>
            <span className="ml-auto rounded-md bg-primary px-2 py-1 text-[7px] font-medium text-white">Save</span>
          </div>
          <div className="dot-grid relative min-h-[300px] overflow-hidden p-4">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <path d="M 220 88 C 260 88, 250 148, 292 148" stroke="#c3c0f0" strokeWidth="1.4" fill="none" />
              <path d="M 462 148 C 502 148, 492 88, 534 88" stroke="#c3c0f0" strokeWidth="1.4" fill="none" />
            </svg>
            <div className="relative flex flex-wrap items-start gap-x-10 gap-y-6 lg:flex-nowrap">
              <MiniNode type="gmail.new_email" title="New invoice email" subtitle="Gmail · is:unread" badge="Trigger" className="lg:mt-10" />
              <MiniNode type="ai.extract" title="Extract invoice data" subtitle="4 fields requested" badge="AI" />
              <MiniNode type="google_sheets.add_row" title="Save to Invoices" subtitle="4 column mappings" badge="Action" className="lg:mt-10" />
            </div>
            <div className="absolute bottom-3 left-4 flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[7px] text-ink-secondary">
              <span className="h-1 w-1 rounded-full bg-success" /> Simulation run succeeded · 3 steps
            </div>
          </div>
        </div>
        <div className="hidden w-[190px] shrink-0 border-l border-line bg-white p-3 lg:block">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-secondary">Inspector</p>
          <div className="mt-2 flex items-center gap-1.5">
            <NodeIcon type="ai.extract" size="sm" />
            <div>
              <p className="text-[9px] font-medium text-ink">Extract invoice data</p>
              <p className="text-[7px] text-ink-secondary">AI · action</p>
            </div>
          </div>
          <p className="mt-3 text-[7px] font-medium text-ink">Source text</p>
          <div className="mt-1 rounded border border-line bg-app px-1.5 py-1 text-[7px] text-ink-secondary">{"{{gmail_new_email.body}}"}</div>
          <p className="mt-2 text-[7px] font-medium text-ink">Fields</p>
          <div className="mt-1 rounded border border-line bg-app px-1.5 py-1 text-[7px] text-ink-secondary">invoice_number, amount…</div>
          <p className="mt-2 text-[7px] font-medium text-ink">Outputs</p>
          <div className="mt-1 space-y-1">
            {["invoice_number", "amount", "due_date"].map((field) => (
              <div key={field} className="flex items-center justify-between rounded bg-primary-soft/60 px-1.5 py-1 text-[7px] text-primary">
                <span>{field}</span>
                <span>copy</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-line bg-app p-1.5">
            <p className="text-[7px] font-medium text-ink">Validation</p>
            <p className="mt-0.5 text-[7px] text-success">All required fields configured</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniNode({
  type,
  title,
  subtitle,
  badge,
  className,
}: {
  type: string;
  title: string;
  subtitle: string;
  badge: string;
  className?: string;
}) {
  return (
    <div className={`w-[190px] shrink-0 rounded-lg border border-line bg-white p-2.5 shadow-card ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <NodeIcon type={type} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[9px] font-medium text-ink">{title}</p>
          <p className="truncate text-[7px] text-ink-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="rounded bg-app px-1 py-0.5 text-[6.5px] text-ink-secondary">{badge}</span>
        <span className="flex items-center gap-0.5 text-[6.5px] text-success"><Check size={7} /> Configured</span>
      </div>
    </div>
  );
}
