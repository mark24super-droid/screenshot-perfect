import * as React from "react";
import { Link } from "react-router-dom";
import { Compass, Home, LayoutDashboard } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Compass size={26} />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">This page does not exist</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
          The link may be outdated, or the page may have moved. Nothing was changed.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to={user ? "/dashboard" : "/"}>
            <Button>
              <LayoutDashboard size={15} /> {user ? "Open dashboard" : "Back to home"}
            </Button>
          </Link>
          <Link to="/help">
            <Button variant="secondary">
              <Home size={15} /> Visit help center
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
