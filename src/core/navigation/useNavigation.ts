import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions";
import { useSidebarAccess } from "@/features/rbac";
import { NAV_CONFIG, type NavGroupConfig, type NavItemConfig } from "./menu.config";
import type { Role } from "@/core/constants/roles";

interface VisibleNavItem extends NavItemConfig {
  /** Resolved roles after group inheritance (helpful for debugging). */
  resolvedRoles: Role[];
}

interface VisibleNavGroup extends Omit<NavGroupConfig, "items"> {
  items: VisibleNavItem[];
}

/**
 * Returns the navigation tree the current user is allowed to see.
 *
 * Filter rules (applied in order):
 *   1. Group dropped if the user's role isn't in `group.roles`.
 *   2. Group dropped if it declares `module` and the RBAC layer hides it.
 *   3. Item dropped if it declares `roles` and the user isn't included.
 *   4. Item dropped if it declares `action` and the permission system says no.
 *   5. Item dropped if it declares `module`/`submodule` and the RBAC layer
 *      hides it.
 *   6. Empty groups dropped entirely.
 *
 * Super-roles (management) bypass all checks via `usePermissions` /
 * `useSidebarAccess` (both short-circuit on management).
 */
export const useNavigation = (): VisibleNavGroup[] => {
  const { user } = useAuth();
  const { canDoAction, hasRole } = usePermissions();
  const { canViewModule, canViewSubmodule } = useSidebarAccess();

  return useMemo(() => {
    const role = user?.role as Role | undefined;
    if (!role) return [];

    const out: VisibleNavGroup[] = [];
    for (const group of NAV_CONFIG) {
      if (!group.roles.includes(role)) continue;
      if (group.module && !canViewModule(group.module)) continue;

      const items: VisibleNavItem[] = [];
      for (const item of group.items) {
        const resolvedRoles = item.roles ?? group.roles;
        if (!hasRole(resolvedRoles)) continue;
        if (item.action && !canDoAction(item.action)) continue;
        if (item.module && !canViewModule(item.module)) continue;
        if (item.submodule && !canViewSubmodule(item.submodule)) continue;
        items.push({ ...item, resolvedRoles });
      }

      if (items.length > 0) out.push({ ...group, items });
    }
    return out;
  }, [user?.role, canDoAction, hasRole, canViewModule, canViewSubmodule]);
};

/**
 * Convenience: returns the home route for the current user (the `isHome`
 * item from the dashboard group). Useful for "Take me home" buttons in
 * shared components that don't know which layout they're in.
 */
export const useHomeRoute = (): string => {
  const groups = useNavigation();
  const dashboard = groups.find((g) => g.key === "dashboard");
  return dashboard?.items.find((i) => i.isHome)?.path ?? "/";
};
