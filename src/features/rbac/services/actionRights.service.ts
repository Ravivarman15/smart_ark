import { BaseService, AppError } from "@/shared/services";
import type { Role } from "@/core/constants/roles";
import type { ActionRight, ActionRightUpsert } from "../types/rbac.types";

// `rbac_role_actions` isn't in the generated `Database` type yet (migration
// 20260519_rbac_action_rights.sql lands it). We cast the table name to `never`
// to keep `BaseService.guard*` happy without polluting generated types — same
// pattern as Phase 2's rolePermissions service.
type DbRow = {
  id: string;
  role: string;
  action_id: string;
  is_allowed: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

const toDomain = (r: DbRow): ActionRight => ({
  id: r.id,
  role: r.role,
  actionId: r.action_id,
  isAllowed: !!r.is_allowed,
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

// "Table-missing" is silenced on reads (older deployments may not have run
// the migration); writes turn it into a clear validation error so the user
// knows exactly which SQL file to apply.
const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

const missingTableError = () =>
  AppError.validation(
    "RBAC action-rights tables aren't set up yet. " +
      "Apply migration supabase/migrations/20260519_rbac_action_rights.sql " +
      "(and 20260519_rbac_module_permissions.sql) via the Supabase SQL editor, " +
      "then reload this page.",
  );

class ActionRightsService extends BaseService {
  /**
   * Read action grants for a role (or every grant if `role` is omitted, used
   * by the matrix editor when copying across roles).
   */
  async list(role?: Role | string): Promise<ActionRight[]> {
    let q = this.db
      .from("rbac_role_actions" as never)
      .select("id, role, action_id, is_allowed, updated_at, updated_by");
    if (role) q = q.eq("role", role);
    const res = await q;
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_role_actions");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  /** Upsert a single (role, action) grant. */
  async upsert(input: ActionRightUpsert, updatedBy?: string): Promise<void> {
    const payload = {
      role: input.role,
      action_id: input.actionId,
      is_allowed: input.isAllowed,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    };
    const { error } = await this.db
      .from("rbac_role_actions" as never)
      .upsert(payload as never, { onConflict: "role,action_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_actions.upsert");
    }
  }

  /**
   * Bulk upsert. Used by the matrix UI to commit a whole role at once.
   * Partial failures throw on the first bad row.
   */
  async upsertMany(rows: ActionRightUpsert[], updatedBy?: string): Promise<void> {
    if (rows.length === 0) return;
    const stamp = new Date().toISOString();
    const payload = rows.map((r) => ({
      role: r.role,
      action_id: r.actionId,
      is_allowed: r.isAllowed,
      updated_at: stamp,
      updated_by: updatedBy ?? null,
    }));
    const { error } = await this.db
      .from("rbac_role_actions" as never)
      .upsert(payload as never, { onConflict: "role,action_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_actions.upsertMany");
    }
  }

  /** Reset every action grant for a role — wipe and re-seed from catalog defaults. */
  async resetRole(role: Role | string): Promise<void> {
    const { error } = await this.db
      .from("rbac_role_actions" as never)
      .delete()
      .eq("role", role);
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_role_actions.reset");
    }
  }
}

export const actionRightsService = new ActionRightsService();
