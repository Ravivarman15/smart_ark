// ──────────────────────────────────────────────────────────────────────────────
// LayoutAccessGate — automatic submodule/action guarding for direct-URL access.
//
// Wraps a layout's <Outlet /> and consults NAV_CONFIG to figure out which
// submodule + action ids the current pathname maps to. If the resolver says
// the user can't see the submodule (or perform the menu action), we redirect
// to the role's home route.
//
// Why this exists:
//   The sidebar already hides menu items the user can't access — but a user
//   typing a URL directly, or navigating from a stale bookmark, would bypass
//   that. ProtectedRoute checks roles only; this layer adds the RBAC check.
//
// Falls open: if no NAV_CONFIG item matches the path (e.g. detail routes like
// `/admin/students/:id`), the gate allows the navigation through. That matches
// the rest of the RBAC stack's "default-permissive for unknown keys" posture.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { NAV_CONFIG, useHomeRoute, type NavItemConfig } from "@/core/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveAccess } from "../hooks/useEffectiveAccess";
import { lookup } from "../resolver/rbacResolver";

interface Props {
  children: ReactNode;
}

const findNavItemForPath = (pathname: string): NavItemConfig | undefined => {
  // Strip any querystring; menu items store the canonical path.
  const path = pathname.split("?")[0].split("#")[0];

  // Exact match first — most reliable.
  for (const group of NAV_CONFIG) {
    for (const item of group.items) {
      const itemPath = item.path.split("?")[0];
      if (itemPath === path) return item;
    }
  }

  // Fallback: longest-prefix match. Skip role-home roots ("/admin", "/teacher")
  // because they'd swallow every nested route.
  let best: NavItemConfig | undefined;
  let bestLen = 0;
  for (const group of NAV_CONFIG) {
    for (const item of group.items) {
      const itemPath = item.path.split("?")[0];
      const isRoleHome = /^\/[a-z]+$/.test(itemPath);
      if (isRoleHome) continue;
      if (path.startsWith(itemPath + "/") || path === itemPath) {
        if (itemPath.length > bestLen) {
          best = item;
          bestLen = itemPath.length;
        }
      }
    }
  }
  return best;
};

export const LayoutAccessGate = ({ children }: Props) => {
  const location = useLocation();
  const { user } = useAuth();
  const { data, isLoading } = useEffectiveAccess();
  const home = useHomeRoute();

  const verdict = useMemo(() => {
    if (!user) return { allow: true as const };
    if (data.isSuper) return { allow: true as const };
    if (isLoading) return { allow: true as const, loading: true };

    const item = findNavItemForPath(location.pathname);
    if (!item) return { allow: true as const };

    const submoduleOk = item.submodule
      ? (lookup(data, item.submodule)?.allowed ?? true)
      : true;
    const actionOk = item.action
      ? (lookup(data, item.action)?.allowed ?? true)
      : true;

    if (submoduleOk && actionOk) return { allow: true as const };
    return {
      allow: false as const,
      reason: !submoduleOk ? item.submodule : item.action,
    };
  }, [user, data, isLoading, location.pathname]);

  if (!verdict.allow) {
    // The console line is dev-only and helps debug accidental denials. We
    // intentionally keep this lightweight — rbacDebug() would couple this
    // gate to the debug toggle, but a denied navigation is always worth
    // surfacing during development.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        `[RBAC] Route blocked by LayoutAccessGate (${verdict.reason}). Redirecting to ${home}.`,
      );
    }
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
};
