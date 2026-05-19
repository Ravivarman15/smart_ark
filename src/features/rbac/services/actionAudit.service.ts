import { BaseService, AppError } from "@/shared/services";
import type { ActionAuditEntry } from "../types/rbac.types";

type DbRow = {
  id: string;
  actor_id: string | null;
  target_role: string | null;
  target_user_id: string | null;
  action_id: string | null;
  prev_is_allowed: boolean | null;
  new_is_allowed: boolean | null;
  reason: string | null;
  created_at: string;
};

const toDomain = (r: DbRow): ActionAuditEntry => ({
  id: r.id,
  actorId: r.actor_id ?? undefined,
  targetRole: r.target_role ?? undefined,
  targetUserId: r.target_user_id ?? undefined,
  actionId: r.action_id ?? undefined,
  prevIsAllowed: r.prev_is_allowed ?? undefined,
  newIsAllowed: r.new_is_allowed ?? undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

// Append-only audit log for action-rights changes. Mirrors permissionAuditService.
// Writes are fire-and-forget from `useAssignActionRights` — a missing audit table
// must NOT block the grant itself.
class ActionAuditService extends BaseService {
  async record(entry: Omit<ActionAuditEntry, "id" | "createdAt">): Promise<void> {
    const payload = {
      actor_id: entry.actorId ?? null,
      target_role: entry.targetRole ?? null,
      target_user_id: entry.targetUserId ?? null,
      action_id: entry.actionId ?? null,
      prev_is_allowed: entry.prevIsAllowed ?? null,
      new_is_allowed: entry.newIsAllowed ?? null,
      reason: entry.reason ?? null,
    };
    const { error } = await this.db
      .from("rbac_action_audit" as never)
      .insert(payload as never);
    if (error && !isTableMissing(error)) {
      // eslint-disable-next-line no-console
      console.warn("[rbac.action.audit]", error.message);
    }
  }

  async listForRole(role: string, limit = 50): Promise<ActionAuditEntry[]> {
    const res = await this.db
      .from("rbac_action_audit" as never)
      .select("id, actor_id, target_role, target_user_id, action_id, prev_is_allowed, new_is_allowed, reason, created_at")
      .eq("target_role", role)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_action_audit");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }
}

export const actionAuditService = new ActionAuditService();
