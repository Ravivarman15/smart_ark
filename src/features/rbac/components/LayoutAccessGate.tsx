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
//
// ┌── ENTITLEMENT OUTRANKS THE SUPER-ROLE BYPASS ──────────────────────────┐
// │ This gate used to open with `if (data.isSuper) return allow`, and      │
// │ SUPER_ROLES is exactly ["management"] — the most common tenant admin.  │
// │                                                                        │
// │ So when a Super Admin revoked Payroll, RoleSidebar correctly hid the   │
// │ link, and a management user who typed /management/payroll/dashboard    │
// │ got the entire module anyway. The platform console said OFF; the       │
// │ product said yes. That is the "UI toggled but the application didn't   │
// │ consume it" failure, and it made every revoke cosmetic for the one     │
// │ role most likely to go looking.                                        │
// │                                                                        │
// │ The bypass is not removed — it is delegated. `resolveAccess()` already │
// │ applies the entitlement gate ABOVE its own super-role branch, handing  │
// │ a super user `superEntry()` for everything the organization HAS and    │
// │ `entitlementDenied()` for everything it does not. So consulting the    │
// │ resolver gives management its bypass over RBAC permission rows while   │
// │ still honouring the commercial boundary — which is the ordering the    │
// │ resolver documents and this gate was silently inverting.               │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { NAV_CONFIG, useHomeRoute, type NavItemConfig } from "@/core/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SHARED_ROUTES } from "@/core/routing/sharedRoutes";
import type { Role } from "@/core/constants/roles";
import { useEffectiveAccess } from "../hooks/useEffectiveAccess";
import { lookup } from "../resolver/rbacResolver";
import { MODULE_CATALOG } from "../constants/catalog";
import { ModuleUnavailable } from "./ModuleUnavailable";

interface Props {
  children: ReactNode;
}

interface PathResolution {
  /**
   * Owning RBAC module id.
   *
   * Resolved in addition to the submodule because entitlement is a MODULE-level
   * fact. A nav item that carries only an `action`, or a route whose submodule
   * is not in the catalog, would otherwise fall open on a module the
   * organization does not have.
   */
  module?: string;
  submodule?: string;
  action?: string;
}

/** Submodule id → owning module id, built once from the catalog. */
const MODULE_OF_SUBMODULE = new Map<string, string>(
  MODULE_CATALOG.flatMap((m) => m.submodules.map((s) => [s.id, m.id] as const)),
);

const MODULE_IDS = new Set<string>(MODULE_CATALOG.map((m) => m.id));

/**
 * The module a submodule belongs to.
 *
 * Prefers the catalog mapping; falls back to the id's namespace prefix
 * (`"reports.income"` → `"reports"`) so a submodule that exists in a route
 * registry but not yet in the catalog still resolves to the right module
 * rather than silently skipping the entitlement check.
 */
const moduleOf = (submodule?: string): string | undefined => {
  if (!submodule) return undefined;
  const exact = MODULE_OF_SUBMODULE.get(submodule);
  if (exact) return exact;
  const prefix = submodule.split(".")[0];
  return MODULE_IDS.has(prefix) ? prefix : undefined;
};

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

/**
 * Module ROOTS — the `/role/segment` prefix each module's pages live under,
 * derived once from NAV_CONFIG.
 *
 * ┌── WHY A ROOT AND NOT A MENU-ITEM PREFIX ───────────────────────────────┐
 * │ Matching against menu item paths only covers pages the menu links.     │
 * │ `/management/payroll/dashboard` is in NAV_CONFIG, so it resolved; a    │
 * │ nested tab, a detail route, or simply a path nobody listed did not —   │
 * │ and fell open on a module the organization does not have.              │
 * │                                                                        │
 * │ A revoke is a fact about the MODULE, so the whole `/role/module/*`     │
 * │ subtree has to answer to it. Anything less is a maze the determined    │
 * │ user walks around, which is not a boundary.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A root claimed by two different modules is recorded as AMBIGUOUS and never
 * used: blocking on a guess would take away a module the customer does have,
 * which is worse than the narrower exact-match check still catching it.
 */
const AMBIGUOUS = " ambiguous";

const MODULE_ROOTS: Map<string, string> = (() => {
  const roots = new Map<string, string>();
  for (const group of NAV_CONFIG) {
    if (!group.module) continue;
    for (const item of group.items) {
      const segments = item.path.split("?")[0].split("#")[0].split("/").filter(Boolean);
      // `/management` alone is the role home and would swallow every route.
      if (segments.length < 2) continue;
      const root = `/${segments[0]}/${segments[1]}`;
      const existing = roots.get(root);
      if (existing === undefined) roots.set(root, group.module);
      else if (existing !== group.module) roots.set(root, AMBIGUOUS);
    }
  }
  return roots;
})();

/** The module owning a path, by longest unambiguous root. */
const findGroupModule = (pathname: string): string | undefined => {
  const path = pathname.split("?")[0].split("#")[0];
  let best: string | undefined;
  let bestLen = 0;
  for (const [root, moduleId] of MODULE_ROOTS) {
    if (moduleId === AMBIGUOUS) continue;
    // Segment-boundary match, so `/admin/student` never claims
    // `/admin/student-import`.
    if (path !== root && !path.startsWith(root + "/")) continue;
    if (root.length > bestLen) {
      best = moduleId;
      bestLen = root.length;
    }
  }
  return best;
};

const resolveAccessTarget = (pathname: string): PathResolution | undefined => {
  // Menu config first — it's the most explicit source.
  const navItem = findInNavConfig(pathname);
  if (navItem?.submodule || navItem?.action) {
    return {
      module: navItem.module ?? moduleOf(navItem.submodule) ?? findGroupModule(pathname),
      submodule: navItem.submodule,
      action: navItem.action,
    };
  }
  // Registry next — covers routes that have no menu-config entry for the
  // current role (e.g. teacher reaching /teacher/setup/years through a
  // synthesized menu item).
  const registryHit = findInRegistry(pathname);
  if (registryHit) {
    return { ...registryHit, module: moduleOf(registryHit.submodule) };
  }
  // Nothing named a submodule or an action — but the path may still sit inside
  // a module's group (a detail route, a nested tab). Entitlement is checked on
  // that alone, because "not sold to this organization" applies to every page
  // under the module, including the ones no menu item points at directly.
  const groupModule = findGroupModule(pathname);
  if (groupModule) return { module: groupModule };
  // Genuinely unclassifiable — fall open, as the rest of the RBAC stack does.
  return undefined;
};

export const LayoutAccessGate = ({ children }: Props) => {
  const location = useLocation();
  const { user } = useAuth();
  const { data, isLoading } = useEffectiveAccess();
  const home = useHomeRoute();

  const verdict = useMemo(() => {
    if (!user) return { allow: true as const };
    // Deliberately NOT short-circuiting on `data.isSuper` — see the header.
    // The resolver already gives a super role everything the organization is
    // entitled to, so consulting it preserves the bypass over permission rows
    // while still enforcing the commercial boundary above it.
    if (isLoading) return { allow: true as const, loading: true };

    const target = resolveAccessTarget(location.pathname);
    if (!target) return { allow: true as const };

    const moduleEntry = target.module ? lookup(data, target.module) : undefined;
    const submoduleEntry = target.submodule ? lookup(data, target.submodule) : undefined;
    const actionEntry = target.action ? lookup(data, target.action) : undefined;

    const moduleOk = moduleEntry?.allowed ?? true;
    const submoduleOk = submoduleEntry?.allowed ?? true;
    const actionOk = actionEntry?.allowed ?? true;

    if (moduleOk && submoduleOk && actionOk) return { allow: true as const };

    // An entitlement denial is a different event from a permission denial and
    // deserves a different answer. A permission denial is a mistake by the
    // person navigating, so bouncing them home is right. An entitlement denial
    // means the organization does not have the module at all — redirecting
    // silently to a dashboard leaves someone clicking a bookmark with no idea
    // why they keep ending up somewhere else.
    const denied = [moduleEntry, submoduleEntry, actionEntry].find(
      (e) => e && !e.allowed,
    );
    if (denied?.source === "entitlement") {
      return { allow: false as const, entitlement: true as const, module: target.module };
    }

    return {
      allow: false as const,
      entitlement: false as const,
      reason: !moduleOk ? target.module : !submoduleOk ? target.submodule : target.action,
    };
  }, [user, data, isLoading, location.pathname]);

  // Not sold to this organization → explain it in place. No redirect, and no
  // internal detail: the customer is told the module is not enabled and who to
  // ask, never which plan or flag decided it.
  if (!verdict.allow && verdict.entitlement) {
    return <ModuleUnavailable moduleId={verdict.module} />;
  }

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
