import { BaseService, AppError } from "@/shared/services";
import type { Role } from "@/core/constants/roles";
import type { RolePermission, RolePermissionUpsert } from "../types/rbac.types";

// ── DB row shape (private) ───────────────────────────────────────────────────
// The `rbac_role_permissions` table isn't in the generated `Database` type
// yet (it lands when the user regenerates types from the migration). We use
// `as never` casts on the table name to keep `BaseService.guard*` happy
// without polluting the generated types.
type DbRow = {
  id: string;
  role: string;
  module_id: string;
  submodule_id: string | null;
  can_view: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

const toDomain = (r: DbRow): RolePermission => ({
  id: r.id,
  role: r.role,
  moduleId: r.module_id,
  submoduleId: r.submodule_id ?? undefined,
  canView: !!r.can_view,
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

// "Table-missing" is the only error we silence on reads — older deployments
// may not have run the migration yet. Writes turn it into a clear validation
// error pointing at the migration filename.
const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

const missingTableError = () =>
  AppError.validation(
    "RBAC tables aren't set up in this Supabase database yet. " +
      "Apply migration supabase/migrations/20260519_rbac_module_permissions.sql " +
      "(and 20260519_rbac_action_rights.sql) via the Supabase SQL editor, " +
      "then reload this page.",
  );

class RolePermissionsService extends BaseService {
  /**
   * Read all grants for a role (or every grant if `role` is omitted, used by
   * the matrix editor). Returns an empty array when the table doesn't exist
   * yet so the UI degrades to the catalog defaults.
   */
  async list(role?: Role | string): Promise<RolePermission[]> {
    let q = this.db
      .from("rbac_role_permissions" as never)
      .select("id, role, module_id, submodule_id, can_view, updated_at, updated_by");
    if (role) q = q.eq("role", role);
    const res = await q;
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_role_permissions");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  /**
   * Upsert a single grant by (role, module, submodule). The unique index
   * on those three columns powers the conflict target.
   */
  async upsert(input: RolePermissionUpsert, updatedBy?: string): Promise<void> {
    const payload = {
      role: input.role,
      module_id: input.moduleId,
      submodule_id: input.submoduleId ?? null,
      can_view: input.canView,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    };
    const { error } = await this.db
      .from("rbac_role_permissions" as never)
      .upsert(payload as never, { onConflict: "organization_id,role,module_id,submodule_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_permissions.upsert");
    }
  }

  /**
   * Bulk upsert. Used by the matrix UI to commit a whole role at once.
   * The DB ensures atomicity at the row level; logically we treat the
   * batch as best-effort — partial failures throw on the first bad row.
   */
  async upsertMany(rows: RolePermissionUpsert[], updatedBy?: string): Promise<void> {
    if (rows.length === 0) return;
    const stamp = new Date().toISOString();
    const payload = rows.map((r) => ({
      role: r.role,
      module_id: r.moduleId,
      submodule_id: r.submoduleId ?? null,
      can_view: r.canView,
      updated_at: stamp,
      updated_by: updatedBy ?? null,
    }));
    const { error } = await this.db
      .from("rbac_role_permissions" as never)
      .upsert(payload as never, { onConflict: "organization_id,role,module_id,submodule_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_permissions.upsertMany");
    }
  }

  /**
   * Reset every grant for a role. Use sparingly — preferred path is
   * upserting `can_view = true` for everything so the audit trail captures
   * the change.
   */
  async resetRole(role: Role | string): Promise<void> {
    const { error } = await this.db
      .from("rbac_role_permissions" as never)
      .delete()
      .eq("role", role);
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_permissions.reset");
    }
  }
}

export const rolePermissionsService = new RolePermissionsService();
