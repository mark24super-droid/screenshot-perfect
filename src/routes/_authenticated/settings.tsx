import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyProfile, updateMyProfile, updateMyWorkspaceName } from "@/lib/profile.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FlowMate AI" },
      { name: "description", content: "Workspace, defaults and notification settings." },
      { property: "og:title", content: "Settings — FlowMate AI" },
      { property: "og:description", content: "Workspace, defaults and notification settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const TIMEZONES = ["UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

function SettingsPage() {
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const updateWorkspace = useServerFn(updateMyWorkspaceName);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile(), retry: 1 });

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: (patch: Parameters<typeof update>[0]["data"]) => update({ data: patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Settings saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed."),
  });

  if (isLoading || !data) {
    return <div className="mx-auto max-w-3xl space-y-4 p-6">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const p = data.profile;
  const dn = displayName ?? p.displayName;
  const wn = workspaceName ?? p.workspaceName;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="General Settings" subtitle="Your profile, workspace and workflow defaults." />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={dn} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={data.email} disabled />
            <p className="text-xs text-muted-foreground">Your sign-in email. Contact support to change it.</p>
          </div>
          <Button
            size="sm"
            disabled={dn.trim() === p.displayName || !dn.trim() || saveProfile.isPending}
            onClick={() => saveProfile.mutate({ displayName: dn.trim() })}
          >
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Workspace</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspaceName">Workspace name</Label>
            <Input id="workspaceName" value={wn} onChange={(e) => setWorkspaceName(e.target.value)} maxLength={80} />
          </div>
          <Button
            size="sm"
            disabled={wn.trim() === p.workspaceName || !wn.trim() || saveProfile.isPending}
            onClick={() => saveProfile.mutate({ workspaceName: wn.trim() })}
          >
            Save workspace
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Workflow defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Default test mode</Label>
            <Select value={p.defaultTestMode} onValueChange={(v) => saveProfile.mutate({ defaultTestMode: v as "simulation" | "live" })}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simulation">Simulation (recommended)</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Simulation uses sample data and clearly labels every result. Live mode performs real actions.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Preferred time zone (for schedules)</Label>
            <Select value={p.timezone} onValueChange={(v) => saveProfile.mutate({ timezone: v })}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Email me when an execution fails</div>
              <p className="text-xs text-muted-foreground">A short message with the failed step and reason.</p>
            </div>
            <Switch
              checked={p.notifyExecutionFailures}
              onCheckedChange={(v) => saveProfile.mutate({ notifyExecutionFailures: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Weekly usage summary</div>
              <p className="text-xs text-muted-foreground">Executions and AI generations vs. your plan limits.</p>
            </div>
            <Switch
              checked={p.notifyWeeklySummary}
              onCheckedChange={(v) => saveProfile.mutate({ notifyWeeklySummary: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Security & data</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Connected accounts</span>
            <Button size="sm" variant="outline" asChild><Link to="/integrations">Manage</Link></Button>
          </div>
          <Separator />
          <div>
            <span className="font-medium">Delete account</span>
            <p className="text-xs text-muted-foreground">
              To request deletion of your account and data, contact the workspace owner. Workflows and history are removed with it.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
