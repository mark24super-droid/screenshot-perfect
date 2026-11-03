import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, Clock, FlaskConical, LogOut, Radio, Sparkles, Workflow } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { FieldError, Input, Label, Select } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { apiPost, errorMessage } from "../../lib/api";
import { cn } from "../../lib/utils";

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const STEPS = ["Workspace", "Defaults", "Review"];

export default function OnboardingPage() {
  const { user, workspace, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = React.useState(0);
  const [workspaceName, setWorkspaceName] = React.useState(workspace?.name ?? "");
  const [timezone, setTimezone] = React.useState(user?.settings.timezone ?? "UTC");
  const [mode, setMode] = React.useState<"simulation" | "live">(user?.settings.defaultExecutionMode ?? "simulation");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const canContinue = workspaceName.trim().length >= 2;

  const handleNext = () => {
    if (step === 0 && !canContinue) {
      setError("Enter a workspace name with at least 2 characters.");
      return;
    }
    setError(null);
    setStep((value) => Math.min(2, value + 1));
  };

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiPost("/auth/onboarding", {
        workspaceName: workspaceName.trim(),
        timezone,
        defaultExecutionMode: mode,
      });
      await refresh();
      toast({ title: "Workspace ready", description: "Your defaults are saved. Build your first automation next.", variant: "success" });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-app">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
            <Workflow size={17} strokeWidth={2.2} />
          </span>
          <span className="text-[14px] font-semibold text-ink">FlowMate AI</span>
        </span>
        <span className="ml-auto hidden text-[12px] text-ink-secondary sm:inline">Setting up {user?.name}&apos;s workspace</span>
        <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
          <LogOut size={14} /> Sign out
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Setup</p>
            <ol className="mt-4 space-y-1">
              {STEPS.map((label, index) => (
                <li key={label}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2",
                      index === step ? "bg-primary-soft" : "bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        index < step
                          ? "border-success bg-success text-white"
                          : index === step
                            ? "border-primary bg-primary text-white"
                            : "border-line bg-white text-ink-secondary",
                      )}
                    >
                      {index < step ? <Check size={12} /> : index + 1}
                    </span>
                    <span className={cn("text-[12.5px] font-medium", index === step ? "text-primary" : "text-ink-secondary")}>{label}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-lg border border-line bg-white p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                <FlaskConical size={12} className="text-warning" /> Simulation first
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
                Every new workflow runs in simulation mode until you connect a real account and explicitly choose live mode.
              </p>
            </div>
          </aside>

          <section className="surface p-5 sm:p-7">
            {step === 0 ? (
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Building2 size={19} />
                </div>
                <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">Name your workspace</h1>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
                  Workspaces keep automations, connections and usage separate. You can create more later from the sidebar.
                </p>
                <div className="mt-6 max-w-md">
                  <Label htmlFor="workspace-name" required>
                    Workspace name
                  </Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => {
                      setWorkspaceName(event.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. Acme Studio"
                    maxLength={100}
                    autoFocus
                  />
                  <p className="hint">This appears in the sidebar and on execution records.</p>
                  <FieldError>{error}</FieldError>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Clock size={19} />
                </div>
                <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">Choose sensible defaults</h1>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
                  These are starting points, not permanent choices. Every workflow can override its run mode.
                </p>
                <div className="mt-6 space-y-5">
                  <div className="max-w-md">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                      {TIMEZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </Select>
                    <p className="hint">Used for display. Schedule triggers currently run in UTC and say so in the editor.</p>
                  </div>

                  <div>
                    <p className="label">Default execution mode</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setMode("simulation")}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          mode === "simulation" ? "border-primary bg-primary-soft/70 ring-1 ring-primary/20" : "border-line bg-white hover:bg-app",
                        )}
                        aria-pressed={mode === "simulation"}
                      >
                        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                          <FlaskConical size={14} /> Simulation
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-ink-secondary">
                          Deterministic sample data. No email is sent, no spreadsheet is changed.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("live")}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          mode === "live" ? "border-primary bg-primary-soft/70 ring-1 ring-primary/20" : "border-line bg-white hover:bg-app",
                        )}
                        aria-pressed={mode === "live"}
                      >
                        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                          <Radio size={14} /> Live
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-ink-secondary">
                          Real Gmail and Google Sheets actions. Requires connected accounts and explicit confirmation.
                        </span>
                      </button>
                    </div>
                    {mode === "live" ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                        You can choose live as a default, but live runs still require a connected Gmail or Google Sheets account.
                        Until then, workflows remain blocked from live execution.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Sparkles size={19} />
                </div>
                <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">Ready to build</h1>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
                  Review your setup. Nothing is activated yet — you will choose a trigger and review every step.
                </p>
                <dl className="mt-6 divide-y divide-line rounded-lg border border-line">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[12px] text-ink-secondary">Workspace</dt>
                    <dd className="truncate text-[12.5px] font-medium text-ink">{workspaceName.trim() || "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[12px] text-ink-secondary">Timezone</dt>
                    <dd className="text-[12.5px] font-medium text-ink">{timezone}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[12px] text-ink-secondary">Default mode</dt>
                    <dd className="text-[12.5px] font-medium capitalize text-ink">{mode}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[12px] text-ink-secondary">Plan</dt>
                    <dd className="text-[12.5px] font-medium capitalize text-ink">{workspace?.plan ?? "free"} (limits apply)</dd>
                  </div>
                </dl>
                <div className="mt-4 rounded-lg border border-line bg-app/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-secondary">
                  <strong className="font-semibold text-ink">Simulation is the safe default.</strong> You can test a workflow before
                  connecting anything. Live runs always require a connected account and a valid live validation.
                </div>
                {error ? <FieldError>{error}</FieldError> : null}
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {step > 0 ? (
                <Button variant="secondary" onClick={() => setStep((value) => value - 1)} disabled={saving}>
                  <ArrowLeft size={15} /> Back
                </Button>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                {step < 2 ? (
                  <Button onClick={handleNext} disabled={step === 0 && !canContinue}>
                    Continue <ArrowRight size={15} />
                  </Button>
                ) : (
                  <Button onClick={() => void handleSubmit()} loading={saving}>
                    <Sparkles size={15} /> Finish setup
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
