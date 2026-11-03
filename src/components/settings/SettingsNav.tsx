import * as React from "react";
import { NavLink } from "react-router-dom";
import { Bell, Building2, CreditCard, Settings, ShieldCheck, User } from "lucide-react";
import { cn } from "../../lib/utils";

const ITEMS = [
  { to: "/settings", label: "General", icon: Settings, end: true },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/workspace", label: "Workspace", icon: Building2 },
  { to: "/profile", label: "Profile & security", icon: User },
  { to: "/billing", label: "Billing & usage", icon: CreditCard },
];

export function SettingsNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Settings sections">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors",
                isActive ? "bg-primary-soft text-primary" : "text-ink-secondary hover:bg-app hover:text-ink",
              )
            }
          >
            <Icon size={14} /> {item.label}
          </NavLink>
        );
      })}
      <div className="mt-2 hidden rounded-lg border border-line bg-white p-2.5 lg:block">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink">
          <ShieldCheck size={12} className="text-success" /> Secure defaults
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-ink-secondary">
          Sessions use httpOnly cookies. Simulation is the default execution mode.
        </p>
      </div>
    </nav>
  );
}
