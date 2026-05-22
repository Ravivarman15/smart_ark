import { BaseService } from "@/shared/services";
import type { ExamAuditEntry } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Exam audit service — the audit-safe trail.
//
// Every lifecycle event (create, edit, reschedule, marks saved, publish, lock,
// delete) is logged here by the mutation hooks. Logging is BEST-EFFORT: a
// failure to write the trail must never fail the underlying action, so `log`
// swallows its own errors. Reads degrade to an empty list if the table is
// absent.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditActor {
  actorId?: string;
  actorName?: string;
}

type AuditRow = {
  id: string;
  exam_id: string | null;
  event_type: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

class ExamAuditService extends BaseService {
  /** Append an audit event. Never throws — the trail must not block actions. */
  async log(
    examId: string | null,
    eventType: string,
    detail?: string,
    actor?: AuditActor,
  ): Promise<void> {
    try {
      await this.db.from("exam_audit").insert({
        exam_id: examId,
        event_type: eventType,
        detail: detail ?? null,
        actor_id: actor?.actorId ?? null,
        actor_name: actor?.actorName ?? null,
      } as never);
    } catch {
      /* audit table absent / not writable — skip silently */
    }
  }

  /** Audit history for one exam, newest first. Empty if unavailable. */
  async listForExam(examId: string): Promise<ExamAuditEntry[]> {
    const { data, error } = await this.db
      .from("exam_audit")
      .select("*")
      .eq("exam_id", examId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as unknown as AuditRow[]).map((r) => ({
      id: r.id,
      examId: r.exam_id ?? undefined,
      eventType: r.event_type,
      detail: r.detail ?? undefined,
      actorId: r.actor_id ?? undefined,
      actorName: r.actor_name ?? undefined,
      createdAt: r.created_at,
    }));
  }
}

export const examAuditService = new ExamAuditService();
