import { BaseService } from "@/shared/services";
import { teachingHoursService } from "@/features/allocation/services/teachingHours.service";
import { scheduleService } from "@/features/allocation/services/schedule.service";
import { leaveImpactService } from "@/features/allocation/services/leaveImpact.service";
import type { PayrollDiscrepancy } from "@/features/allocation/types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Payroll pre-generation VALIDATION — surfaces discrepancies before a run is
// generated, so nobody is paid on incomplete data. It is NOT a report/export:
// it reuses teachingHoursService (completed vs extra), scheduleService (missing
// attendance on completed classes) and leaveImpactService (leave overlap) to
// produce a per-teacher discrepancy list. Missing-table-safe (returns []).
// ─────────────────────────────────────────────────────────────────────────────

class PayrollValidationService extends BaseService {
  /** Per-teacher discrepancy lines for the period. */
  async buildDiscrepancy(from: string, to: string): Promise<PayrollDiscrepancy[]> {
    const [hoursMap, schedules, affected] = await Promise.all([
      teachingHoursService.aggregate(from, to),
      scheduleService.list({ from, to }),
      leaveImpactService.affectedClasses(from, to),
    ]);

    // Completed class ids missing per-class attendance rows.
    const completed = schedules.filter((s) => s.status === "completed");
    const missingByTeacher = new Map<string, number>();
    if (completed.length > 0) {
      const withAttendance = await this.completedWithAttendance(completed.map((s) => s.id));
      for (const s of completed) {
        if (!withAttendance.has(s.id) && !s.attendanceSubmitted && s.teacherId) {
          missingByTeacher.set(s.teacherId, (missingByTeacher.get(s.teacherId) ?? 0) + 1);
        }
      }
    }

    // Substitute minutes: minutes a teacher gained on classes where they are the
    // substitute (original_teacher_id set and != them).
    const substituteByTeacher = new Map<string, number>();
    for (const s of schedules) {
      if (s.status === "completed" && s.originalTeacherId && s.teacherId &&
          s.originalTeacherId !== s.teacherId) {
        substituteByTeacher.set(
          s.teacherId,
          (substituteByTeacher.get(s.teacherId) ?? 0) + s.durationMinutes,
        );
      }
    }

    const leaveCountByTeacher = new Map<string, number>();
    for (const a of affected) {
      const tid = a.schedule.teacherId;
      if (tid) leaveCountByTeacher.set(tid, (leaveCountByTeacher.get(tid) ?? 0) + 1);
    }

    // Union of every teacher that appears anywhere.
    const teacherIds = new Set<string>([
      ...hoursMap.keys(),
      ...missingByTeacher.keys(),
      ...substituteByTeacher.keys(),
      ...leaveCountByTeacher.keys(),
    ]);

    const out: PayrollDiscrepancy[] = [];
    for (const tid of teacherIds) {
      const h = hoursMap.get(tid);
      const missing = missingByTeacher.get(tid) ?? 0;
      const substitute = substituteByTeacher.get(tid) ?? 0;
      const leaveClasses = leaveCountByTeacher.get(tid) ?? 0;
      const flags: string[] = [];
      if (missing > 0) flags.push(`${missing} completed class(es) missing attendance`);
      if ((h?.scheduledMinutes ?? 0) > 0) flags.push("has still-scheduled (unfinished) classes");
      if (leaveClasses > 0) flags.push(`${leaveClasses} class(es) overlap a leave request`);
      out.push({
        teacherId: tid,
        teacherName: h?.teacherName,
        scheduledMinutes: h?.scheduledMinutes ?? 0,
        completedMinutes: h?.totalMinutes ?? 0,
        extraMinutes: h?.extraMinutes ?? 0,
        cancelledCount: h?.cancelledCount ?? 0,
        missedCount: h?.missedCount ?? 0,
        substituteMinutes: substitute,
        missingAttendanceCount: missing,
        flags,
      });
    }
    // Surface the most problematic teachers first.
    out.sort((a, b) => b.flags.length - a.flags.length);
    return out;
  }

  /** Subset of the given schedule ids that have at least one class_attendance row. */
  private async completedWithAttendance(scheduleIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (scheduleIds.length === 0) return set;
    const res = await this.db
      .from("class_attendance" as never)
      .select("class_schedule_id")
      .in("class_schedule_id", scheduleIds);
    if (res.error) return set;
    for (const r of (res.data as unknown as { class_schedule_id: string }[]) ?? [])
      set.add(String(r.class_schedule_id));
    return set;
  }
}

export const payrollValidationService = new PayrollValidationService();
