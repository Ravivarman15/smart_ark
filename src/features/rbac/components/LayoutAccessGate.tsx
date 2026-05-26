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
import { SHARED_ROUTES } from "@/core/routing/sharedRoutes";
import type { Role } from "@/core/constants/roles";
import { useEffectiveAccess } from "../hooks/useEffectiveAccess";
import { lookup } from "../resolver/rbacResolver";

interface Props {
  children: ReactNode;
}

interface PathResolution {
  submodule?: string;
  action?: string;
}

/**
 * Walk NAV_CONFIG for a match on the absolute pathname. Returns the menu
 * item's submodule + action so the gate can run an RBAC check.
 */
const findInNavConfig = (pathname: string): NavItemConfig | undefined => {
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

/**
 * Look the path up in the shared route registry. This is what protects
 * registry-mounted routes (e.g. /teacher/setup/years) — menu.config.ts only
 * generates items for the roles its sub() helper enumerates, so the
 * synthesized teacher path wouldn't have a NAV_CONFIG entry and the gate
 * would fall open. Reading from the registry covers that gap.
 */
const findInRegistry = (pathname: string): PathResolution | undefined => {
  const path = pathname.split("?")[0].split("#")[0];
  // Pathname format: /<role>/<rest...>
  const match = /^\/([^/]+)\/(.+)$/.exec(path);
  if (!match) return undefined;
  const [, layout, rest] = match;

  // Exact suffix match against registry path templates. Templates may
  // contain :params (e.g. "help/history/:id") — we compile a regex per
  // template and test against `rest`.
  for (const def of SHARED_ROUTES) {
    if (def.layouts && !def.layouts.includes(layout as Role)) continue;
    const regex = templateToRegex(def.path);
    if (regex.test(rest)) {
      return { submodule: def.submodule, action: def.action };
    }
  }
  return undefined;
};

const templateToRegex = (template: string): RegExp => {
  const escaped = template
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${escaped}$`);
};

const resolveAccessTarget = (pathname: string): PathResolution | undefined => {
  // Menu config first — it's the most explicit source.
  const navItem = findInNavConfig(pathname);
  if (navItem?.submodule || navItem?.action) {
    return { submodule: navItem.submodule, action: navItem.action };
  }
  // Registry next — covers routes that have no menu-config entry for the
  // current role (e.g. teacher reaching /teacher/setup/years through a
  // synthesized menu item).
  const registryHit = findInRegistry(pathname);
  if (registryHit) return registryHit;
  // Detail routes like /admin/students/:id have no nav item — fall open.
  return undefined;
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

    const target = resolveAccessTarget(location.pathname);
    if (!target) return { allow: true as const };

    const submoduleOk = target.submodule
      ? (lookup(data, target.submodule)?.allowed ?? true)
      : true;
    const actionOk = target.action
      ? (lookup(data, target.action)?.allowed ?? true)
      : true;

    if (submoduleOk && actionOk) return { allow: true as const };
    return {
      allow: false as const,
      reason: !submoduleOk ? target.submodule : target.action,
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
