import * as React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  Building2,
  ChevronsUpDown,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  User,
  Workflow,
  X,
  Check,
  FlaskConical,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/Misc";
import { DropdownMenu } from "../ui/Dropdown";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Label } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { apiPost, errorMessage } from "../../lib/api";

const NAV_GROUPS = [
  {
    label: "MAIN",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/automations", label: "Automations", icon: Workflow },
      { to: "/templates", label: "Templates", icon: Blocks },
      { to: "/history", label: "Activity History", icon: Activity },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/connections", label: "Connections", icon: SlidersHorizontal },
      { to: "/settings/workspace", label: "Workspace", icon: Building2 },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { to: "/settings", label: "General Settings", icon: Settings },
      { to: "/settings/notifications", label: "Notifications", icon: Bell },
      { to: "/billing", label: "Billing & Usage", icon: CreditCard },
      { to: "/help", label: "Help & Documentation", icon: CircleHelp },
    ],
  },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user, workspace, workspaces, selectWorkspace, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  const planLabel = workspace?.plan ? `${workspace.plan[0].toUpperCase()}${workspace.plan.slice(1)} plan` : "Free plan";

  const handleSwitch = async (id: string) => {
    if (id === workspace?.id) return;
    setSwitching(true);
    try {
      await selectWorkspace(id);
      toast({ title: "Workspace switched", variant: "success" });
      navigate("/dashboard");
    } catch (error) {
      toast({ title: "Could not switch workspace", description: errorMessage(error), variant: "error" });
    } finally {
      setSwitching(false);
    }
  };

  const handleCreate = async () => {
    if (workspaceName.trim().length < 2) return;
    setCreating(true);
    try {
      await apiPost("/workspaces", { name: workspaceName.trim() });
      await refresh();
      setCreateOpen(false);
      setWorkspaceName("");
      toast({ title: "Workspace created", variant: "success" });
      navigate("/dashboard");
    } catch (error) {
      toast({ title: "Could not create workspace", description: errorMessage(error), variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const workspaceItems = [
    ...workspaces.map((item) => ({
      label: `${item.id === workspace?.id ? "✓ " : ""}${item.name}${item.isDemo ? " (demo)" : ""}`,
      onClick: () => void handleSwitch(item.id),
      disabled: switching,
    })),
    { label: "Workspace settings", icon: <Building2 size={14} />, onClick: () => navigate("/settings/workspace"), separatorBefore: workspaces.length > 0 },
    { label: "Create workspace", icon: <Plus size={14} />, onClick: () => setCreateOpen(true) },
  ];

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-all duration-200 lg:static lg:z-auto lg:translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[224px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-14 items-center gap-2 border-b border-line px-3", collapsed && "lg:justify-center lg:px-2")}>
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5" onClick={onCloseMobile} aria-label="FlowMate AI home">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
              <Workflow size={17} strokeWidth={2.2} />
            </span>
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">FlowMate AI</span>
              <span className="block truncate text-[10px] text-ink-secondary">No-code automation</span>
            </span>
          </Link>
          <button
            type="button"
            className="ml-auto rounded-md p-1.5 text-ink-secondary hover:bg-app lg:hidden"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <div className={cn("px-3 pb-1 pt-3", collapsed && "lg:px-2")}>
          <DropdownMenu
            trigger={
              <div
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left transition-colors hover:bg-app",
                  collapsed && "lg:justify-center lg:px-1.5",
                )}
                title="Switch workspace"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Building2 size={13} />
                </span>
                <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                  <span className="block truncate text-[12px] font-medium text-ink">{workspace?.name ?? "Workspace"}</span>
                  <span className="block truncate text-[10px] text-ink-secondary">
                    {planLabel}
                    {workspace?.isDemo ? " · Demo" : ""}
                  </span>
                </span>
                <ChevronsUpDown size={13} className={cn("shrink-0 text-ink-secondary", collapsed && "lg:hidden")} />
              </div>
            }
            items={workspaceItems}
            align="start"
            width="w-60"
            label="Switch workspace"
          />
        </div>

        <div className={cn("px-3 py-3", collapsed && "lg:px-2")}>
          <Link
            to="/automations/new"
            onClick={onCloseMobile}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-hover",
              collapsed && "lg:w-9 lg:px-0",
            )}
            title="Create automation"
          >
            <Plus size={16} />
            <span className={cn(collapsed && "lg:hidden")}>Create Automation</span>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className={cn("mb-1.5 px-2 text-[10px] font-semibold tracking-[0.09em] text-ink-secondary/80", collapsed && "lg:px-0 lg:text-center")}>
                <span className={cn(collapsed && "lg:hidden")}>{group.label}</span>
                <span className={cn("hidden", collapsed && "lg:inline")}>···</span>
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.to === "/settings"
                      ? location.pathname === "/settings"
                      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[12.5px] font-medium transition-colors",
                        collapsed && "lg:justify-center lg:px-0",
                        active ? "bg-primary-soft text-primary" : "text-ink-secondary hover:bg-app hover:text-ink",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          <div className={cn("mt-2 rounded-lg border border-primary/15 bg-primary-soft/60 p-2.5", collapsed && "lg:hidden")}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <Sparkles size={12} /> {workspace?.plan === "free" ? "Free plan" : planLabel}
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
              {workspace?.isDemo ? "Demo workspace with simulated data and demo connections." : "Usage limits apply to every plan."}
            </p>
            <Link to="/billing" className="mt-1.5 inline-flex text-[10.5px] font-medium text-primary hover:underline">
              View usage & plans
            </Link>
          </div>
        </nav>

        <div className={cn("border-t border-line p-2.5", collapsed && "lg:p-2")}>
          <DropdownMenu
            trigger={
              <div className={cn("flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-app", collapsed && "lg:justify-center")}>
                <Avatar name={user?.name ?? "User"} color={user?.avatarColor} size="sm" />
                <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                  <span className="block truncate text-[12px] font-medium text-ink">{user?.name}</span>
                  <span className="block truncate text-[10px] text-ink-secondary">{planLabel}</span>
                </span>
                <ChevronsUpDown size={13} className={cn("text-ink-secondary", collapsed && "lg:hidden")} />
              </div>
            }
            items={[
              { label: "Profile", icon: <User size={14} />, onClick: () => navigate("/profile") },
              { label: "Settings", icon: <Settings size={14} />, onClick: () => navigate("/settings") },
              { label: "Billing & usage", icon: <BarChart3 size={14} />, onClick: () => navigate("/billing") },
              { label: "Help & documentation", icon: <CircleHelp size={14} />, onClick: () => navigate("/help") },
              { label: "Sign out", icon: <LogOut size={14} />, onClick: () => void handleLogout(), danger: true, separatorBefore: true },
            ]}
            align="start"
            width="w-52"
            label="Open profile menu"
          />
          {workspace?.isDemo ? (
            <div className={cn("mt-1 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700", collapsed && "lg:hidden")}>
              <FlaskConical size={11} /> DEMO MODE
            </div>
          ) : null}
        </div>

        <div className="hidden border-t border-line p-2 lg:block">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-ink-secondary hover:bg-app",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            <span className={cn(collapsed && "hidden")}>Collapse sidebar</span>
          </button>
        </div>
      </aside>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a workspace"
        description="Workspaces keep automations, connections and usage separate. New workspaces start on the Free plan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} loading={creating} disabled={workspaceName.trim().length < 2}>
              Create workspace
            </Button>
          </>
        }
      >
        <Label htmlFor="new-workspace">Workspace name</Label>
        <Input
          id="new-workspace"
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          placeholder="e.g. Client automations"
          maxLength={100}
          autoFocus
        />
      </Dialog>
    </>
  );
}
