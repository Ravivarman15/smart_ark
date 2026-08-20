import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  ShieldCheck,
  ClipboardList,
  GraduationCap,
  Check,
  Loader2,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { portalsFor, portalFor, type PortalDef } from "@/core/portals";
import { markPortalChosen } from "@/core/portals/portalSession";

// ─────────────────────────────────────────────────────────────────────────────
// Switch portal without signing in again.
//
// Lives in the shared sidebar footer, so all four staff portals get it from one
// place, and RENDERS NOTHING for anyone holding a single role — which is almost
// everyone. A control that is permanently disabled, or that opens to show you
// the one thing you already have, is worse than no control.
//
// The switch is a server round-trip, not a client toggle: `switchRole` calls
// the database, which re-checks the grant and rewrites `active_role`, and only
// then is every cached query dropped. Navigating before that resolved would
// land on the new portal while RLS still answered as the old role.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  Building2,
  ShieldCheck,
  ClipboardList,
  GraduationCap,
};

const iconFor = (p: PortalDef): LucideIcon => ICONS[p.icon] ?? GraduationCap;

export const PortalSwitcher: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const { user, availableRoles, primaryRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const portals = portalsFor(availableRoles);
  const current = portalFor(user?.role);

  // Nothing to switch between.
  if (portals.length <= 1 || !current) return null;

  const go = async (p: PortalDef) => {
    if (p.role === current.role) return;
    setBusy(p.role);
    try {
      await switchRole(p.role);
      markPortalChosen();
      navigate(p.path, { replace: true });
      toast.success(`Switched to the ${p.label} portal`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch portal");
    } finally {
      setBusy(null);
    }
  };

  const CurrentIcon = iconFor(current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={collapsed ? `Portal: ${current.label}` : undefined}
          aria-label={`Switch portal — currently ${current.label}`}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
          ) : (
            <CurrentIcon className="h-4 w-4 flex-shrink-0" />
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{current.label} portal</span>
              <Repeat className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "top"} className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch portal — you stay signed in
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portals.map((p) => {
          const Icon = iconFor(p);
          const active = p.role === current.role;
          return (
            <DropdownMenuItem
              key={p.role}
              disabled={!!busy}
              onSelect={(e) => {
                // Radix closes the menu on select; preventing the default keeps
                // it open long enough for the async switch to report a failure
                // in place rather than behind a menu that has already gone.
                if (active) return;
                e.preventDefault();
                void go(p);
              }}
              className="gap-2"
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.label}</span>
                {p.role === primaryRole && (
                  <span className="block text-[10px] text-muted-foreground">Primary role</span>
                )}
              </span>
              {busy === p.role ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PortalSwitcher;
