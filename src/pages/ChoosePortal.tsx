import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Building2,
  ShieldCheck,
  ClipboardList,
  GraduationCap,
  ArrowRight,
  Loader2,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { portalsFor, type PortalDef } from "@/core/portals";
import { markPortalChosen } from "@/core/portals/portalSession";
import type { Role } from "@/core/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// "Which portal?" — shown after sign-in to anyone holding more than one role.
//
// Only ever reached when there is a real choice. A chooser with one option is a
// dialog whose only purpose is to be dismissed, so a single-role sign-in goes
// straight through and never learns this screen exists.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  Building2,
  ShieldCheck,
  ClipboardList,
  GraduationCap,
};

export const ChoosePortal: React.FC = () => {
  const { user, availableRoles, primaryRole, switchRole, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [entering, setEntering] = useState<Role | null>(null);

  const portals = portalsFor(availableRoles);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Landing here with one portal (or none) is not an error state to display —
  // it is a redirect. Reached by typing the URL, or by a grant being revoked
  // between sign-in and arrival.
  if (portals.length <= 1) {
    markPortalChosen();
    return <Navigate to={portals[0]?.path ?? "/"} replace />;
  }

  const enter = async (portal: PortalDef) => {
    setEntering(portal.role);
    try {
      await switchRole(portal.role);
      // Marked only AFTER the database accepted the switch. Marking first would
      // let a refused switch skip the chooser on the next navigation, dropping
      // them into a portal they are not in.
      markPortalChosen();
      navigate(portal.path, { replace: true });
    } catch (e) {
      setEntering(null);
      toast.error(e instanceof Error ? e.message : "Could not open that portal");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Welcome back, {user?.name ?? "there"}</h1>
          <p className="text-sm text-muted-foreground">
            You hold {portals.length} roles here. Which one are you working in today?
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {portals.map((p) => {
            const Icon = ICONS[p.icon] ?? GraduationCap;
            const busy = entering === p.role;
            return (
              <Card
                key={p.role}
                role="button"
                tabIndex={0}
                aria-label={`Enter the ${p.label} portal`}
                onClick={() => !entering && enter(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!entering) enter(p);
                  }
                }}
                className={`cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40 ${
                  entering && !busy ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-medium">{p.label}</span>
                    {p.role === primaryRole && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        primary
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-xs text-muted-foreground">{p.description}</p>
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    {busy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening…
                      </>
                    ) : (
                      <>
                        Enter <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          You can switch at any time from the menu — no need to sign in again.
        </p>

        <div className="flex justify-center">
          <SignOutLink />
        </div>
      </div>
    </div>
  );
};

/** An escape hatch. Without one, the wrong account signed in on a shared
 *  machine has no way off this screen except closing the browser. */
const SignOutLink: React.FC = () => {
  const { logout } = useAuth();
  return (
    <Button variant="ghost" size="sm" onClick={() => logout()}>
      <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
    </Button>
  );
};

export default ChoosePortal;
