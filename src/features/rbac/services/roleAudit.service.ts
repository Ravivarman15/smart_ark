import { BaseService, AppError } from "@/shared/services";
import type { RoleAuditEntry, RoleAuditEventType } from "../types/role.types";

// Append-only audit log for role-catalog lifecycle events. Permission-grant
// audits stay in `rbac_permission_audit` / `rbac_action_audit` — this is for
// "the role was created/cloned/archived" style events.

type DbRow = {
  id: string;
  actor_id: string | null;
  role_slug: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const toDomain = (r: DbRow): RoleAuditEntry => ({
  id: r.id,
  actorId: r.actor_id ?? undefined,
  roleSlug: r.role_slug,
  eventType: r.event_type as RoleAuditEventType,
  payload: r.payload ?? undefined,
  createdAt: r.created_at,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation")
  );
};

class RoleAuditService extends BaseService {
  async record(args: {
    actorId?: string;
    roleSlug: string;
    eventType: RoleAuditEventType;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db
      .from("rbac_role_audit" as never)
      .insert({
        actor_id: args.actorId ?? null,
        role_slug: args.roleSlug,
        event_type: args.eventType,
        payload: args.payload ?? null,
      } as never);
    // Audit failures are non-fatal — never let them break a role mutation.
    if (error && !isTableMissing(error)) {
      // eslint-disable-next-line no-console
      console.warn("[rbac.role_audit]", error.message);
    }
  }

  async list(roleSlug?: string, limit = 50): Promise<RoleAuditEntry[]> {
    let q = this.db
      .from("rbac_role_audit" as never)
      .select("id, actor_id, role_slug, event_type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (roleSlug) q = q.eq("role_slug", roleSlug);
    const res = await q;
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "rbac_role_audit");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }
}

export const roleAuditService = new RoleAuditService();
