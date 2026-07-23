import { BaseService, AppError } from "@/shared/services";
import type { TimetableLock } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Timetable lock service — Management freezes a period so coordinators can't
// change schedules in it (schedule.service.assertUnlocked enforces this at the
// service layer; RLS also restricts who can write the locks table). Missing-
// table-safe: before migration, listing returns [] and nothing is locked.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

const toLock = (r: Record<string, unknown>): TimetableLock => ({
  id: String(r.id),
  periodStart: String(r.period_start ?? ""),
  periodEnd: String(r.period_end ?? ""),
  lockedBy: (r.locked_by as string) ?? undefined,
  reason: (r.reason as string) ?? undefined,
  isActive: r.is_active !== false,
  createdAt: (r.created_at as string) ?? undefined,
});

class TimetableLockService extends BaseService {
  async list(activeOnly = true): Promise<TimetableLock[]> {
    let q = this.db.from("timetable_locks" as never).select("*");
    if (activeOnly) q = q.eq("is_active", true);
    const res = await q.order("period_start", { ascending: false });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "timetable_locks");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toLock);
  }

  async lock(
    periodStart: string,
    periodEnd: string,
    opts: { reason?: string; lockedBy?: string } = {},
  ): Promise<void> {
    const res = await this.db.from("timetable_locks" as never).insert({
      period_start: periodStart,
      period_end: periodEnd,
      reason: opts.reason ?? null,
      locked_by: opts.lockedBy ?? null,
      is_active: true,
    } as never);
    if (res.error) throw AppError.fromSupabase(res.error, "timetable_locks");
  }

  async unlock(id: string): Promise<void> {
    const res = await this.db
      .from("timetable_locks" as never)
      .update({ is_active: false } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "timetable_locks");
  }
}

export const timetableLockService = new TimetableLockService();
