import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, MailCheck, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — FlowMate AI" },
      { name: "description", content: "Request a reset link or set a new password for your FlowMate AI account." },
      { property: "og:title", content: "Reset password — FlowMate AI" },
      { property: "og:description", content: "Request a reset link or set a new password for your FlowMate AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

type Mode = "request" | "sent" | "update";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Recovery links land with type=recovery in the URL hash; the SDK has
    // already exchanged that for a temporary session by the time we render.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type%3Drecovery")) {
      setMode("update");
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode("update");
    });
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(
        resetError.message.toLowerCase().includes("rate limit")
          ? "Too many reset emails were requested. Wait a few minutes and try again."
          : resetError.message,
      );
      return;
    }
    setMode("sent");
  }

  async function updatePassword(e: React.FormEvent) {
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
      setError(
        updateError.message.toLowerCase().includes("session")
          ? "This reset link has expired. Request a new one below."
          : updateError.message,
      );
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
          <span className="text-lg font-semibold">
            {mode === "update" ? "Set a new password" : "Reset your password"}
          </span>
          <span className="text-center text-sm text-muted-foreground">
            {mode === "update"
              ? "Choose a new password for your account."
              : "We'll email you a secure link to reset it."}
          </span>
        </div>

        {mode === "sent" ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <MailCheck className="mx-auto h-10 w-10 text-success" />
            <h1 className="mt-4 text-lg font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, a reset link is on
              its way. The link expires after a short time.
            </p>
            <Button variant="outline" className="mt-6 w-full" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full text-xs"
              onClick={() => {
                setMode("request");
                setError(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form
            onSubmit={mode === "update" ? updatePassword : requestLink}
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            {mode === "update" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="email">Account email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-error/30 bg-error/5 p-2.5 text-xs text-error">
                {error}
                {mode === "update" && (
                  <button
                    type="button"
                    className="ml-1 underline"
                    onClick={() => {
                      setMode("request");
                      setError(null);
                    }}
                  >
                    Request a new link
                  </button>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "update" ? (
                <KeyRound className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {mode === "update" ? "Update password" : "Send reset link"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
