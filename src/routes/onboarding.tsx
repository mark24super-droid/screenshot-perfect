import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Loader2,
  Mail,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateMyProfile, updateMyWorkspaceName } from "@/lib/profile.functions";
import { getIntegrationStatuses } from "@/lib/oauth.functions";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Welcome — FlowMate AI" },
      { name: "description", content: "Set up your workspace and first automation." },
      { property: "og:title", content: "Welcome — FlowMate AI" },
      { property: "og:description", content: "Set up your workspace and first automation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const STEPS = ["Your workspace", "Defaults", "Connect apps"];

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const updateWorkspace = useServerFn(updateMyWorkspaceName);
  const fetchStatuses = useServerFn(getIntegrationStatuses);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile(), retry: 1 });
  const statusQuery = useQuery({ queryKey: ["integration-statuses"], queryFn: () => fetchStatuses(), retry: 1 });

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [mode, setMode] = useState<"simulation" | "live">("simulation");
  const [initialised, setInitialised] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileQuery.data || initialised) return;
    setDisplayName(profileQuery.data.profile.displayName);
    setWorkspaceName(profileQuery.data.profile.workspaceName);
    setTimezone(profileQuery.data.profile.timezone);
    setMode(profileQuery.data.profile.defaultTestMode);
    setInitialised(true);
  }, [profileQuery.data, initialised]);

  const finish = useMutation({
    mutationFn: async () => {
      const current = profileQuery.data?.profile;
      if (workspaceName.trim() && current && workspaceName.trim() !== current.workspaceName) {
        await updateWorkspace({ data: { name: workspaceName.trim() } });
      }
      await updateProfile({
        data: {
          displayName: displayName.trim(),
          timezone,
          defaultTestMode: mode,
          onboardingCompleted: true,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("You're all set. Welcome to FlowMate AI.");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not finish setup."),
  });

  function next() {
    setError(null);
    if (step === 0 && (!displayName.trim() || !workspaceName.trim())) {
      setError("Add your name and a workspace name to continue.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const statuses = statusQuery.data;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <FlowMateLogo className="h-10 w-10" />
          <h1 className="text-xl font-semibold">Welcome to FlowMate AI</h1>
          <p className="text-sm text-muted-foreground">Two quick details, then you can build your first automation.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`hidden text-xs sm:block ${i === step ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 && <div className="h-px w-5 bg-border" />}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            {step === 0 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Your name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    maxLength={80}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Smith"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workspaceName">Workspace name</Label>
                  <Input
                    id="workspaceName"
                    value={workspaceName}
                    maxLength={80}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Acme Studio"
                  />
                  <p className="text-xs text-muted-foreground">Shown in the sidebar. You can rename it later in Settings.</p>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label>Default test mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as "simulation" | "live")}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simulation">Simulation (recommended)</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Simulations use sample data and never touch real accounts. Live mode performs real actions only after
                    you connect an app.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Preferred time zone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-xs">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Connections are optional right now. You can build and run clearly-labelled simulations without them,
                    then connect Gmail or Google Sheets when you want live actions.
                  </span>
                </div>
                {[
                  { id: "google_mail" as const, name: "Gmail", icon: Mail, desc: "Read matching email and send messages." },
                  { id: "google_sheets" as const, name: "Google Sheets", icon: FileSpreadsheet, desc: "Read, append and look up rows." },
                ].map((item) => {
                  const connected = statuses?.[item.id]?.status === "connected";
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {item.name}
                          <Badge variant="outline" className={connected ? "text-success" : "text-muted-foreground"}>
                            {connected ? "Connected" : "Not connected"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/integrations">
                          {connected ? "Manage" : <><Plug className="h-3.5 w-3.5" /> Connect</>}
                        </Link>
                      </Button>
                    </div>
                  );
                })}
                <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Credentials are stored encrypted on the server. You can disconnect at any time from Integrations.</span>
                </div>
              </>
            )}

            {error && <p className="rounded-md border border-error/30 bg-error/5 p-2.5 text-xs text-error">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div>
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={finish.isPending}>
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={finish.isPending || !initialised}
                  onClick={() => finish.mutate()}
                >
                  Skip for now
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button size="sm" onClick={next} disabled={!initialised}>
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => finish.mutate()} disabled={finish.isPending || !initialised}>
                    {finish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Go to dashboard
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can change all of this later in <Link to="/settings" className="text-primary hover:underline">Settings</Link>.
        </p>
      </div>
    </div>
  );
}
