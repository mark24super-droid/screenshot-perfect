import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import { AppShell } from "@/components/flowmate/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Client-only gate (ssr: false): the session lives in browser storage.
    // Protected server functions re-validate the bearer token independently.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login" });
    }
    // New accounts finish a short setup first. If the profile call fails we
    // let the app load rather than locking the user out of their workspace.
    try {
      const profile = await getMyProfile();
      if (!profile.profile.onboardingCompleted) {
        throw redirect({ to: "/onboarding" });
      }
    } catch (err) {
      if (isRedirect(err)) throw err;
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
