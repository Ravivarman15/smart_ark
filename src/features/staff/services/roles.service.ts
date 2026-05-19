import { ROLES, SUPER_ROLES, ROLE_HOME_ROUTE, type Role } from "@/core/constants/roles";

// ── Role catalogue / helpers ─────────────────────────────────────────────────
//
// Roles are a closed set declared in core/constants/roles.ts. This service
// exposes them through a service-shaped API so future role-management UIs
// can call `rolesService.list()` without depending on a constants import.
//
// When roles eventually move to a DB table (custom roles per tenant), this
// is the ONE file that changes — list() / get() become DB calls, and the
// constants file becomes a fallback for type-safety only.

interface RoleDescriptor {
  id: Role;
  label: string;
  /** True if this role bypasses all permission checks (e.g. management). */
  isSuper: boolean;
  /** Default landing route for this role. */
  homeRoute: string;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  management: "Management",
  coordinator: "Coordinator",
  teacher: "Teacher",
};

class RolesService {
  list(): RoleDescriptor[] {
    return ROLES.map((id) => ({
      id,
      label: ROLE_LABELS[id],
      isSuper: SUPER_ROLES.includes(id),
      homeRoute: ROLE_HOME_ROUTE[id],
    }));
  }

  get(id: Role): RoleDescriptor | undefined {
    return this.list().find((r) => r.id === id);
  }

  isSuper(id: Role | undefined): boolean {
    return !!id && SUPER_ROLES.includes(id);
  }
}

export const rolesService = new RolesService();
export type { RoleDescriptor };
