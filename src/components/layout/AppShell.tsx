import * as React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, FlaskConical, Menu, Search, User, LogOut, Settings, CreditCard, CircleHelp, LayoutDashboard } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { Avatar } from "../ui/Misc";
import { DropdownMenu } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { apiGet } from "../../lib/api";
import type { ExecutionListResponse } from "../../lib/types";
import { cn } from "../../lib/utils";

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/automations\/new/, "New automation"],
  [/^\/automations\/[^/]+/, "Workflow editor"],
  [/^\/automations/, "Automations"],
  [/^\/templates/, "Templates"],
  [/^\/history\/[^/]+/, "Execution details"],
  [/^\/history/, "Activity History"],
  [/^\/integrations/, "Integrations"],
  [/^\/connections/, "Connections"],
  [/^\/settings\/notifications/, "Notifications"],
  [/^\/settings\/workspace/, "Workspace settings"],
  [/^\/settings/, "General settings"],
  [/^\/billing/, "Billing & usage"],
  [/^\/profile/, "Profile"],
];

function pageTitle(pathname: string): string {
  return PAGE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "FlowMate AI";
}

export const ShellContext = React.createContext<{ openMobileNav: () => void }>({ openMobileNav: () => undefined });

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem("fm_sidebar_collapsed") === "1");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { workspace, user } = useAuth();
  const location = useLocation();
  const isEditor = /^\/automations\/[^/]+$/.test(location.pathname) && location.pathname !== "/automations/new";

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleCollapse = () => {
    setCollapsed((value) => {
      localStorage.setItem("fm_sidebar_collapsed", value ? "0" : "1");
      return !value;
    });
  };

  return (
    <ShellContext.Provider value={{ openMobileNav: () => setMobileOpen(true) }}>
      <div className="flex h-[100dvh] overflow-hidden bg-app">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {!isEditor ? <AppHeader onOpenMenu={() => setMobileOpen(true)} /> : null}
          {!isEditor && workspace?.isDemo ? <DemoBanner /> : null}
          <main className={cn("min-h-0 flex-1", isEditor ? "overflow-hidden" : "overflow-y-auto")} id="main-content">
            <Outlet />
          </main>
        </div>
      </div>
      {/* Screen-reader-only workspace marker for context */}
      <span className="sr-only">Current workspace: {workspace?.name}. Signed in as {user?.name}.</span>
    </ShellContext.Provider>
  );
}

function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { workspace, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = React.useState("");
  const [failedCount, setFailedCount] = React.useState(0);
  const title = pageTitle(location.pathname);

  React.useEffect(() => {
    let cancelled = false;
    apiGet<ExecutionListResponse>("/executions?status=failed&limit=1")
      .then((response) => {
        if (!cancelled) setFailedCount(response.total);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      navigate("/automations");
      return;
    }
    navigate(`/automations?search=${encodeURIComponent(trimmed)}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-white px-3 sm:px-5">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-2 text-ink-secondary hover:bg-app lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>
      <div className="hidden min-w-0 items-center gap-1.5 text-[12px] text-ink-secondary sm:flex">
        <Link to="/dashboard" className="flex items-center gap-1.5 hover:text-ink" aria-label="Dashboard">
          <LayoutDashboard size={13} />
          <span className="max-w-[150px] truncate">{workspace?.name}</span>
        </Link>
        <ChevronRight size={12} className="text-line" />
        <span className="truncate font-medium text-ink">{title}</span>
      </div>
      <span className="truncate text-[13px] font-semibold text-ink sm:hidden">{title}</span>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <form onSubmit={handleSearch} className="relative hidden md:block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search automations…"
            aria-label="Search automations"
            className="h-8 w-[210px] pl-8 text-[12px] lg:w-[260px]"
          />
        </form>
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => navigate("/automations")} aria-label="Search automations" title="Search automations">
          <Search size={16} />
        </Button>
        <button
          type="button"
          onClick={() => navigate("/history?status=failed")}
          className="relative rounded-md p-2 text-ink-secondary hover:bg-app"
          aria-label={`Notifications: ${failedCount} failed executions`}
          title="View failed executions"
        >
          <Bell size={17} />
          {failedCount > 0 ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> : null}
        </button>
        <DropdownMenu
          trigger={
            <span className="flex items-center rounded-full p-0.5 hover:bg-app" title="Open user menu">
              <Avatar name={user?.name ?? "User"} color={user?.avatarColor} size="sm" />
            </span>
          }
          items={[
            { label: "Profile", icon: <User size={14} />, onClick: () => navigate("/profile") },
            { label: "Settings", icon: <Settings size={14} />, onClick: () => navigate("/settings") },
            { label: "Billing & usage", icon: <CreditCard size={14} />, onClick: () => navigate("/billing") },
            { label: "Help & documentation", icon: <CircleHelp size={14} />, onClick: () => navigate("/help") },
            { label: "Sign out", icon: <LogOut size={14} />, onClick: () => void handleLogout(), danger: true, separatorBefore: true },
          ]}
          width="w-52"
          label="Open user menu"
        />
      </div>
    </header>
  );
}

export function DemoBanner() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-200/70 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
      <FlaskConical size={12} className="shrink-0" />
      <strong className="font-semibold">DEMO MODE</strong>
      <span className="truncate">
        Sample workspace and simulated execution history. Simulated runs never send email or write to spreadsheets.
      </span>
      <Link to="/help#demo-mode" className="ml-auto hidden shrink-0 font-medium underline-offset-2 hover:underline sm:inline">
        How demo data works
      </Link>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5">{eyebrow}</div> : null}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description ? <div className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-secondary">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8", className)}>{children}</div>;
}
