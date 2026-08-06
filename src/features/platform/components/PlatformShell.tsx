// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM SHELL — route guard, layout, navigation and shared page furniture.
//
// A SEPARATE route tree from the ERP, sharing only the design system. Platform
// pages are deliberately NOT mounted through sharedRoutes: the blast radius of
// a mistake there is every customer, and the two surfaces should never be one
// registry edit away from each other.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Building2, CreditCard, Package, Ticket, BarChart3, ServerCog,
  ShieldCheck, Activity, FileText, Settings, Users, Percent, HardDrive,
  LifeBuoy, ScrollText, Flag, DatabaseBackup, AlertTriangle, Loader2,
} from "lucide-react";
import { usePlatformAuth, type PlatformCapability } from "../context/PlatformAuthContext";
import { ThemeToggle } from "@/core/theme";
import { cn } from "@/lib/utils";

// ── Route guard ─────────────────────────────────────────────────────────────

/**
 * Gate for every /platform route.
 *
 * Fails CLOSED and, importantly, fails SILENTLY: a non-platform user is
 * redirected to "/" rather than shown "you are not a platform admin". The
 * existence of the control plane is not something a tenant needs confirmed.
 */
export const PlatformProtectedRoute: React.FC<{
  children: React.ReactNode;
  capability?: PlatformCapability;
}> = ({ children, capability }) => {
  const { isPlatformUser, loading, can, platformUser } = usePlatformAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Enrolled platform user without MFA: tell them, because this one IS
  // actionable and they already know the platform exists.
  if (platformUser && !platformUser.mfaEnrolled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
          <h1 className="text-lg font-semibold">Multi-factor authentication required</h1>
          <p className="text-sm text-muted-foreground">
            Platform access requires an enrolled MFA factor. Until one is registered
            your session carries no platform claim, so no control-plane data will load.
          </p>
        </div>
      </div>
    );
  }

  if (!isPlatformUser) return <Navigate to="/" replace />;
  if (capability && !can(capability)) return <Navigate to="/platform/dashboard" replace />;
  return <>{children}</>;
};

// ── Navigation ──────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  capability?: PlatformCapability;
}

interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/platform/organizations", label: "Organizations", icon: Building2, capability: "organizations.read" },
      { to: "/platform/provisioning", label: "Provisioning", icon: ServerCog, capability: "organizations.read" },
      { to: "/platform/usage", label: "Usage", icon: BarChart3, capability: "usage.read" },
      { to: "/platform/revenue", label: "Revenue", icon: Percent, capability: "billing.read" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { to: "/platform/plans", label: "Plans", icon: Package, capability: "plans.manage" },
      { to: "/platform/pricing", label: "Pricing", icon: CreditCard, capability: "plans.manage" },
      { to: "/platform/subscriptions", label: "Subscriptions", icon: FileText, capability: "billing.read" },
      { to: "/platform/coupons", label: "Coupons", icon: Ticket, capability: "coupons.manage" },
      { to: "/platform/invoices", label: "Invoices", icon: ScrollText, capability: "billing.read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/platform/feature-flags", label: "Feature Flags", icon: Flag, capability: "feature_flags.manage" },
      { to: "/platform/storage", label: "Storage", icon: HardDrive, capability: "usage.read" },
      { to: "/platform/support", label: "Support", icon: LifeBuoy, capability: "support.manage" },
      { to: "/platform/system-health", label: "System Health", icon: Activity, capability: "health.read" },
      { to: "/platform/backups", label: "Backups", icon: DatabaseBackup, capability: "settings.manage" },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/platform/audit", label: "Audit Center", icon: ScrollText, capability: "audit.read" },
      { to: "/platform/security", label: "Security", icon: ShieldCheck, capability: "audit.read" },
      { to: "/platform/logs", label: "Logs", icon: FileText, capability: "audit.read" },
      { to: "/platform/platform-settings", label: "Settings", icon: Settings, capability: "settings.manage" },
      { to: "/platform/users", label: "Platform Users", icon: Users, capability: "platform.users.manage" },
    ],
  },
];

// ── Layout ──────────────────────────────────────────────────────────────────

export const PlatformLayout: React.FC = () => {
  const { platformUser, can } = usePlatformAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Smart ARK</div>
            <div className="text-[11px] text-muted-foreground">Control Plane</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.capability || can(i.capability));
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="mb-4">
                <div className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                        isActive || pathname.startsWith(item.to)
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{platformUser?.name}</div>
            <div className="text-[11px] text-muted-foreground capitalize">
              {platformUser?.role.replace("_", " ")}
            </div>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
};

// ── Shared page furniture ───────────────────────────────────────────────────

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "critical";
}> = ({ label, value, hint, tone = "default" }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div
      className={cn(
        "mt-1 text-2xl font-semibold tabular-nums",
        tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        tone === "warning" && "text-amber-600 dark:text-amber-400",
        tone === "critical" && "text-red-600 dark:text-red-400",
      )}
    >
      {value}
    </div>
    {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const tone =
    status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : status === "trialing" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
    : status === "past_due" || status === "grace" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : status === "suspended" || status === "cancelled" ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>
      {status.replace("_", " ")}
    </span>
  );
};

export const EmptyState: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <div className="rounded-lg border border-dashed border-border p-10 text-center">
    <div className="text-sm font-medium">{title}</div>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
  </div>
);

export const LoadingBlock: React.FC = () => (
  <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

/** Consistent "this belongs to a later phase" notice. */
export const ReservedNotice: React.FC<{ phase: string; children: React.ReactNode }> = ({
  phase, children,
}) => (
  <div className="rounded-lg border border-border bg-muted/40 p-4">
    <div className="flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <div className="font-medium">Reserved for {phase}</div>
        <p className="text-muted-foreground mt-0.5">{children}</p>
      </div>
    </div>
  </div>
);

export const formatBytes = (b: number): string => {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

export const formatMoney = (n: number, currency = "INR"): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
