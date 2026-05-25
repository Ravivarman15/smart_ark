// ──────────────────────────────────────────────────────────────────────────────
// Help audit — best-effort append-only log over `support_audit`.
// FK-safe: actor_id is stripped on FK miss so audit never breaks the happy path.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import type {
  HelpAuditAction,
  HelpAuditEntity,
  HelpAuditEntry,
} from "../types/help.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface AuditInput {
  entityType: HelpAuditEntity;
  entityId?: string;
  action: HelpAuditAction;
  actorId?: string;
  actorName?: string;
  payload?: Record<string, unknown>;
}

class HelpAuditService extends BaseService {
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
      const res = await safeInsert(this.db, "support_audit", row, ["actor_id"]);
      if (res.error && !isMissingTable(res.error)) {
        // eslint-disable-next-line no-console
        console.warn("[support_audit] insert failed", res.error.message);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[support_audit] unexpected", (e as Error).message);
    }
  }

  async list(
    entityType: HelpAuditEntity,
    entityId?: string,
    limit = 50,
  ): Promise<HelpAuditEntry[]> {
    let q = this.db
      .from("support_audit" as never)
      .select("id, entity_type, entity_id, action, actor_id, actor_name, payload, created_at")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (entityId) q = q.eq("entity_id", entityId);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_audit.list");
    }
    return ((res.data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      id: String(r.id),
      entityType: r.entity_type as HelpAuditEntity,
      entityId: (r.entity_id as string) ?? undefined,
      action: r.action as HelpAuditAction,
      actorId: (r.actor_id as string) ?? undefined,
      actorName: (r.actor_name as string) ?? undefined,
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
  }
}

export const helpAuditService = new HelpAuditService();
