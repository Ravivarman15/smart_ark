// ──────────────────────────────────────────────────────────────────────────────
// Communication audit — append-only lifecycle log over `comms_audit`.
// All other comms services log here. Best-effort: any DB error is swallowed
// (logged to console) so audit never breaks the happy path.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import type {
  CommsAuditAction,
  CommsAuditEntity,
  CommsAuditEntry,
} from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface AuditInput {
  entityType: CommsAuditEntity;
  entityId?: string;
  action: CommsAuditAction;
  actorId?: string;
  actorName?: string;
  payload?: Record<string, unknown>;
}

class CommsAuditService extends BaseService {
  async log(input: AuditInput): Promise<void> {
    try {
      const row = {
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        action: input.action,
        actor_id: input.actorId ?? null,
        actor_name: input.actorName ?? null,
        payload: input.payload ?? {},
      };
      const res = await this.db.from("comms_audit" as never).insert(row as never);
      if (res.error && !isMissingTable(res.error)) {
        // Audit failures are best-effort.
        // eslint-disable-next-line no-console
        console.warn("[comms_audit] insert failed", res.error.message);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[comms_audit] unexpected", (e as Error).message);
    }
  }

  async list(entityType: CommsAuditEntity, entityId?: string, limit = 50): Promise<CommsAuditEntry[]> {
    let q = this.db
      .from("comms_audit" as never)
      .select("id, entity_type, entity_id, action, actor_id, actor_name, payload, created_at")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (entityId) q = q.eq("entity_id", entityId);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "comms_audit.list");
    }
    return ((res.data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      id: String(r.id),
      entityType: r.entity_type as CommsAuditEntity,
      entityId: (r.entity_id as string) ?? undefined,
      action: r.action as CommsAuditAction,
      actorId: (r.actor_id as string) ?? undefined,
      actorName: (r.actor_name as string) ?? undefined,
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }
}

export const commsAuditService = new CommsAuditService();
