import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Workflow,
  Zap,
  History,
  Plug,
  Settings,
  CreditCard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  LogOut,
  User,
  HelpCircle,
} from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { FlowMateLogo } from "@/components/flowmate/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlan } from "@/lib/plans";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/automations", label: "Automations", icon: Workflow },
      { to: "/templates", label: "Templates", icon: Zap },
      { to: "/history", label: "Activity History", icon: History },
    ],
  },
  {
    label: "Manage",
    items: [{ to: "/integrations", label: "Integrations", icon: Plug }],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings", label: "General Settings", icon: Settings },
      { to: "/billing", label: "Billing & Usage", icon: CreditCard },
      { to: "/help", label: "Help & Documentation", icon: HelpCircle },
    ],
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "U";
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profileQuery = useProfile();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={`flex items-center gap-2 px-3 pb-3 pt-4 ${collapsed ? "justify-center px-2" : ""}`}>
        <FlowMateLogo className="h-8 w-8 shrink-0" />
        {!collapsed && <span className="truncate text-sm font-semibold">FlowMate AI</span>}
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-xs hover:bg-accent/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {profileQuery.data?.profile.workspaceName ?? "Workspace"}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">Personal workspace</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuItem disabled className="justify-between">
                <span className="truncate">{profileQuery.data?.profile.workspaceName ?? "Workspace"}</span>
                <span className="text-[10px] text-muted-foreground">Current</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">Manage workspace</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="px-3 pb-2">
        <Button className={`w-full ${collapsed ? "px-0" : ""}`} asChild>
          <Link to="/automations/new" onClick={onNavigate}>
            {collapsed ? <Plus className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Create Automation</>}
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    } ${collapsed ? "justify-center px-2" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {profileQuery.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-accent/50 ${collapsed ? "justify-center" : ""}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(profileQuery.data?.profile.displayName ?? "U")}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {profileQuery.data?.profile.displayName ?? "Account"}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {getPlan(profileQuery.data?.profile.planId).name} plan
                    </span>
                  </span>
                )}
                {!collapsed && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-52">
              <DropdownMenuLabel>{profileQuery.data?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile"><User className="h-4 w-4" /> Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings"><Settings className="h-4 w-4" /> Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/billing"><CreditCard className="h-4 w-4" /> Billing & Usage</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                await supabaseSignOut();
              }}>
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

async function supabaseSignOut() {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.auth.signOut();
  window.location.href = "/login";
}

function useProfile() {
  const fetchProfile = useServerFn(getMyProfile);
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    retry: 1,
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  // Persist the collapse preference on desktop.
  useEffect(() => {
    const stored = window.localStorage.getItem("flowmate-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    if (!isMobile) window.localStorage.setItem("flowmate-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed, isMobile]);

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-3">
          <div className="flex items-center gap-2">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarNav collapsed={false} onNavigate={() => setDrawerOpen(false)} />
              </SheetContent>
            </Sheet>
            <FlowMateLogo className="h-7 w-7" />
            <span className="text-sm font-semibold">FlowMate AI</span>
          </div>
          <Button size="sm" asChild>
            <Link to="/automations/new">
              <Plus className="h-4 w-4" /> New
            </Link>
          </Button>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 h-screen shrink-0 border-r border-border transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-[228px]"
        }`}
      >
        <SidebarNav collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      {(() => {
        void navigate; void toast;
        return null;
      })()}
    </div>
  );
}
