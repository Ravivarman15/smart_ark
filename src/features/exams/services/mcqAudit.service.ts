import { BaseService } from "@/shared/services";
import type { AuditActor } from "./examAudit.service";
import type { McqAuditEntry } from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ audit service — the audit-safe trail for papers and bank questions.
//
// Mirrors examAuditService: logging is BEST-EFFORT, so a failure to write the
// trail never fails the underlying action, and reads degrade to an empty list
// when the table is absent. Writes to `mcq_audit`, whose `entity_id` is NOT a
// foreign key — an audit row outlives the paper/question it describes.
// ─────────────────────────────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

class McqAuditService extends BaseService {
  /** Append an audit event. Never throws — the trail must not block actions. */
  async log(
    entityType: "paper" | "question",
    entityId: string | null,
    eventType: string,
    detail?: string,
    actor?: AuditActor,
  ): Promise<void> {
    try {
      await this.db.from("mcq_audit").insert({
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        detail: detail ?? null,
        actor_id: actor?.actorId ?? null,
        actor_name: actor?.actorName ?? null,
      } as never);
    } catch {
      /* audit table absent / not writable — skip silently */
    }
  }

  /** Audit history for one entity, newest first. Empty if unavailable. */
  async listForEntity(
    entityType: "paper" | "question",
    entityId: string,
  ): Promise<McqAuditEntry[]> {
    const { data, error } = await this.db
      .from("mcq_audit")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as unknown as AuditRow[]).map((r) => ({
      id: r.id,
      entityType: (r.entity_type as "paper" | "question") ?? "paper",
      entityId: r.entity_id ?? undefined,
      eventType: r.event_type,
      detail: r.detail ?? undefined,
      actorName: r.actor_name ?? undefined,
      createdAt: r.created_at,
    }));
  }
}

export const mcqAuditService = new McqAuditService();
