// ──────────────────────────────────────────────────────────────────────────────
// Catalog-default helpers — used by "Sync defaults" buttons in the matrix UI.
//
// Produces the full set of role-level rows that *match the catalog's
// defaultRoles*. Saving them turns the implicit catalog default into explicit
// rows in `rbac_role_permissions` so the matrix and the user view never
// drift (the resolver's `roleHasAnyConfiguration` flag flips immediately and
// management's intent becomes the source of truth).
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";
import { MODULE_CATALOG } from "../constants/catalog";
import { ACTION_CATALOG } from "../constants/actionCatalog";
import type {
  ActionRightUpsert,
  RolePermissionUpsert,
} from "../types/rbac.types";

export const buildDefaultModuleRows = (role: Role | string): RolePermissionUpsert[] => {
  const rows: RolePermissionUpsert[] = [];
  for (const m of MODULE_CATALOG) {
    const visible = m.defaultRoles.includes(role as Role);
    rows.push({ role, moduleId: m.id, submoduleId: null, canView: visible });
    for (const s of m.submodules) {
      rows.push({ role, moduleId: m.id, submoduleId: s.id, canView: visible });
    }
  }
  return rows;
};

export const buildDefaultActionRows = (role: Role | string): ActionRightUpsert[] => {
  const rows: ActionRightUpsert[] = [];
  for (const a of ACTION_CATALOG) {
    rows.push({ role, actionId: a.id, isAllowed: true });
  }
  return rows;
};
