import { BaseService, AppError } from "@/shared/services";
import type { UserActionOverride } from "../types/rbac.types";

type DbRow = {
  id: string;
  user_profile_id: string;
  action_id: string;
  is_allowed: boolean;
  reason: string | null;
  granted_by: string | null;
  created_at: string | null;
};

const toDomain = (r: DbRow): UserActionOverride => ({
  id: r.id,
  userProfileId: r.user_profile_id,
  actionId: r.action_id,
  isAllowed: !!r.is_allowed,
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
    "RBAC action-override tables aren't set up yet. Apply migration " +
      "supabase/migrations/20260519_rbac_action_rights.sql first.",
  );

class UserActionOverridesService extends BaseService {
  async listForUser(userProfileId: string): Promise<UserActionOverride[]> {
    const res = await this.db
      .from("rbac_user_action_overrides" as never)
      .select("id, user_profile_id, action_id, is_allowed, reason, granted_by, created_at")
      .eq("user_profile_id", userProfileId);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_user_action_overrides");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async upsert(args: {
    userProfileId: string;
    actionId: string;
    isAllowed: boolean;
    reason?: string;
    grantedBy?: string;
  }): Promise<void> {
    const payload = {
      user_profile_id: args.userProfileId,
      action_id: args.actionId,
      is_allowed: args.isAllowed,
      reason: args.reason ?? null,
      granted_by: args.grantedBy ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("rbac_user_action_overrides" as never)
      .upsert(payload as never, { onConflict: "user_profile_id,action_id" });
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_user_action_overrides.upsert");
    }
  }

  /** Remove an override → the user falls back to the role grant / catalog default. */
  async remove(args: { userProfileId: string; actionId: string }): Promise<void> {
    const { error } = await this.db
      .from("rbac_user_action_overrides" as never)
      .delete()
      .eq("user_profile_id", args.userProfileId)
      .eq("action_id", args.actionId);
    if (error) {
      if (isTableMissing(error)) throw missingTableError();
      throw AppError.fromSupabase(error, "rbac_user_action_overrides.remove");
    }
  }
}

export const userActionOverridesService = new UserActionOverridesService();
