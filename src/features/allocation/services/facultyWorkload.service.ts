import { BaseService } from "@/shared/services";
import { payrollConfigService } from "@/features/payroll/services/payrollConfig.service";
import { earningsFor, resolveHourlyRate } from "@/features/payroll/utils/facultyRate";
import type { RoleRate, Shift, StaffRate } from "@/features/payroll/types/payroll.types";
import type { ClassSchedule, FacultyWorkload } from "../types/allocation.types";
import { scheduleService } from "./schedule.service";

// ─────────────────────────────────────────────────────────────────────────────
// Faculty workload + expected-salary engine (Phases 2 & 6).
//
// Composes two things that already exist — the class timetable
// (scheduleService) and the payroll salary configuration
// (payrollConfigService → role rates / staff rates / shifts) — into the
// per-faculty workload card every dashboard renders.
//
// It NEVER writes payroll and never re-implements salary arithmetic: the rate
// resolution lives in payroll/utils/facultyRate.ts and the real salary run
// still flows through computePayroll() untouched. What you see here is a
// projection ("expected salary" preview), which is exactly what the spec asks
// for at allocation time.
//
// Missing-table-safe: with the allocation migration unapplied every list comes
// back empty and this returns [] rather than throwing.
// ─────────────────────────────────────────────────────────────────────────────

/** Sum of duration minutes over a filtered subset. */
const minutes = (rows: ClassSchedule[]): number =>
  rows.reduce((t, c) => t + (c.durationMinutes || 0), 0);

/** Actual minutes when tracked, else the allocated duration. */
const actualMinutes = (rows: ClassSchedule[]): number =>
  rows.reduce((t, c) => t + (c.actualMinutes ?? c.durationMinutes ?? 0), 0);

export interface WorkloadWindow {
  from: string;
  to: string;
  /** Anchor day for the "today" column (defaults to the real today). */
  today?: string;
  /** Anchor for the "this week" column — the Monday of the week. */
  weekStart?: string;
  weekEnd?: string;
}

/** Monday-based week bounds for an ISO date (UTC-safe). */
export const weekBounds = (iso: string): { start: string; end: string } => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const dow = new Date(t).getUTCDay(); // 0=Sun
  const backToMonday = (dow + 6) % 7;
  const start = t - backToMonday * 86400000;
  return {
    start: new Date(start).toISOString().slice(0, 10),
    end: new Date(start + 6 * 86400000).toISOString().slice(0, 10),
  };
};

/**
 * Pure aggregation — exported so the workload maths is unit tested without any
 * database. `rates` maps staffId → { hourlyRate, source }.
 */
export const buildWorkload = (
  schedules: ClassSchedule[],
  rates: Map<string, { hourlyRate: number; source: FacultyWorkload["rateSource"] }>,
  win: WorkloadWindow,
): FacultyWorkload[] => {
  const today = win.today ?? new Date().toISOString().slice(0, 10);
  const wk = win.weekStart && win.weekEnd
    ? { start: win.weekStart, end: win.weekEnd }
    : weekBounds(today);

  const byTeacher = new Map<string, ClassSchedule[]>();
  for (const s of schedules) {
    if (!s.teacherId) continue;
    const list = byTeacher.get(s.teacherId) ?? [];
    list.push(s);
    byTeacher.set(s.teacherId, list);
  }

  const out: FacultyWorkload[] = [];
  for (const [teacherId, rows] of byTeacher) {
    const completed = rows.filter((r) => r.status === "completed");
    const cancelled = rows.filter((r) => r.status === "cancelled");
    const missed = rows.filter((r) => r.status === "missed");
    const remaining = rows.filter(
      (r) => r.status === "scheduled" || r.status === "in_progress",
    );
    // Cancelled classes are NOT part of the allocated load — nobody is expected
    // to teach them, so they must not depress utilisation or inflate expected pay.
    const chargeable = rows.filter((r) => r.status !== "cancelled");

    const started = rows.filter((r) => r.startedAt);
    const lateStarts = started.filter((r) => (r.lateMinutes ?? 0) > 0);
    const averageDelayMinutes =
      started.length > 0
        ? Math.round(started.reduce((t, r) => t + (r.lateMinutes ?? 0), 0) / started.length)
        : 0;

    const rate = rates.get(teacherId);
    const hourlyRate = rate?.hourlyRate ?? 0;
    const completedMinutes = actualMinutes(completed);
    const allocatedMinutes = minutes(chargeable);

    out.push({
      teacherId,
      teacherName: rows.find((r) => r.teacherName)?.teacherName,
      department: rows.find((r) => r.department)?.department,
      todayMinutes: minutes(chargeable.filter((r) => r.scheduleDate === today)),
      weekMinutes: minutes(
        chargeable.filter((r) => r.scheduleDate >= wk.start && r.scheduleDate <= wk.end),
      ),
      monthMinutes: allocatedMinutes,
      allocatedMinutes,
      completedMinutes,
      missedMinutes: minutes(missed),
      cancelledMinutes: minutes(cancelled),
      extraMinutes: minutes(completed.filter((r) => r.isExtra)),
      classesTaken: completed.length,
      classesRemaining: remaining.length,
      averageDelayMinutes,
      lateStarts: lateStarts.length,
      hourlyRate,
      rateSource: rate?.source ?? "none",
      salaryEarned: earningsFor(completedMinutes, hourlyRate),
      expectedSalary: earningsFor(allocatedMinutes, hourlyRate),
    });
  }

  return out.sort((a, b) => b.allocatedMinutes - a.allocatedMinutes);
};

class FacultyWorkloadService extends BaseService {
  /**
   * Resolve every staff member's effective hourly rate from the EXISTING
   * payroll configuration (individual rate → role rate → derived from monthly).
   */
  async rateMap(
    staff: { id: string; role?: string; department?: string }[],
  ): Promise<Map<string, { hourlyRate: number; source: FacultyWorkload["rateSource"] }>> {
    const map = new Map<string, { hourlyRate: number; source: FacultyWorkload["rateSource"] }>();
    let roleRates: RoleRate[] = [];
    let staffRates: StaffRate[] = [];
    let shifts: Shift[] = [];
    try {
      [roleRates, staffRates, shifts] = await Promise.all([
        payrollConfigService.listRoleRates(),
        payrollConfigService.listStaffRates(),
        payrollConfigService.listShifts(),
      ]);
    } catch {
      return map; // payroll config not migrated → rates simply unknown
    }
    const byStaff = new Map(staffRates.map((s) => [s.staffId, s]));
    for (const s of staff) {
      const roleRate = roleRates.find(
        (r) => r.isActive && r.role.toLowerCase() === (s.role ?? "").toLowerCase(),
      );
      const resolved = resolveHourlyRate({
        staffId: s.id,
        role: s.role,
        department: s.department,
        staffRate: byStaff.get(s.id),
        roleRate,
        shifts,
      });
      map.set(s.id, { hourlyRate: resolved.hourlyRate, source: resolved.source });
    }
    return map;
  }

  /** Workload + expected salary for every faculty with classes in the window. */
  async list(
    from: string,
    to: string,
    opts: { teacherId?: string; coordinatorId?: string; today?: string } = {},
  ): Promise<FacultyWorkload[]> {
    const schedules = await scheduleService.list({
      from,
      to,
      teacherId: opts.teacherId,
      coordinatorId: opts.coordinatorId,
      status: "all",
    });
    if (schedules.length === 0) return [];

    const ids = [...new Set(schedules.map((s) => s.teacherId).filter(Boolean))] as string[];
    const profiles = (await this.db
      .from("profiles" as never)
      .select("id, role, department")
      .in("id", ids)) as {
      data: { id: string; role?: string; department?: string }[] | null;
    };
    const staff = (profiles.data ?? []).length > 0
      ? (profiles.data as { id: string; role?: string; department?: string }[])
      : ids.map((id) => ({ id }));

    const rates = await this.rateMap(staff);
    return buildWorkload(schedules, rates, { from, to, today: opts.today });
  }

  /** One faculty member's card (My Classes / staff profile). */
  async forTeacher(teacherId: string, from: string, to: string): Promise<FacultyWorkload | null> {
    const list = await this.list(from, to, { teacherId });
    return list.find((w) => w.teacherId === teacherId) ?? null;
  }
}

export const facultyWorkloadService = new FacultyWorkloadService();
