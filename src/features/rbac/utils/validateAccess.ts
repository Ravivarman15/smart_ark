// ──────────────────────────────────────────────────────────────────────────────
// validateEffectiveAccess — sanity checks for the resolver output.
//
// Surfaced by the diagnostics page to answer "is the propagation pipeline
// healthy?". Walks the resolved EffectiveAccess + the raw inputs and reports:
//
//   - Whether a role is set at all
//   - Whether RBAC tables actually returned rows (or fell back to defaults)
//   - Modules referenced by the menu config that the resolver doesn't know
//   - Submodules referenced by the menu config that don't exist in the catalog
//   - Effective-access entries that point at unknown sources
//
// Pure function — no React, no Supabase. Call it inside a hook that already
// owns the inputs and the resolver result.
// ──────────────────────────────────────────────────────────────────────────────

import { NAV_CONFIG } from "@/core/navigation/menu.config";
import { MODULES_BY_ID, SUBMODULES_BY_ID } from "../constants/catalog";
import type {
  ActionRight,
  RolePermission,
  UserActionOverride,
  UserPermissionOverride,
} from "../types/rbac.types";
import type { EffectiveAccess } from "../resolver/types";

export type ValidationSeverity = "ok" | "warn" | "error";

export interface ValidationFinding {
  id: string;
  severity: ValidationSeverity;
  label: string;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  findings: ValidationFinding[];
  counts: {
    roleGrants: number;
    userOverrides: number;
    roleActionGrants: number;
    userActionOverrides: number;
    moduleEntries: number;
    actionEntries: number;
  };
}

export interface ValidationInput {
  role: string | undefined;
  rolePermissions: RolePermission[];
  userOverrides: UserPermissionOverride[];
  roleActions: ActionRight[];
  userActionOverrides: UserActionOverride[];
  effective: EffectiveAccess;
}

export const validateEffectiveAccess = (input: ValidationInput): ValidationResult => {
  const findings: ValidationFinding[] = [];

  if (!input.role) {
    findings.push({
      id: "no-role",
      severity: "error",
      label: "Role missing",
      detail: "User has no role assigned — all permission checks deny by default.",
    });
  }

  if (input.role && input.role !== "management") {
    const hasGrants =
      input.rolePermissions.length > 0 || input.roleActions.length > 0;
    if (!hasGrants) {
      findings.push({
        id: "no-grants",
        severity: "warn",
        label: "Role has no saved grants",
        detail:
          `Role "${input.role}" has zero rows in rbac_role_permissions and ` +
          "rbac_role_actions. The resolver is using catalog defaults — any change " +
          "in the Role Editor will create the first row and immediately flip the " +
          "role from permissive default to explicit configuration.",
      });
    }
  }

  // ── Menu / catalog alignment ──────────────────────────────────────────
  const menuModuleKeys = new Set<string>();
  const menuSubmoduleKeys = new Set<string>();
  for (const group of NAV_CONFIG) {
    if (group.module) menuModuleKeys.add(group.module);
    for (const item of group.items) {
      if (item.module) menuModuleKeys.add(item.module);
      if (item.submodule) menuSubmoduleKeys.add(item.submodule);
    }
  }
  for (const id of menuModuleKeys) {
    if (!MODULES_BY_ID[id as keyof typeof MODULES_BY_ID]) {
      findings.push({
        id: `menu-unknown-module:${id}`,
        severity: "error",
        label: "Menu references unknown module",
        detail: `menu.config.ts uses module="${id}" but it isn't in MODULE_CATALOG.`,
      });
    }
  }
  for (const id of menuSubmoduleKeys) {
    if (!SUBMODULES_BY_ID[id]) {
      findings.push({
        id: `menu-unknown-sub:${id}`,
        severity: "error",
        label: "Menu references unknown submodule",
        detail: `menu.config.ts uses submodule="${id}" but it isn't in MODULE_CATALOG.`,
      });
    }
  }

  // ── Resolver entries pointing at unknown sources ──────────────────────
  for (const [id, entry] of Object.entries(input.effective.modules)) {
    if (entry.source === "no_role" && input.role) {
      findings.push({
        id: `no-role-leak:${id}`,
        severity: "error",
        label: "Resolver returned no_role for a signed-in user",
        detail: `Module ${id} resolved to no_role despite role=${input.role}.`,
      });
    }
  }

  // ── Grant rows targeting modules/submodules the catalog doesn't have ──
  const knownModuleIds = new Set(Object.keys(MODULES_BY_ID));
  const knownSubIds = new Set(Object.keys(SUBMODULES_BY_ID));
  for (const grant of input.rolePermissions) {
    if (grant.role !== input.role) continue;
    if (!knownModuleIds.has(grant.moduleId)) {
      findings.push({
        id: `orphan-grant-module:${grant.moduleId}`,
        severity: "warn",
        label: "Orphan module grant",
        detail: `Row in rbac_role_permissions references module_id="${grant.moduleId}" which is no longer in MODULE_CATALOG.`,
      });
    }
    if (grant.submoduleId && !knownSubIds.has(grant.submoduleId)) {
      findings.push({
        id: `orphan-grant-sub:${grant.submoduleId}`,
        severity: "warn",
        label: "Orphan submodule grant",
        detail: `Row references submodule_id="${grant.submoduleId}" which is no longer in the catalog.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: "all-clear",
      severity: "ok",
      label: "Effective access pipeline healthy",
      detail: "Role set, grants loaded, catalog keys aligned, no orphans.",
    });
  }

  return {
    ok: !findings.some((f) => f.severity === "error"),
    findings,
    counts: {
      roleGrants: input.rolePermissions.length,
      userOverrides: input.userOverrides.length,
      roleActionGrants: input.roleActions.length,
      userActionOverrides: input.userActionOverrides.length,
      moduleEntries: Object.keys(input.effective.modules).length,
      actionEntries: Object.keys(input.effective.actions).length,
    },
  };
};
