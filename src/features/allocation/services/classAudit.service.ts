import { BaseService, AppError } from "@/shared/services";
import type { ClassAuditEntry } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Class audit trail reader (Phase 12).
//
// Writes are performed by scheduleService.audit() at the moment of each action
// (allocation created/updated/deleted, class started, attendance started /
// completed, class ended, substitute assigned, transferred, cancelled) together
// with the actor's identity, role and device/browser/IP. This service is the
// read side used by the audit panels.
//
// Missing-table-safe — returns [] before the migration is applied.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

const toEntry = (r: Record<string, unknown>): ClassAuditEntry => ({
  id: String(r.id),
  classScheduleId: String(r.class_schedule_id ?? ""),
  action: String(r.action ?? ""),
  actorId: (r.actor_id as string) ?? undefined,
  actorName: (r.actor_name as string) ?? undefined,
  actorRole: (r.actor_role as string) ?? undefined,
  device: (r.device as string) ?? undefined,
  browser: (r.browser as string) ?? undefined,
  ip: (r.ip as string) ?? undefined,
  detail: (r.detail as Record<string, unknown>) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

class ClassAuditService extends BaseService {
  /** Full history of one class, newest first. */
  async forSchedule(classScheduleId: string): Promise<ClassAuditEntry[]> {
    const res = await this.db
      .from("class_schedule_audit" as never)
      .select("*")
      .eq("class_schedule_id", classScheduleId)
      .order("created_at", { ascending: false });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_schedule_audit");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toEntry);
  }

  /** Recent activity across all classes (management audit panel). */
  async recent(limit = 100, action?: string): Promise<ClassAuditEntry[]> {
    let q = this.db.from("class_schedule_audit" as never).select("*");
    if (action) q = q.eq("action", action);
    const res = await q.order("created_at", { ascending: false }).limit(limit);
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_schedule_audit");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toEntry);
  }
}

export const classAuditService = new ClassAuditService();
