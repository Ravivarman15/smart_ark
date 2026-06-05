import { BaseService, AppError } from "@/shared/services";
import type { AttendanceMarker } from "../../types/attendance.types";
import { lockWindow } from "../utils/governance";
import { governanceAuditService, isGovMissing } from "./governanceAudit.service";
import type { AttendanceLock, GovScope, LockInput, LockPeriodType } from "../types/governance.types";

const toLock = (r: Record<string, unknown>): AttendanceLock => ({
  id: String(r.id),
  scope: (r.scope as GovScope) ?? "all",
  periodType: (r.period_type as LockPeriodType) ?? "month",
  periodKey: String(r.period_key ?? ""),
  fromDate: String(r.from_date ?? ""),
  toDate: String(r.to_date ?? ""),
  locked: Boolean(r.locked),
  reason: (r.reason as string) ?? undefined,
  lockedBy: (r.locked_by as string) ?? undefined,
  lockedByName: (r.locked_by_name as string) ?? undefined,
  lockedByRole: (r.locked_by_role as string) ?? undefined,
  lockedAt: (r.locked_at as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

/**
 * Attendance period locks (day / week / month × student / staff / all).
 * Locking a period blocks edits, imports and corrections for any attendance row
 * in [from_date, to_date] — enforced by `lockGuardService` in the write path.
 */
class LocksService extends BaseService {
  private table() {
    return this.db.from("attendance_locks" as never);
  }

  async list(): Promise<AttendanceLock[]> {
    const res = await this.table()
      .select(
        "id, scope, period_type, period_key, from_date, to_date, locked, reason, locked_by, locked_by_name, locked_by_role, locked_at, updated_at",
      )
      .order("from_date", { ascending: false })
      .limit(500);
    if (res.error) {
      if (isGovMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_locks");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toLock);
  }

  /** Create / re-assert a lock for a period. Upserts on (scope, period_type, period_key). */
  async lock(input: LockInput, marker?: AttendanceMarker): Promise<void> {
    const w = lockWindow(input.periodType, input.date);
    const payload = {
      scope: input.scope,
      period_type: input.periodType,
      period_key: w.periodKey,
      from_date: w.fromDate,
      to_date: w.toDate,
      locked: true,
      reason: input.reason ?? null,
      locked_by: marker?.profileId ?? null,
      locked_by_name: marker?.name ?? null,
      locked_by_role: marker?.role ?? null,
      locked_at: new Date().toISOString(),
    };
    const res = await this.table().upsert(payload as never, { onConflict: "scope,period_type,period_key" });
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_locks.lock");
    await governanceAuditService.log(
      {
        entityType: "lock",
        action: "locked",
        scope: input.scope,
        summary: `Locked ${input.scope} ${input.periodType} ${w.periodKey}`,
        newValue: { scope: input.scope, periodType: input.periodType, periodKey: w.periodKey },
        reason: input.reason,
      },
      marker,
    );
  }

  /** Toggle an existing lock row by id. */
  async setLocked(id: string, locked: boolean, marker?: AttendanceMarker, reason?: string): Promise<void> {
    const res = await this.table()
      .update({ locked, reason: reason ?? null } as never)
      .eq("id", id)
      .select("scope, period_type, period_key")
      .limit(1);
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_locks.setLocked");
    const row = ((res.data ?? []) as Record<string, unknown>[])[0];
    await governanceAuditService.log(
      {
        entityType: "lock",
        entityId: id,
        action: locked ? "locked" : "unlocked",
        scope: row?.scope as string,
        summary: `${locked ? "Locked" : "Unlocked"} ${row?.scope ?? ""} ${row?.period_key ?? ""}`,
        reason,
      },
      marker,
    );
  }

  /** Unlock by (scope, periodType, periodKey) — used by approved unlock requests. */
  async unlockByKey(
    scope: GovScope,
    periodType: LockPeriodType,
    periodKey: string,
    marker?: AttendanceMarker,
    reason?: string,
  ): Promise<void> {
    const res = await this.table()
      .update({ locked: false, reason: reason ?? null } as never)
      .eq("scope", scope)
      .eq("period_type", periodType)
      .eq("period_key", periodKey);
    if (res.error && !isGovMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "attendance_locks.unlockByKey");
    }
    await governanceAuditService.log(
      {
        entityType: "lock",
        action: "unlocked",
        scope,
        summary: `Unlocked ${scope} ${periodKey} (approved request)`,
        reason,
      },
      marker,
    );
  }

  async remove(id: string): Promise<void> {
    const res = await this.table().delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "attendance_locks.remove");
  }
}

export const locksService = new LocksService();
