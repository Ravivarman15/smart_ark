import { BaseService } from "@/shared/services";
import type {
  ClassMonitorBoard,
  ClassSchedule,
  MonitorCard,
} from "../types/allocation.types";
import { scheduleService } from "./schedule.service";

// ─────────────────────────────────────────────────────────────────────────────
// Realtime class monitor (Phase 4) — the coordinator / management live board.
//
// Reads the timetable through scheduleService (so RLS scoping is inherited for
// free: a coordinator only ever sees their own staff's classes) and buckets a
// single day into LIVE / upcoming / completed / not-started / late / cancelled
// / attendance-pending, with the derived timers each card shows.
//
// Pure bucketing lives in `buildBoard` so the timers and utilisation maths are
// unit tested without a database or a wall clock.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutes since midnight for an HH:MM wall-clock string. */
export const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesToHhmm = (mins: number): string => {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 100) : 0;

/**
 * Build the live board for one day.
 *
 * @param nowMinutes minutes since midnight "now" (injected so this is pure)
 * @param studentCounts optional batchId → headcount for the card's Students line
 */
export const buildBoard = (
  date: string,
  schedules: ClassSchedule[],
  nowMinutes: number,
  studentCounts: Map<string, number> = new Map(),
): ClassMonitorBoard => {
  const cards: MonitorCard[] = schedules.map((s) => {
    const startMin = hhmmToMinutes(s.startTime);
    const endMin = hhmmToMinutes(s.endTime);
    const live = s.status === "in_progress";
    // Elapsed is measured from the ACTUAL start when we have it, so a class that
    // began late shows the true running time rather than the planned one.
    const startedMin = s.startedAt
      ? (() => {
          const d = new Date(s.startedAt);
          return d.getHours() * 60 + d.getMinutes();
        })()
      : startMin;
    return {
      schedule: s,
      elapsedMinutes: live ? Math.max(0, nowMinutes - startedMin) : 0,
      remainingMinutes: live ? Math.max(0, endMin - nowMinutes) : 0,
      expectedEnd: s.endTime,
      isLate: (s.lateMinutes ?? 0) > 0 || (s.status === "scheduled" && nowMinutes > startMin),
      delayMinutes:
        (s.lateMinutes ?? 0) > 0
          ? (s.lateMinutes as number)
          : s.status === "scheduled" && nowMinutes > startMin
            ? nowMinutes - startMin
            : 0,
      attendancePending: !s.attendanceSubmitted && s.status !== "cancelled",
      studentCount: s.batchId ? (studentCounts.get(s.batchId) ?? 0) : 0,
    };
  });

  const live = cards.filter((c) => c.schedule.status === "in_progress");
  const completed = cards.filter((c) => c.schedule.status === "completed");
  const cancelled = cards.filter((c) => c.schedule.status === "cancelled");
  const scheduled = cards.filter((c) => c.schedule.status === "scheduled");
  const upcoming = scheduled.filter((c) => hhmmToMinutes(c.schedule.startTime) > nowMinutes);
  // "Not started" = the clock has passed the start time but nobody pressed Start.
  const notStarted = scheduled.filter((c) => hhmmToMinutes(c.schedule.startTime) <= nowMinutes);
  const lateFaculty = cards.filter((c) => c.delayMinutes > 0 && c.schedule.status !== "cancelled");
  const attendancePending = cards.filter(
    (c) => c.attendancePending && c.schedule.status === "completed",
  );

  const delays = cards.filter((c) => c.delayMinutes > 0);
  const chargeable = cards.length - cancelled.length;

  // Faculty utilisation = how many of today's faculty are actually engaged
  // (teaching now or already done) vs. everyone rostered today.
  const rostered = new Set(cards.map((c) => c.schedule.teacherId).filter(Boolean));
  const engaged = new Set(
    [...live, ...completed].map((c) => c.schedule.teacherId).filter(Boolean),
  );

  return {
    date,
    live,
    upcoming,
    completed,
    notStarted,
    cancelled,
    attendancePending,
    lateFaculty,
    totalClasses: cards.length,
    averageDelayMinutes:
      delays.length > 0
        ? Math.round(delays.reduce((t, c) => t + c.delayMinutes, 0) / delays.length)
        : 0,
    facultyUtilisationPct: pct(engaged.size, rostered.size),
    classUtilisationPct: pct(completed.length, chargeable),
  };
};

class ClassMonitorService extends BaseService {
  /** Today's live board (or any given date). */
  async board(
    date: string,
    opts: { coordinatorId?: string; teacherId?: string; standardId?: string } = {},
  ): Promise<ClassMonitorBoard> {
    const schedules = await scheduleService.list({
      from: date,
      to: date,
      status: "all",
      coordinatorId: opts.coordinatorId,
      teacherId: opts.teacherId,
      standardId: opts.standardId,
    });
    const now = new Date();
    const counts = await this.studentCounts(
      [...new Set(schedules.map((s) => s.batchId).filter(Boolean))] as string[],
    );
    return buildBoard(date, schedules, now.getHours() * 60 + now.getMinutes(), counts);
  }

  /** batchId → headcount, for the "Students 43" line on each live card. */
  private async studentCounts(batchIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (batchIds.length === 0) return map;
    const res = await this.db
      .from("students" as never)
      .select("id, batch_id")
      .in("batch_id", batchIds);
    if (res.error) return map; // students module unavailable → hide the count
    for (const r of (res.data as unknown as { batch_id?: string }[]) ?? []) {
      const b = String(r.batch_id ?? "");
      if (b) map.set(b, (map.get(b) ?? 0) + 1);
    }
    return map;
  }
}

export const classMonitorService = new ClassMonitorService();
