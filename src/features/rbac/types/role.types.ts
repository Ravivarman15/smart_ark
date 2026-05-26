// ──────────────────────────────────────────────────────────────────────────────
// Role Catalog (Phase 5) — domain types.
//
// Mirrors the `rbac_roles` table. A role catalog row drives:
//   - The "Manage Roles" page (lists + analytics + filters)
//   - The "Create Role" / "Edit Role" editor (metadata + permission builder)
//   - The role picker in CreateStaffSheet (replaces the hardcoded ROLES enum)
//   - The hierarchy filter (who can edit / assign which role)
// ──────────────────────────────────────────────────────────────────────────────

export type RoleCategory =
  | "leadership"
  | "operations"
  | "academic"
  | "finance"
  | "support"
  | "custom";

export interface CatalogRole {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category?: RoleCategory | string;
  /** 0 = highest authority (management). 100 = lowest. */
  hierarchyLevel: number;
  /** Which built-in layout/route the role uses (admin/coordinator/teacher/management). */
  baseRole?: "admin" | "coordinator" | "teacher" | "management" | string;
  color?: string;
  icon?: string;
  isActive: boolean;
  isSystem: boolean;
  isArchived: boolean;
  parentRoleSlug?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface CatalogRoleUpsert {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  hierarchyLevel?: number;
  baseRole?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
  parentRoleSlug?: string | null;
}

export type RoleAuditEventType =
  | "created"
  | "updated"
  | "cloned"
  | "archived"
  | "unarchived"
  | "permissions_changed"
  | "actions_changed"
  | "users_assigned"
  | "override_set"
  | "override_removed";

export interface RoleAuditEntry {
  id: string;
  actorId?: string;
  roleSlug: string;
  eventType: RoleAuditEventType | string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface RoleUsageStats {
  slug: string;
  /** Number of staff currently holding this role (from profiles.role). */
  userCount: number;
  /** Number of explicit module/submodule grants saved for this role. */
  moduleGrantCount: number;
  /** Number of explicit action grants saved for this role. */
  actionGrantCount: number;
}
