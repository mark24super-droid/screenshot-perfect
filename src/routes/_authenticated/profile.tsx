import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import { getPlan } from "@/lib/plans";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — FlowMate AI" },
      { name: "description", content: "Your FlowMate AI profile." },
      { property: "og:title", content: "Profile — FlowMate AI" },
      { property: "og:description", content: "Your FlowMate AI profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchProfile = useServerFn(getMyProfile);
  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile(), retry: 1 });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    setBusy(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    toastSuccess();
  }

  function toastSuccess() {
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    void 0;
  }

  const name = data?.profile.displayName ?? "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U";

  if (isLoading || !data) {
    return <div className="mx-auto max-w-2xl space-y-4 p-6"><Skeleton className="h-48" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader title="Profile" />

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {initials}
          </div>
          <div>
            <div className="text-lg font-semibold">{data.profile.displayName || "Unnamed user"}</div>
            <div className="text-sm text-muted-foreground">{data.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {getPlan(data.profile.planId).name} plan · workspace “{data.profile.workspaceName}” · {data.profile.timezone}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" onClick={() => setPasswordOpen(true)}>Change password</Button>
        <Button variant="outline" asChild><Link to="/settings">Edit settings</Link></Button>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            {passwordError && <p className="text-sm text-error">{passwordError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button onClick={changePassword} disabled={busy || !currentPassword || !newPassword}>
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
