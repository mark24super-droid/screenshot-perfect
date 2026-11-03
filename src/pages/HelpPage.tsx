import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  CircleHelp,
  FlaskConical,
  KeyRound,
  ListChecks,
  Play,
  ShieldCheck,
  Sparkles,
  Table2,
  Workflow,
  XCircle,
} from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, Card, CardBody } from "../components/ui/Badge";

const SECTIONS = [
  { id: "quick-start", label: "Quick start" },
  { id: "concepts", label: "Core concepts" },
  { id: "editor", label: "Workflow editor" },
  { id: "demo-mode", label: "Simulation & demo mode" },
  { id: "ai-setup", label: "AI provider setup" },
  { id: "google-setup", label: "Google OAuth setup" },
  { id: "availability", label: "Integration limits" },
  { id: "billing", label: "Plans & billing" },
  { id: "security", label: "Data & security" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export default function HelpPage() {
  return (
    <PublicLayout eyebrow="Documentation" title="Help & documentation">
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1" aria-label="Help sections">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="block rounded-md px-2 py-1.5 text-[12px] text-ink-secondary hover:bg-app hover:text-ink">
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          <section className="rounded-xl border border-primary/15 bg-primary-soft/60 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-[12px] leading-relaxed text-ink-secondary">
                <p className="font-semibold text-ink">FlowMate AI is a working automation app, not a mockup.</p>
                <p className="mt-1">
                  Workflows are stored in a database, validated against an allowlist, executed by a server-side engine, and logged at the
                  step level. Features that need external credentials are clearly labelled and disabled until configured.
                </p>
              </div>
            </div>
          </section>

          <section id="quick-start" className="scroll-mt-24">
            <SectionHeading icon={<Play size={16} />} title="Quick start" />
            <ol className="mt-3 space-y-2 text-[12px] leading-relaxed text-ink-secondary">
              <li>
                <strong className="text-ink">1. Create an automation.</strong> Describe the task with AI, use a template, or start blank
                from <Link to="/automations/new" className="font-medium text-primary hover:underline">/automations/new</Link>.
              </li>
              <li>
                <strong className="text-ink">2. Review the steps.</strong> Add or edit nodes, connect them in order, and fill required
                fields in the inspector.
              </li>
              <li>
                <strong className="text-ink">3. Fix validation issues.</strong> The editor lists blocking errors and non-blocking warnings.
                Click an issue to jump to its node.
              </li>
              <li>
                <strong className="text-ink">4. Test in simulation mode.</strong> A test creates a real execution record with deterministic
                sample data. No email is sent and no sheet is changed.
              </li>
              <li>
                <strong className="text-ink">5. Activate deliberately.</strong> Activation validates the saved version. Live mode requires
                connected accounts and a valid live validation.
              </li>
            </ol>
          </section>

          <section id="concepts" className="scroll-mt-24">
            <SectionHeading icon={<Workflow size={16} />} title="Core concepts" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Concept title="Workspace" body="Separates automations, connections, usage and execution history. Each account starts with one workspace and can create more." />
              <Concept title="Automation / workflow" body="One trigger followed by zero or more action steps. The definition is stored as versioned JSON and is always validated on the server." />
              <Concept title="Execution" body="One run of a workflow version, with a status (queued, running, succeeded, failed, cancelled) and a step log." />
              <Concept title="Connection" body="OAuth credentials for Gmail or Google Sheets, scoped to a workspace. Simulation mode does not need one." />
            </div>
          </section>

          <section id="editor" className="scroll-mt-24">
            <SectionHeading icon={<Blocks size={16} />} title="Workflow editor" />
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink-secondary">
              <p>
                Drag nodes to reposition them. Drag from a node&apos;s right handle to another node&apos;s left handle to connect steps.
                Click a node to open its inspector. Use the plus button on a node or the toolbar to open the node picker.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Feature title="Validation" body="Required fields, email formats, number ranges, variable order, missing triggers, cycles, branching and unreachable steps are checked." />
                <Feature title="Variables" body="Reference earlier outputs with {{node_id.field}}. The inspector lists available outputs for prior steps and copies them for you." />
                <Feature title="Undo / redo" body="Use the toolbar buttons or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Deletion is undoable until you reload." />
                <Feature title="Autosave" body="Autosave creates a new version only when the definition or metadata changes. The toolbar shows saving, saved and error states." />
                <Feature title="Test" body="Save, run in simulation or live mode, and watch the step log inside the dialog. You can open the full execution record afterwards." />
                <Feature title="Activate / pause" body="Activation validates the latest saved version and stores the chosen run mode. Pausing prevents manual and scheduled runs." />
              </div>
              <div className="rounded-lg border border-line bg-app/50 p-3">
                <p className="font-semibold text-ink">Model limitation</p>
                <p className="mt-0.5">
                  This release supports one trigger and a linear chain. Branching, loops, parallel paths and multiple triggers are rejected
                  by validation rather than silently ignored.
                </p>
              </div>
            </div>
          </section>

          <section id="demo-mode" className="scroll-mt-24">
            <SectionHeading icon={<FlaskConical size={16} />} title="Simulation & demo mode" />
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink-secondary">
              <p>
                <strong className="text-ink">Simulation mode</strong> executes the real engine and stores a real execution record, but node
                handlers use deterministic adapters. Gmail sends are not sent; spreadsheet writes are not written. The execution and every
                step are labelled simulation.
              </p>
              <p>
                <strong className="text-ink">Demo workspace</strong> is a separate workspace containing seeded workflows, execution history
                and demo connections. It is marked with a banner and a “DEMO MODE” label in the sidebar. Demo connections are never treated
                as real accounts.
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  No simulated action is presented as real. If you need real Gmail or Sheets actions, configure Google OAuth, connect the
                  account, choose live mode, and review the live validation before activation.
                </span>
              </div>
              <p>
                The shared demo account is intended for evaluation. Do not put confidential data in it. Create your own account for private
                workspaces.
              </p>
            </div>
          </section>

          <section id="ai-setup" className="scroll-mt-24">
            <SectionHeading icon={<Sparkles size={16} />} title="AI provider setup" />
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink-secondary">
              <p>
                AI generation uses an OpenAI-compatible chat completions endpoint on the server. Configure these environment variables and
                restart the server:
              </p>
              <CodeBlock
                lines={[
                  "AI_API_KEY=your-server-side-key",
                  "AI_BASE_URL=https://api.openai.com/v1",
                  "AI_MODEL=gpt-4o-mini",
                ]}
              />
              <p>
                <code className="font-mono text-[11px]">AI_BASE_URL</code> should be the API root (the server appends
                <code className="ml-1 font-mono text-[11px]">/chat/completions</code>). The key is never sent to the browser. Provider
                requests use JSON response formatting where supported and are validated against the allowlisted node schema.
              </p>
              <p>
                Without a key, generation uses a deterministic local demo planner and the result is labelled “Local demo planner”. AI action
                nodes use deterministic adapters in simulation mode. In live mode without a provider, AI nodes fail clearly rather than
                pretending to produce a result.
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-line bg-app/50 p-3">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                <span>
                  AI-generated code is never executed. The model can only propose allowlisted node types and field values; the server
                  sanitizes configuration and rejects unknown types.
                </span>
              </div>
            </div>
          </section>

          <section id="google-setup" className="scroll-mt-24">
            <SectionHeading icon={<KeyRound size={16} />} title="Google OAuth setup" />
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink-secondary">
              <p>Create an OAuth 2.0 Web application in Google Cloud Console and add the redirect URI that matches your deployment:</p>
              <CodeBlock
                lines={[
                  "GOOGLE_CLIENT_ID=...apps.googleusercontent.com",
                  "GOOGLE_CLIENT_SECRET=...",
                  "GOOGLE_REDIRECT_URI=https://your-domain.example/api/integrations/google/callback",
                  "TOKEN_ENCRYPTION_KEY=a-long-random-secret-for-AES-256-GCM",
                  "APP_URL=https://your-domain.example",
                ]}
              />
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Enable the Gmail API and Google Sheets API for the project.</li>
                <li>Add the exact redirect URI. A mismatch causes a token exchange failure.</li>
                <li>Set <code className="font-mono text-[11px]">TOKEN_ENCRYPTION_KEY</code> so refresh tokens are encrypted at rest.</li>
                <li>Restart the server, open Integrations, and connect each provider separately.</li>
                <li>Use “Test connection” to verify that credentials can be refreshed.</li>
              </ol>
              <p>
                Scopes are requested per provider. Gmail uses read-only access plus send; Sheets uses spreadsheet access. Disconnecting
                removes local credentials and asks Google to revoke the refresh token.
              </p>
            </div>
          </section>

          <section id="availability" className="scroll-mt-24">
            <SectionHeading icon={<Table2 size={16} />} title="Integration availability" />
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-[11.5px]">
                <thead>
                  <tr className="border-b border-line bg-app/50">
                    <th className="table-head px-3 py-2">Capability</th>
                    <th className="table-head px-3 py-2">Simulation</th>
                    <th className="table-head px-3 py-2">Live</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    ["Gmail: read latest matching email", true, true],
                    ["Gmail: send email", true, true],
                    ["Gmail: continuous inbox watching", false, false],
                    ["Sheets: append row", true, true],
                    ["Sheets: find row", true, true],
                    ["Sheets: new-row trigger", true, false],
                    ["AI: summarize / extract", true, "With AI key"],
                    ["Branching / loops", false, false],
                  ].map(([label, simulation, live]) => (
                    <tr key={String(label)}>
                      <td className="px-3 py-2 text-ink">{label}</td>
                      <td className="px-3 py-2">{simulation ? <Yes /> : <No />}</td>
                      <td className="px-3 py-2">{live === true ? <Yes /> : live === false ? <No /> : <span className="text-amber-700">{live}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-secondary">
              Gmail triggers read the newest match when a workflow runs; they do not poll continuously. Use a schedule trigger to check
              repeatedly. New-row triggers require Drive push channels and are simulation-only in this release.
            </p>
          </section>

          <section id="billing" className="scroll-mt-24">
            <SectionHeading icon={<CircleHelp size={16} />} title="Plans & billing" />
            <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-ink-secondary">
              <p>
                Free, Pro and Business plans define workflow, execution, AI generation, connection and history limits. Limits are enforced
                by the server when creating workflows, generating plans and creating executions.
              </p>
              <p>
                <strong className="text-ink">Payments are not configured.</strong> The billing page can switch plans for evaluation only. No
                card is charged, no subscription is created and no invoice is issued. In production, plan changes are blocked unless a
                payment provider is integrated.
              </p>
            </div>
          </section>

          <section id="security" className="scroll-mt-24">
            <SectionHeading icon={<ShieldCheck size={16} />} title="Data, security & retention" />
            <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-ink-secondary">
              <p>
                Passwords use scrypt hashing. Sessions are random tokens stored as hashes in the database and delivered in an httpOnly,
                SameSite=Lax cookie. Session expiry is enforced server-side. Auth and execution endpoints are rate limited.
              </p>
              <p>
                OAuth credentials are encrypted with AES-256-GCM when <code className="font-mono text-[11px]">TOKEN_ENCRYPTION_KEY</code> is
                set. Step inputs and outputs are sanitized before storage. Secrets are never included in frontend bundles.
              </p>
              <p>
                Execution history is retained according to the plan&apos;s history window. Deleting a workflow permanently removes its
                execution records as well. Account deletion is a manual request handled by the deployment operator.
              </p>
            </div>
          </section>

          <section id="troubleshooting" className="scroll-mt-24">
            <SectionHeading icon={<ListChecks size={16} />} title="Troubleshooting" />
            <div className="mt-3 space-y-2.5">
              {[
                {
                  q: "The editor says a step is not connected",
                  a: "Every non-trigger step must be reachable from the trigger through a connection. Drag from the previous step's handle to the step, or add the step with the node's plus button.",
                },
                {
                  q: "Live validation fails with integration_not_connected",
                  a: "Connect the provider in Integrations. A demo connection does not satisfy live validation. You can still test in simulation mode.",
                },
                {
                  q: "The AI generated a plan but fields are empty",
                  a: "Spreadsheet IDs and some fields cannot be inferred. Complete the highlighted configuration in the inspector. The plan is a draft, not a runnable automation.",
                },
                {
                  q: "A test execution is stuck in queued",
                  a: "The queue is in-process and SQLite-backed in this deployment. If the server restarted, unfinished runs are marked failed on startup. Start the server and check Activity History.",
                },
                {
                  q: "Schedule did not run",
                  a: "Schedules are evaluated by an in-process scheduler in UTC. The server must be running. Use a schedule trigger and verify the time and day settings.",
                },
              ].map((item) => (
                <div key={item.q} className="rounded-lg border border-line bg-white p-3">
                  <p className="text-[12px] font-semibold text-ink">{item.q}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <Card>
              <CardBody>
                <h2 className="text-[13px] font-semibold text-ink">Implemented vs credential-dependent</h2>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-success">Works without credentials</p>
                    <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-ink-secondary">
                      <li>• Accounts, sessions, workspaces and plan limits</li>
                      <li>• Visual editor, validation, versions and autosave</li>
                      <li>• Simulation execution with step logs and retries</li>
                      <li>• Local demo workflow generation</li>
                      <li>• Templates, history, dashboard and settings</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warning">Needs external credentials</p>
                    <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-ink-secondary">
                      <li>• Real Gmail reads and sends</li>
                      <li>• Real Google Sheets reads and writes</li>
                      <li>• Provider-backed AI generation and AI steps</li>
                      <li>• Encrypted token storage (needs a key)</li>
                      <li>• Email notifications (needs an email provider)</li>
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>
          </section>

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Link to="/automations/new" className="text-[12px] font-medium text-primary hover:underline">
              Create an automation
            </Link>
            <span className="text-ink-secondary">·</span>
            <Link to="/contact" className="text-[12px] font-medium text-primary hover:underline">
              Contact options
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em] text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
      {title}
    </h2>
  );
}

function Concept({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-[12px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-app/40 p-2.5">
      <p className="text-[11px] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-secondary">{body}</p>
    </div>
  );
}

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-[#211E45] p-3 font-mono text-[10.5px] leading-relaxed text-white/90">
      {lines.join("\n")}
    </pre>
  );
}

function Yes() {
  return (
    <span className="inline-flex items-center gap-1 text-success">
      <CheckCircle2 size={12} /> Yes
    </span>
  );
}

function No() {
  return (
    <span className="inline-flex items-center gap-1 text-ink-secondary">
      <XCircle size={12} /> No
    </span>
  );
}
