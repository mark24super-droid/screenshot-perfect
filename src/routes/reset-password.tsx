import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — FlowMate AI" },
      { name: "description", content: "Set a new password for your FlowMate AI account." },
      { property: "og:title", content: "Reset password — FlowMate AI" },
      { property: "og:description", content: "Set a new password for your FlowMate AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryHash, setRecoveryHash] = useState(false);

  useEffect(() => {
    // Recovery links land with type=recovery in the URL hash.
    const hash = window.location.hash;
    setRecoveryHash(hash.includes("type=recovery"));
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <FlowMateLogo className="h-10 w-10" />
          <span className="text-lg font-semibold">Set a new password</span>
        </div>
        <form onSubmit={handleReset} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          {!recoveryHash && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground">
              Open the reset link we emailed you first — this page sets a new password once the link
              has signed you in. Need a link?{" "}
              <Link to="/login" className="text-primary underline">Start from sign-in</Link>.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" required autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
