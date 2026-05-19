import type { Role } from "@/core/constants/roles";

/**
 * Single permission grant. `submoduleId === undefined` means the row applies
 * to the whole module — useful for "block this entire module for role X"
 * without enumerating every submodule.
 */
export interface RolePermission {
  id: string;
  role: Role | string;          // string fallback for future custom roles
  moduleId: string;
  submoduleId?: string;
  canView: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface UserPermissionOverride {
  id: string;
  userProfileId: string;
  moduleId: string;
  submoduleId?: string;
  canView: boolean;
  reason?: string;
  grantedBy?: string;
  createdAt?: string;
}

/**
 * Effective resolution for one user. Maps `module → boolean` and
 * `module.submodule → boolean`. Consumers (`useSidebarAccess`, the matrix
 * UI) read this map; computing it lives in `utils/effective.ts`.
 */
export interface EffectivePermissions {
  /** Per-module visibility (computed from grants + overrides). */
  modules: Record<string, boolean>;
  /** Per-submodule visibility, keyed by submodule id (e.g. "settings.profile"). */
  submodules: Record<string, boolean>;
}

/** Append-only audit row. Inserted by services when a grant changes. */
export interface PermissionAuditEntry {
  id: string;
  actorId?: string;
  targetRole?: string;
  targetUserId?: string;
  moduleId?: string;
  submoduleId?: string;
  prevCanView?: boolean;
  newCanView?: boolean;
  reason?: string;
  createdAt: string;
}

/** Form-state shape used by the matrix UI to upsert grants in bulk. */
export interface RolePermissionUpsert {
  role: Role | string;
  moduleId: string;
  submoduleId?: string | null;
  canView: boolean;
}

// ── Action rights (Phase 3) ─────────────────────────────────────────────────

export interface ActionRight {
  id: string;
  role: Role | string;
  actionId: string;
  isAllowed: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface UserActionOverride {
  id: string;
  userProfileId: string;
  actionId: string;
  isAllowed: boolean;
  reason?: string;
  grantedBy?: string;
  createdAt?: string;
}

export interface ActionAuditEntry {
  id: string;
  actorId?: string;
  targetRole?: string;
  targetUserId?: string;
  actionId?: string;
  prevIsAllowed?: boolean;
  newIsAllowed?: boolean;
  reason?: string;
  createdAt: string;
}

/** Resolved per-user map of action → allowed boolean. */
export interface EffectiveActions {
  /** Keyed by action id (e.g. "student.create"). */
  actions: Record<string, boolean>;
}

export interface ActionRightUpsert {
  role: Role | string;
  actionId: string;
  isAllowed: boolean;
}
