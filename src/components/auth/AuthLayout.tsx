import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Lock, Mail, Sparkles, Table2, Workflow } from "lucide-react";
import { NodeIcon } from "../../lib/icons";

export function AuthLayout({
  children,
  heading,
  subheading,
  footer,
}: {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] bg-white">
      <div className="flex w-full flex-col px-5 py-6 sm:px-8 lg:w-[54%] lg:px-14 xl:px-20">
        <Link to="/" className="inline-flex w-fit items-center gap-2.5" aria-label="FlowMate AI home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
            <Workflow size={17} strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">FlowMate AI</span>
        </Link>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">{heading}</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">{subheading}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-[12px] text-ink-secondary">{footer}</div>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-wrap gap-x-4 gap-y-1 pb-2 text-[11px] text-ink-secondary">
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link to="/help" className="hover:text-ink">
            Help
          </Link>
          <span className="ml-auto">Simulation-first automation</span>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-[#211E45] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 500px at 75% 0%, rgba(99,91,235,0.55), transparent 60%), radial-gradient(600px 400px at 0% 100%, rgba(67,135,232,0.28), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/80">
            <Sparkles size={12} /> AI workflow builder
          </span>
          <h2 className="mt-7 max-w-md text-[32px] font-semibold leading-[1.15] tracking-[-0.03em] text-white">
            Turn a sentence into an automation you can see, test and trust.
          </h2>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-white/65">
            Describe the job in plain language. FlowMate proposes a workflow using only approved Gmail, Google Sheets and AI
            steps — then you review every detail before anything runs.
          </p>
        </div>

        <div className="relative my-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Simulation run · 3 steps · no real actions
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                { type: "gmail.new_email", title: "New invoice email", meta: "Gmail · is:unread subject:invoice" },
                { type: "ai.extract", title: "Extract invoice data", meta: "AI · 4 fields requested" },
                { type: "google_sheets.add_row", title: "Save to Invoices", meta: "Google Sheets · 4 columns" },
              ].map((node, index) => (
                <div key={node.type} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5">
                  <NodeIcon type={node.type} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-white">{node.title}</p>
                    <p className="truncate text-[10px] text-white/50">{node.meta}</p>
                  </div>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{index === 0 ? "Trigger" : "Action"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative space-y-3">
          {[
            { icon: <Check size={14} />, text: "Only allowlisted steps can ever run. AI never executes code." },
            { icon: <Lock size={14} />, text: "OAuth tokens stay server-side, encrypted when a key is configured." },
            { icon: <Table2 size={14} />, text: "Every run is labelled simulation or live, with step-level logs." },
          ].map((item) => (
            <div key={item.text} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-white/70">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
                {item.icon}
              </span>
              {item.text}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function DemoAccessNote() {
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
      <strong className="font-semibold">Shared demo account.</strong> The demo workspace contains sample workflows and simulated
      history. No real email is sent and no spreadsheet is changed.
    </div>
  );
}

export function SocialProofRow() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-secondary">
      <span className="inline-flex items-center gap-1.5">
        <Mail size={12} /> Gmail
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Table2 size={12} /> Google Sheets
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Sparkles size={12} /> AI steps
      </span>
      <Link to="/templates" className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
        Browse templates <ArrowRight size={12} />
      </Link>
    </div>
  );
}
