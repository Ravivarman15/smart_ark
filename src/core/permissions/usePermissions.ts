// ──────────────────────────────────────────────────────────────────────────────
// usePermissions — app-wide read API for "what can the current user do?"
//
// Single source of truth: every check funnels through the centralized
// `rbacResolver` (via `useEffectiveAccess`). The legacy `StaffRightsContext`
// snapshot is folded in by the resolver itself — only for catalog-unknown
// keys — so this hook no longer needs to AND-combine the two layers.
//
// Public surface kept intact (`hasRole`, `canViewModule`, `canViewSubmodule`,
// `canDoAction`) so existing callers continue to compile and behave the same
// way for everything the catalog knows about. Behaviour change: catalog-known
// keys are now decided by v2 alone, eliminating the class of bug where the
// matrix UI and the actual user view disagreed.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveAccess } from "@/features/rbac/hooks/useEffectiveAccess";
import { lookup } from "@/features/rbac/resolver/rbacResolver";
import { SUPER_ROLES, type Role } from "@/core/constants/roles";

export const usePermissions = () => {
  const { user } = useAuth();
  const { data, isLoading } = useEffectiveAccess();

  return useMemo(() => {
    const role = user?.role as Role | undefined;
    const isSuper = !!role && SUPER_ROLES.includes(role);

    return {
      role,
      isSuper,
      isLoading,
      hasRole: (allowed: Role[]) => !!role && allowed.includes(role),
      /**
       * Module visibility. Accepts both legacy module keys (from the old
       * StaffRightsContext enum) and new catalog ids. The resolver knows
       * which is which — catalog-known keys are decided by v2, unknown keys
       * fall through to legacy.
       */
      canViewModule: (key: string | undefined): boolean => {
        if (!key) return true;
        if (isSuper) return true;
        const entry = data.modules[key];
        return entry ? entry.allowed : true;
      },
      /** Submodule check — submodule ids live only in the v2 catalog. */
      canViewSubmodule: (key: string | undefined): boolean => {
        if (!key) return true;
        if (isSuper) return true;
        const entry = data.submodules[key];
        return entry ? entry.allowed : true;
      },
      /**
       * Action gate. Resolver-first: catalog-known action ids are decided
       * by v2; unknown ids fall back to the legacy `staff_action_rights`
       * snapshot the resolver has already folded in.
       */
      canDoAction: (key: string | undefined): boolean => {
        if (!key) return true;
        if (isSuper) return true;
        const entry = lookup(data, key);
        return entry ? entry.allowed : true;
      },
    };
  }, [user?.role, data, isLoading]);
};
