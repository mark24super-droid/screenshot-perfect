import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import { openDuringOnboarding } from "@/lib/onboarding-gate";
import { AppShell } from "@/components/flowmate/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Client-only gate (ssr: false): the session lives in browser storage.
    // Protected server functions re-validate the bearer token independently.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login" });
    }
    // New accounts finish a short setup first. Integrations and Settings stay
    // reachable because onboarding links to them (connect step + closing
    // note); every other protected page funnels back until setup is done.
    const openDuringSetup = openDuringOnboarding(location.pathname);
    try {
      const profile = await getMyProfile();
      if (!profile.profile.onboardingCompleted && !openDuringSetup) {
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
