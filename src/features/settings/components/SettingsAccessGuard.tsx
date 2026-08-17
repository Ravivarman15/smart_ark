// ──────────────────────────────────────────────────────────────────────────────
// SettingsAccessGuard — the settings sub-nav, enforced.
//
// Every /settings/* route was mounted behind `ProtectedRoute` with all four
// staff roles allowed and nothing else. The comment beside them said the RBAC
// gate on each menu item decided visibility — which is only true for users who
// arrive by clicking. Typing /settings/billing opened the billing page for any
// signed-in coordinator or teacher, revoked submodule or not.
//
// Rather than annotate eleven routes with a submodule id that would then have
// to be kept in step with menu.config, this guard asks the same question the
// navigation asks: is this path one of the settings sections you can see? A
// route the user has no link to is a route the user cannot open, and a new
// settings page inherits the rule the moment it appears in NAV_CONFIG.
//
// Denied users go to their first visible section, not to a 403 — inside a
// settings shell they can otherwise use, an error page would read as breakage.
// ──────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useEffectiveAccess } from "@/features/rbac";
import { useHomeRoute } from "@/core/navigation";
import { settingsLanding, useSettingsSections } from "../navigation/settingsNav";

export const SettingsAccessGuard = ({ children }: { children: ReactNode }) => {
  const { isLoading } = useEffectiveAccess();
  const sections = useSettingsSections();
  const { pathname } = useLocation();
  const home = useHomeRoute();

  // Never redirect on an unresolved permission set. The resolver is
  // fail-permissive while loading, so acting early would bounce a user off a
  // page they are entitled to and then leave them there.
  if (isLoading) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Checking access…
      </p>
    );
  }

  const landing = settingsLanding(sections);
  if (!landing) return <Navigate to={home} replace />;

  // Trailing-segment aware: a future /settings/branding/logo stays inside the
  // section that owns it instead of bouncing to the landing page.
  const allowed = sections.some(
    (s) => pathname === s.path || pathname.startsWith(`${s.path}/`),
  );
  if (!allowed) return <Navigate to={landing} replace />;

  return <>{children}</>;
};
