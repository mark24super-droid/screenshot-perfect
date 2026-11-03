// Routes an authenticated user may visit before onboarding is complete.
//
// Onboarding's connect step links to /integrations and its closing note links
// to /settings — those two must not be bounced back into the setup loop.
// Everything else stays gated; matching is segment-exact and prefix-safe.
const OPEN_DURING_SETUP = ["/integrations", "/settings"];

/** True when the path must stay reachable while onboarding is incomplete. */
export function openDuringOnboarding(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return OPEN_DURING_SETUP.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );
}
