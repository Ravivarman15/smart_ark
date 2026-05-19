import { BaseService, AppError } from "@/shared/services";
import type { PermissionAuditEntry } from "../types/rbac.types";

type DbRow = {
  id: string;
  actor_id: string | null;
  target_role: string | null;
  target_user_id: string | null;
  module_id: string | null;
  submodule_id: string | null;
  prev_can_view: boolean | null;
  new_can_view: boolean | null;
  reason: string | null;
  created_at: string;
};

const toDomain = (r: DbRow): PermissionAuditEntry => ({
  id: r.id,
  actorId: r.actor_id ?? undefined,
  targetRole: r.target_role ?? undefined,
  targetUserId: r.target_user_id ?? undefined,
  moduleId: r.module_id ?? undefined,
  submoduleId: r.submodule_id ?? undefined,
  prevCanView: r.prev_can_view ?? undefined,
  newCanView: r.new_can_view ?? undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

// Append-only audit log. Reads exposed for the future "permission history"
// drawer; writes are fire-and-forget from `useAssignPermissions`.
class PermissionAuditService extends BaseService {
  async record(entry: Omit<PermissionAuditEntry, "id" | "createdAt">): Promise<void> {
    const payload = {
      actor_id: entry.actorId ?? null,
      target_role: entry.targetRole ?? null,
      target_user_id: entry.targetUserId ?? null,
      module_id: entry.moduleId ?? null,
      submodule_id: entry.submoduleId ?? null,
      prev_can_view: entry.prevCanView ?? null,
      new_can_view: entry.newCanView ?? null,
      reason: entry.reason ?? null,
    };
    const { error } = await this.db
      .from("rbac_permission_audit" as never)
      .insert(payload as never);
    // Audit failures are non-fatal — the permission update itself succeeded;
    // we don't want a missing audit table to break grants.
    if (error && !isTableMissing(error)) {
      // eslint-disable-next-line no-console
      console.warn("[rbac.audit]", error.message);
    }
  }

  async listForRole(role: string, limit = 50): Promise<PermissionAuditEntry[]> {
    const res = await this.db
      .from("rbac_permission_audit" as never)
      .select("id, actor_id, target_role, target_user_id, module_id, submodule_id, prev_can_view, new_can_view, reason, created_at")
      .eq("target_role", role)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_permission_audit");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }
}

export const permissionAuditService = new PermissionAuditService();
