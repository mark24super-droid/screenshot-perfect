import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Mail, ShieldCheck } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Card, CardBody } from "../components/ui/Badge";

const UPDATED = "November 1, 2026";

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="space-y-2 text-[12.5px] leading-relaxed text-ink-secondary">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <PublicLayout eyebrow="Legal" title="Privacy policy">
      <div className="max-w-3xl space-y-6">
        <p className="text-[11px] text-ink-secondary">Last updated: {UPDATED}</p>

        <Card>
          <CardBody className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" />
            <p className="text-[12px] leading-relaxed text-ink-secondary">
              This policy describes the data FlowMate AI stores in this deployment. It is written to be accurate for this software build,
              not copied from a template. If you operate this deployment for others, you are responsible for the legal basis and notices
              required in your jurisdiction.
            </p>
          </CardBody>
        </Card>

        <LegalSection title="Data we store">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Account data: name, email address, scrypt password hash, avatar colour and preferences.</li>
            <li>Workspace data: workspace names, plan, membership role and active workspace selection.</li>
            <li>Automation data: workflow names, descriptions, versioned JSON definitions and activation state.</li>
            <li>Execution data: status, timestamps, durations, sanitized step inputs and outputs, error codes and messages.</li>
            <li>Integration data: provider, account label, granted scopes and encrypted OAuth credentials when a token key is configured.</li>
            <li>Security data: hashed session tokens, session timestamps and user-agent strings, plus account deletion requests.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Cookies and sessions">
          <p>
            FlowMate uses an httpOnly, SameSite=Lax session cookie. It is required to keep you signed in and is not used for advertising.
            OAuth connection flows use a short-lived, httpOnly state cookie to prevent cross-site request forgery.
          </p>
        </LegalSection>

        <LegalSection title="Third-party services">
          <p>
            If the operator configures Google OAuth, FlowMate exchanges OAuth tokens with Google and calls Gmail or Google Sheets only when
            a live workflow runs. If the operator configures an AI provider, prompts and workflow text may be sent to that provider for
            generation or AI steps. Simulation mode does not call Google or the AI provider.
          </p>
          <p>
            No analytics, advertising or tracking SDKs are included in this build. There is no payment provider configured, so no card data
            is collected.
          </p>
        </LegalSection>

        <LegalSection title="Retention">
          <p>
            Execution history is shown according to the plan&apos;s history window (7, 90 or 365 days). Deleting a workflow removes its
            definitions and versions but retains execution records for auditing. Account deletion requests are processed manually by the
            deployment operator; submitting a request does not immediately erase data.
          </p>
        </LegalSection>

        <LegalSection title="Your choices">
          <p>
            You can rename your profile, change preferences, revoke sessions, disconnect integrations, delete automations and request account
            deletion from Settings. The shared demo account cannot be deleted or have its password changed.
          </p>
          <p>
            To request access, correction or deletion, use the options on the{" "}
            <Link to="/contact" className="font-medium text-primary hover:underline">
              contact page
            </Link>
            . This deployment does not have a monitored contact channel configured; the operator must provide one before public use.
          </p>
        </LegalSection>

        <LegalSection title="Security">
          <p>
            Passwords use scrypt. Session tokens are stored as hashes. OAuth credentials are encrypted with AES-256-GCM. When{" "}
            <code className="font-mono text-[11px]">TOKEN_ENCRYPTION_KEY</code> is set, your own secret is used; otherwise a built-in
            development key applies and the UI warns about it. No system is perfectly secure, and this build does not claim compliance
            with any certification.
          </p>
        </LegalSection>

        <LegalSection title="Children">
          <p>FlowMate is not directed at children and should not be used by anyone under 16.</p>
        </LegalSection>
      </div>
    </PublicLayout>
  );
}

export function TermsPage() {
  return (
    <PublicLayout eyebrow="Legal" title="Terms of service">
      <div className="max-w-3xl space-y-6">
        <p className="text-[11px] text-ink-secondary">Last updated: {UPDATED}</p>

        <Card>
          <CardBody className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[12px] leading-relaxed text-ink-secondary">
              This is a software evaluation build. It is provided as-is, without warranties, and it is not a hosted commercial service
              unless an operator adopts it as one. Read these terms before connecting real accounts.
            </p>
          </CardBody>
        </Card>

        <LegalSection title="1. The service">
          <p>
            FlowMate AI lets you build, validate, test and run automations using allowlisted steps. Some capabilities require external
            credentials (Google OAuth, an AI provider, an email provider). Features that are unavailable are labelled; they are not
            simulated as if they were real.
          </p>
        </LegalSection>

        <LegalSection title="2. Accounts and workspaces">
          <p>
            You are responsible for activity under your account and for keeping your password confidential. The shared demo account is
            public to anyone with access to this deployment and must not be used for confidential data. Workspace data is scoped to the
            workspace and is visible to its members.
          </p>
        </LegalSection>

        <LegalSection title="3. Simulation versus live execution">
          <p>
            Simulation runs use deterministic adapters. They create real execution records but do not send email or modify spreadsheets.
            Live runs perform real actions when a connected account is present. You are responsible for reviewing a workflow and its
            configuration before activating it in live mode, including recipients, spreadsheet IDs and AI-generated content.
          </p>
        </LegalSection>

        <LegalSection title="4. Acceptable use">
          <p>You must not use FlowMate to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Send spam, phishing, malware or unlawful content.</li>
            <li>Access accounts or data you are not authorized to access.</li>
            <li>Circumvent rate limits, authentication, plan limits or provider terms.</li>
            <li>Store secrets in workflow fields or prompts where they do not belong.</li>
            <li>Violate Google API terms or applicable privacy and marketing laws.</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. AI-generated content">
          <p>
            AI plans are proposals. They may be incomplete, incorrect or unsuitable. The model cannot execute code and its output is
            validated against an allowlist, but you must review names, recipients, spreadsheet targets and extracted fields. No guarantee
            is made about accuracy or fitness for a particular purpose.
          </p>
        </LegalSection>

        <LegalSection title="6. Availability and data loss">
          <p>
            This deployment uses an in-process queue and scheduler backed by SQLite. Jobs do not survive a server shutdown; unfinished runs
            are marked failed on restart. There is no high-availability guarantee, backup service or SLA. Export or retain anything you
            cannot afford to lose.
          </p>
        </LegalSection>

        <LegalSection title="7. Plans and payment">
          <p>
            Plan limits are enforced, but payments are not configured. Switching plans is an evaluation action only: no charge is made, no
            subscription is created and no invoice is issued. A production operator must connect a payment provider before charging anyone.
          </p>
        </LegalSection>

        <LegalSection title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, the authors and operators of this build are not liable for indirect, incidental or
            consequential damages, lost profits, lost data, or actions taken by third-party providers. Your sole remedy is to stop using
            the software.
          </p>
        </LegalSection>

        <LegalSection title="9. Changes and termination">
          <p>
            Features and these terms may change as the software evolves. You may stop using the service at any time. Account deletion is
            processed manually by the operator, as described in the privacy policy.
          </p>
        </LegalSection>

        <LegalSection title="10. Contact">
          <p>
            This deployment has no monitored contact channel configured. Use the{" "}
            <Link to="/contact" className="font-medium text-primary hover:underline">
              contact page
            </Link>{" "}
            for what is available, and do not send passwords, API keys or OAuth tokens.
          </p>
        </LegalSection>
      </div>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout eyebrow="Support" title="Contact">
      <div className="max-w-3xl space-y-5">
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-warning">
                <Mail size={18} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">No contact channel is configured</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
                  This FlowMate deployment does not include a support inbox, ticketing integration or monitored contact form. Rather than
                  show a fake form that goes nowhere, this page states that clearly. If you operate this deployment, add a real support
                  address or helpdesk link here before inviting users.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardBody>
              <h3 className="text-[12.5px] font-semibold text-ink">Find answers first</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
                The help center covers setup, simulation versus live runs, OAuth configuration, AI provider setup, plan limits and common
                validation errors.
              </p>
              <Link to="/help" className="mt-2 inline-flex text-[11.5px] font-medium text-primary hover:underline">
                Open help center
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h3 className="text-[12.5px] font-semibold text-ink">Operators</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
                Deployment owners can add a contact method in the repository documentation and in this page. Do not publish personal
                credentials or OAuth secrets in a support message.
              </p>
              <Link to="/privacy" className="mt-2 inline-flex text-[11.5px] font-medium text-primary hover:underline">
                Read privacy policy
              </Link>
            </CardBody>
          </Card>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[11.5px] leading-relaxed text-rose-800">
          <p className="font-semibold">Never send secrets</p>
          <p className="mt-1">
            Do not include passwords, session cookies, Google client secrets, refresh tokens or API keys in any support request. FlowMate
            support should never ask for them.
          </p>
        </div>

        <Card>
          <CardBody>
            <h3 className="text-[12.5px] font-semibold text-ink">Reporting a security issue</h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
              There is no dedicated security contact configured for this build. If you deploy it publicly, provide a security reporting
              address and a response process. Do not test vulnerabilities against accounts or data you do not own.
            </p>
          </CardBody>
        </Card>
      </div>
    </PublicLayout>
  );
}
