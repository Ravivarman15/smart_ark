export const ROLES = ["teacher", "admin", "coordinator", "management"] as const;
export type Role = (typeof ROLES)[number];

// management has implicit access to everything — used by PermissionGate /
// permission hook to short-circuit checks. Keeping the rule in one place
// makes it auditable.
export const SUPER_ROLES: readonly Role[] = ["management"];

export const ROLE_HOME_ROUTE: Record<Role, string> = {
  management: "/management",
  admin: "/admin",
  coordinator: "/coordinator",
  teacher: "/teacher",
};
