import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui/Badge";
import { Workflow } from "lucide-react";

export function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <Workflow size={22} />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <Spinner /> Loading FlowMate…
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, allowIncompleteOnboarding = false }: { children: React.ReactNode; allowIncompleteOnboarding?: boolean }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <AppLoading />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (!allowIncompleteOnboarding && !user.settings.onboardingCompleted && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading />;
  if (user) {
    const params = new URLSearchParams(location.search);
    return <Navigate to={params.get("next") || "/dashboard"} replace />;
  }
  return <>{children}</>;
}
