import { BaseService, AppError } from "@/shared/services";
import type { UserPermissionOverride } from "../types/rbac.types";

type DbRow = {
  id: string;
  user_profile_id: string;
  module_id: string;
  submodule_id: string | null;
  can_view: boolean;
  reason: string | null;
  granted_by: string | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): UserPermissionOverride => ({
  id: r.id,
  userProfileId: r.user_profile_id,
  moduleId: r.module_id,
  submoduleId: r.submodule_id ?? undefined,
  canView: !!r.can_view,
  reason: r.reason ?? undefined,
  grantedBy: r.granted_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

const missingTableError = () =>
  AppError.validation(
    "RBAC override tables aren't set up yet. Apply migration " +
      "supabase/migrations/20260519_rbac_module_permissions.sql first.",
  );

class UserOverridesService extends BaseService {
  async listForUser(userProfileId: string): Promise<UserPermissionOverride[]> {
    const res = await this.db
      .from("rbac_user_permission_overrides" as never)
      .select("id, user_profile_id, module_id, submodule_id, can_view, reason, granted_by, created_at")
      .eq("user_profile_id", userProfileId);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_user_permission_overrides");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async upsert(args: {
    userProfileId: string;
    moduleId: string;
    submoduleId?: string | null;
    canView: boolean;
    reason?: string;
    grantedBy?: string;
  }): Promise<void> {
    const payload = {
      user_profile_id: args.userProfileId,
      module_id: args.moduleId,
      submodule_id: args.submoduleId ?? null,
      can_view: args.canView,
      reason: args.reason ?? null,
      granted_by: args.grantedBy ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("rbac_user_permission_overrides" as never)
      .upsert(payload as never, { onConflict: "user_profile_id,module_id,submodule_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_user_overrides.upsert");
    }
  }

  /** Remove an override → user falls back to role defaults. */
  async remove(args: { userProfileId: string; moduleId: string; submoduleId?: string | null }) {
    let q = this.db
      .from("rbac_user_permission_overrides" as never)
      .delete()
      .eq("user_profile_id", args.userProfileId)
      .eq("module_id", args.moduleId);
    if (args.submoduleId) q = q.eq("submodule_id", args.submoduleId);
    else q = q.is("submodule_id", null);
    const { error } = await q;
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_user_overrides.remove");
    }
  }
}

export const userOverridesService = new UserOverridesService();
