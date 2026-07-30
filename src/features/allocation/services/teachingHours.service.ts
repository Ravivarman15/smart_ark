import { BaseService } from "@/shared/services";
import type { TeachingHours } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Teaching-hours aggregation — the single source of truth for "how many minutes
// did a teacher actually teach in a period". Consumed by:
//   • payrollRun.service (salary from completed teaching hours), and
//   • the teacher / coordinator / management dashboards.
//
// Pure reads, missing-table-safe (returns empty before the migration is applied)
// so it can be called from the payroll engine without ever throwing.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

interface Row {
  teacher_id?: string;
  teacher_name?: string;
  duration_minutes?: number;
  status?: string;
  is_extra?: boolean;
}

class TeachingHoursService extends BaseService {
  /**
   * Aggregate teaching minutes per teacher over [from, to]. Regular vs extra
   * completed minutes are split so payroll can route extra classes to overtime.
   */
  async aggregate(from: string, to: string): Promise<Map<string, TeachingHours>> {
    const acc = new Map<string, TeachingHours>();
    const res = await this.db
      .from("class_schedules" as never)
      .select("teacher_id, teacher_name, duration_minutes, status, is_extra")
      .gte("schedule_date", from)
      .lte("schedule_date", to);
    if (res.error) {
      if (isMissingTable(res.error)) return acc;
      return acc; // never throw into the payroll engine
    }
    for (const raw of (res.data as unknown as Row[]) ?? []) {
      const tid = String(raw.teacher_id ?? "");
      if (!tid) continue;
      const cur =
        acc.get(tid) ??
        ({
          teacherId: tid,
          teacherName: raw.teacher_name ?? undefined,
          totalMinutes: 0,
          extraMinutes: 0,
          scheduledMinutes: 0,
          inProgressMinutes: 0,
          inProgressCount: 0,
          cancelledCount: 0,
          missedCount: 0,
          completedCount: 0,
        } as TeachingHours);
      const mins = Number(raw.duration_minutes ?? 0);
      const status = String(raw.status ?? "scheduled");
      if (status === "completed") {
        cur.completedCount += 1;
        if (raw.is_extra) cur.extraMinutes += mins;
        else cur.totalMinutes += mins;
      } else if (status === "scheduled") {
        cur.scheduledMinutes += mins;
      } else if (status === "in_progress") {
        // Counted separately, never folded into completed: payroll must only
        // ever pay for a class the teacher actually ended.
        cur.inProgressMinutes += mins;
        cur.inProgressCount += 1;
      } else if (status === "cancelled") {
        cur.cancelledCount += 1;
      } else if (status === "missed") {
        cur.missedCount += 1;
      }
      acc.set(tid, cur);
    }
    return acc;
  }

  /** Convenience: one teacher's hours for a period. */
  async forTeacher(teacherId: string, from: string, to: string): Promise<TeachingHours> {
    const map = await this.aggregate(from, to);
    return (
      map.get(teacherId) ?? {
        teacherId,
        totalMinutes: 0,
        extraMinutes: 0,
        scheduledMinutes: 0,
        inProgressMinutes: 0,
        inProgressCount: 0,
        cancelledCount: 0,
        missedCount: 0,
        completedCount: 0,
      }
    );
  }
}

export const teachingHoursService = new TeachingHoursService();
