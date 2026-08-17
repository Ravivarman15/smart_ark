import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions";
import { useEffectiveAccess, useSidebarAccess } from "@/features/rbac";
import { getRoutePath } from "@/core/routing/sharedRoutes";
import { NAV_CONFIG, type NavGroupConfig, type NavItemConfig } from "./menu.config";
import { ROLE_HOME_ROUTE, ROLES, type Role } from "@/core/constants/roles";

interface VisibleNavItem extends NavItemConfig {
  /** Resolved roles after group inheritance (helpful for debugging). */
  resolvedRoles: Role[];
  /** True when the item was rendered because RBAC explicitly granted it,
   *  not because the menu-config role list naturally includes the role. */
  synthesized?: boolean;
}

interface VisibleNavGroup extends Omit<NavGroupConfig, "items"> {
  items: VisibleNavItem[];
}

/**
 * True when a menu path is mounted ONCE for every role rather than under a
 * role layout — `/settings/*` is the whole of this category today.
 *
 * It matters for non-native grants. The synthesis path below assumes an item a
 * role does not natively own has no working URL for that role, so it falls back
 * to a coming-soon stub. That is right for `/admin/payroll` (the coordinator
 * layout never mounts it) and wrong for `/settings/billing`, which every role
 * can already open — sending a granted user to "coming soon" for a page that
 * exists makes the grant look broken.
 */
const isRoleAgnosticPath = (path: string): boolean =>
  !ROLES.some((r) => path.startsWith(`/${r}/`));

/**
 * Returns the navigation tree the current user is allowed to see.
 *
 * Resolution rules (in order):
 *   1. Super-role bypass — management sees everything.
 *   2. Group visibility:
 *      - If RBAC has an explicit grant (role_grant or user_override) for
 *        the group's module, that wins outright.
 *      - Otherwise fall back to the menu-config role list AND the catalog
 *        default. This preserves the historical behaviour for any role that
 *        management hasn't customized.
 *   3. Item visibility (per group):
 *      - Items whose menu-config role list includes the current role are
 *        checked normally (action + submodule + module gates).
 *      - Items the role does NOT natively own are still rendered IF RBAC
 *        explicitly grants the parent submodule. We synthesize a path that
 *        routes to the role's coming-soon stub so the link doesn't 404.
 *      - We dedupe by submodule so a native item beats a synthesized one.
 *   4. Empty groups are dropped at the end.
 *
 * The key behavioural change vs. the previous implementation: an explicit
 * RBAC grant always wins over the menu-config role list. This fixes the bug
 * where management could grant teacher access to a module in the Role
 * Editor but the teacher's sidebar would silently ignore the change.
 */
export const useNavigation = (): VisibleNavGroup[] => {
  const { user } = useAuth();
  const { canDoAction, hasRole } = usePermissions();
  const { canViewModule, canViewSubmodule } = useSidebarAccess();
  const { data: effective } = useEffectiveAccess();

  void hasRole; // kept in scope for downstream consumers via re-export chains

  return useMemo(() => {
    const role = user?.role as Role | undefined;
    if (!role) return [];

    const out: VisibleNavGroup[] = [];

    for (const group of NAV_CONFIG) {
      // ── Group visibility ────────────────────────────────────────────────
      const moduleEntry = group.module ? effective.modules[group.module] : undefined;
      const moduleIsExplicit =
        moduleEntry?.source === "role_grant" ||
        moduleEntry?.source === "user_override";

      if (moduleIsExplicit) {
        // Explicit RBAC opinion wins — even over the menu-config role list.
        if (!moduleEntry?.allowed) continue;
      } else {
        // No explicit grant — preserve the historical role-list filter so
        // pre-existing menus don't suddenly expand for everyone.
        if (!group.roles.includes(role)) continue;
        if (group.module && !canViewModule(group.module)) continue;
      }

      // ── Items ──────────────────────────────────────────────────────────
      // Path is the dedup key: two menu entries with the same `path` are
      // genuinely the same link, anything else is a distinct item even when
      // they share a `submodule` key (e.g. "Create Staff Role" and
      // "Manage Staff Role" both sit under submodule "staff.rights" but
      // point at different routes — both must render).
      //
      // Synthesized coming-soon items always resolve to the same
      // `/${role}/coming-soon/${submoduleId}` path, so multiple non-native
      // items under one submodule collapse to a single coming-soon entry,
      // which is the desired behaviour.
      const itemsByPath = new Map<string, VisibleNavItem>();

      for (const item of group.items) {
        const resolvedRoles = item.roles ?? group.roles;
        const isNative = resolvedRoles.includes(role);

        const submoduleEntry = item.submodule
          ? effective.submodules[item.submodule]
          : undefined;
        const submoduleIsExplicit =
          submoduleEntry?.source === "role_grant" ||
          submoduleEntry?.source === "user_override";

        if (isNative) {
          // Standard pipeline: action + module + submodule gates.
          if (item.action && !canDoAction(item.action)) continue;
          if (item.module && !canViewModule(item.module)) continue;
          if (item.submodule && !canViewSubmodule(item.submodule)) continue;

          // Some menu rows are *natively* allowed for a role but have no
          // role-specific path in menu.config — the sub() helper baked a
          // /${role}/coming-soon/... placeholder in. If the route registry
          // now has a real mount for (role, submodule), prefer that path
          // so the link goes to a working page instead of the stub.
          let nativePath = item.path;
          if (
            item.submodule &&
            nativePath.includes(`/${role}/coming-soon/`)
          ) {
            const registered = getRoutePath(role, item.submodule);
            if (registered) nativePath = registered;
          }

          itemsByPath.set(nativePath, {
            ...item,
            path: nativePath,
            resolvedRoles,
          });
          continue;
        }

        // Non-native: only render if RBAC explicitly grants the submodule
        // (or, when the item has no submodule, the module itself). Catalog
        // defaults alone aren't enough — that would re-introduce the old
        // "teacher sees everything by default" problem.
        const grantedNonNatively = submoduleIsExplicit
          ? !!submoduleEntry?.allowed
          : moduleIsExplicit && !!moduleEntry?.allowed && !item.submodule;
        if (!grantedNonNatively) continue;

        if (item.action && !canDoAction(item.action)) continue;
        if (item.module && !canViewModule(item.module)) continue;
        if (item.submodule && !canViewSubmodule(item.submodule)) continue;

        // Real route lookup: if the shared route registry has a path for
        // (current role, this submodule), use it — the role layout actually
        // mounts that route and the page will render. Otherwise fall back
        // to the role-scoped coming-soon stub so the link doesn't 404.
        const registeredPath = item.submodule
          ? getRoutePath(role, item.submodule)
          : null;
        const synthPath = isRoleAgnosticPath(item.path)
          ? item.path
          : registeredPath ?? `/${role}/coming-soon/${item.submodule ?? group.key}`;

        // If a native item already targets this synth path, don't overwrite
        // (effectively never — the role's own path won't collide with a
        // coming-soon URL — but keep the guard for safety).
        const existing = itemsByPath.get(synthPath);
        if (existing && !existing.synthesized) continue;

        itemsByPath.set(synthPath, {
          ...item,
          path: synthPath,
          resolvedRoles: [role],
          synthesized: true,
        });
      }

      const items = Array.from(itemsByPath.values());
      if (items.length > 0) out.push({ ...group, items });
    }

    return out;
  }, [
    user?.role,
    canDoAction,
    canViewModule,
    canViewSubmodule,
    effective.modules,
    effective.submodules,
  ]);
};

/**
 * Convenience: returns the home route for the current user (the `isHome`
 * item from the dashboard group). Useful for "Take me home" buttons in
 * shared components that don't know which layout they're in.
 */
export const useHomeRoute = (): string => {
  const { user } = useAuth();
  const groups = useNavigation();
  const dashboard = groups.find((g) => g.key === "dashboard");
  const homePath = dashboard?.items.find((i) => i.isHome)?.path;
  if (homePath) return homePath;

  const role = user?.role as Role | undefined;
  if (role) {
    return ROLE_HOME_ROUTE[role] ?? "/";
  }
  return "/";
};
