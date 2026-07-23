import { BaseService } from "@/shared/services";
import { scheduleService } from "./schedule.service";
import type { LeaveAffectedClass } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Leave-impact service — when a teacher has a leave request, surface the classes
// scheduled inside that window so a coordinator can reschedule or assign a
// substitute. Reads the existing leave_requests table (does NOT re-implement
// leave) and the Phase-1 class_schedules. Missing-table-safe.
// ─────────────────────────────────────────────────────────────────────────────

interface LeaveRow {
  user_id?: string;
  start_date?: string;
  end_date?: string;
  leave_type?: string;
  status?: string;
}

class LeaveImpactService extends BaseService {
  /**
   * Classes still needing coverage because their teacher is on (or requesting)
   * leave. Scans approved + pending leave overlapping [from, to] and returns the
   * scheduled classes in each teacher's leave window.
   */
  async affectedClasses(
    from: string,
    to: string,
    opts: { teacherId?: string } = {},
  ): Promise<LeaveAffectedClass[]> {
    let q = this.db
      .from("leave_requests" as never)
      .select("user_id, start_date, end_date, leave_type, status")
      .in("status", ["approved", "pending"])
      .lte("start_date", to)
      .gte("end_date", from);
    if (opts.teacherId) q = q.eq("user_id", opts.teacherId);
    const leaveRes = await q;
    if (leaveRes.error) return []; // leave module absent

    const leaves = (leaveRes.data as unknown as LeaveRow[]) ?? [];
    const out: LeaveAffectedClass[] = [];
    for (const lv of leaves) {
      if (!lv.user_id || !lv.start_date || !lv.end_date) continue;
      // Scheduled classes for this teacher inside the leave window that still
      // need coverage (not already completed/cancelled/rescheduled).
      const classes = await scheduleService.list({
        teacherId: lv.user_id,
        from: lv.start_date,
        to: lv.end_date,
        status: "scheduled",
      });
      for (const schedule of classes) {
        out.push({ schedule, leaveType: lv.leave_type, leaveStatus: lv.status });
      }
    }
    return out;
  }
}

export const leaveImpactService = new LeaveImpactService();
