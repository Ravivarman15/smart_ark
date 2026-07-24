import { describe, it, expect } from "vitest";
import { buildWorkload, weekBounds } from "./facultyWorkload.service";
import { buildBoard, hhmmToMinutes } from "./classMonitor.service";
import { dueReminders } from "./classReminder.service";
import { scoreFaculty, weeksBetween } from "./facultyInsights.service";
import type { ClassSchedule, FacultyWorkload } from "../types/allocation.types";

// ════════════════════════════════════════════════════════════════════════════
// Phase-3 faculty tracking — the pure engines behind the live board, workload,
// reminders and insights. All four are exported as pure functions precisely so
// the maths is verified here without a database, a network or a wall clock.
// ════════════════════════════════════════════════════════════════════════════

const cls = (over: Partial<ClassSchedule> = {}): ClassSchedule =>
  ({
    id: "c1",
    teacherId: "t1",
    teacherName: "Mani",
    scheduleDate: "2026-07-24",
    startTime: "10:00",
    endTime: "12:00",
    durationMinutes: 120,
    mode: "offline",
    repeatWeekly: false,
    holidaySkip: true,
    isExtra: false,
    status: "scheduled",
    repeatPattern: "none",
    repeatDays: [],
    lateMinutes: 0,
    earlyMinutes: 0,
    ...over,
  }) as ClassSchedule;

// ── Workload ────────────────────────────────────────────────────────────────
describe("buildWorkload", () => {
  const rates = new Map([["t1", { hourlyRate: 350, source: "staff" as const }]]);

  it("splits allocated / completed / missed / cancelled and projects salary", () => {
    const rows = buildWorkload(
      [
        cls({ id: "a", status: "completed", actualMinutes: 120 }),
        cls({ id: "b", status: "completed", isExtra: true, actualMinutes: 60, durationMinutes: 60 }),
        cls({ id: "c", status: "missed" }),
        cls({ id: "d", status: "cancelled" }),
        cls({ id: "e", status: "scheduled" }),
      ],
      rates,
      { from: "2026-07-01", to: "2026-07-31", today: "2026-07-24" },
    );
    const w = rows[0];
    // Cancelled is excluded from the allocated load: 120 + 60 + 120 + 120 = 420
    expect(w.allocatedMinutes).toBe(420);
    expect(w.completedMinutes).toBe(180);
    expect(w.missedMinutes).toBe(120);
    expect(w.cancelledMinutes).toBe(120);
    expect(w.extraMinutes).toBe(60);
    expect(w.classesTaken).toBe(2);
    expect(w.classesRemaining).toBe(1);
    // 3h × ₹350 = ₹1,050 earned; 7h × ₹350 = ₹2,450 expected.
    expect(w.salaryEarned).toBe(1050);
    expect(w.expectedSalary).toBe(2450);
    expect(w.rateSource).toBe("staff");
  });

  it("prefers actual minutes over allocated when the class was tracked", () => {
    const [w] = buildWorkload(
      [cls({ status: "completed", durationMinutes: 120, actualMinutes: 108 })],
      rates,
      { from: "2026-07-01", to: "2026-07-31", today: "2026-07-24" },
    );
    expect(w.completedMinutes).toBe(108);
    expect(w.salaryEarned).toBe(630); // 1.8h × 350
  });

  it("averages the start delay and counts late starts", () => {
    const [w] = buildWorkload(
      [
        cls({ id: "a", status: "completed", startedAt: "2026-07-24T10:02:00Z", lateMinutes: 2 }),
        cls({ id: "b", status: "completed", startedAt: "2026-07-24T10:08:00Z", lateMinutes: 8 }),
        cls({ id: "c", status: "scheduled" }), // never started — not counted
      ],
      rates,
      { from: "2026-07-01", to: "2026-07-31", today: "2026-07-24" },
    );
    expect(w.averageDelayMinutes).toBe(5);
    expect(w.lateStarts).toBe(2);
  });

  it("buckets today's and this week's hours", () => {
    const [w] = buildWorkload(
      [
        cls({ id: "a", scheduleDate: "2026-07-24" }), // today (Fri)
        cls({ id: "b", scheduleDate: "2026-07-22" }), // same week
        cls({ id: "c", scheduleDate: "2026-07-10" }), // earlier month
      ],
      rates,
      { from: "2026-07-01", to: "2026-07-31", today: "2026-07-24" },
    );
    expect(w.todayMinutes).toBe(120);
    expect(w.weekMinutes).toBe(240);
    expect(w.monthMinutes).toBe(360);
  });

  it("reports a zero rate rather than guessing one", () => {
    const [w] = buildWorkload([cls({ status: "completed" })], new Map(), {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(w.hourlyRate).toBe(0);
    expect(w.rateSource).toBe("none");
    expect(w.salaryEarned).toBe(0);
  });
});

describe("weekBounds", () => {
  it("returns Monday → Sunday around a date", () => {
    // 2026-07-24 is a Friday.
    expect(weekBounds("2026-07-24")).toEqual({ start: "2026-07-20", end: "2026-07-26" });
  });

  it("keeps a Monday as its own week start", () => {
    expect(weekBounds("2026-07-20").start).toBe("2026-07-20");
  });

  it("puts Sunday at the END of its week, not the start", () => {
    expect(weekBounds("2026-07-26")).toEqual({ start: "2026-07-20", end: "2026-07-26" });
  });
});

// ── Live board ──────────────────────────────────────────────────────────────
describe("buildBoard", () => {
  const NOON = hhmmToMinutes("12:00");

  it("buckets live / upcoming / completed / not-started / cancelled", () => {
    const board = buildBoard(
      "2026-07-24",
      [
        cls({ id: "live", status: "in_progress", startTime: "11:00", endTime: "13:00", startedAt: "2026-07-24T11:00:00" }),
        cls({ id: "next", status: "scheduled", startTime: "14:00", endTime: "15:00" }),
        cls({ id: "done", status: "completed", startTime: "09:00", endTime: "10:00", attendanceSubmitted: true }),
        cls({ id: "late", status: "scheduled", startTime: "11:00", endTime: "12:30" }),
        cls({ id: "gone", status: "cancelled", startTime: "08:00", endTime: "09:00" }),
      ],
      NOON,
    );
    expect(board.live.map((c) => c.schedule.id)).toEqual(["live"]);
    expect(board.upcoming.map((c) => c.schedule.id)).toEqual(["next"]);
    expect(board.completed.map((c) => c.schedule.id)).toEqual(["done"]);
    expect(board.notStarted.map((c) => c.schedule.id)).toEqual(["late"]);
    expect(board.cancelled.map((c) => c.schedule.id)).toEqual(["gone"]);
    expect(board.totalClasses).toBe(5);
  });

  it("flags a scheduled class whose start time has passed as late", () => {
    const board = buildBoard(
      "2026-07-24",
      [cls({ status: "scheduled", startTime: "11:30", endTime: "12:30" })],
      NOON,
    );
    expect(board.lateFaculty).toHaveLength(1);
    expect(board.lateFaculty[0].delayMinutes).toBe(30);
    expect(board.averageDelayMinutes).toBe(30);
  });

  it("computes elapsed and remaining from the ACTUAL start", () => {
    const board = buildBoard(
      "2026-07-24",
      [
        cls({
          status: "in_progress",
          startTime: "10:00",
          endTime: "13:00",
          // Started 2 minutes late — elapsed must run from 10:02, not 10:00.
          startedAt: new Date(2026, 6, 24, 10, 2).toISOString(),
        }),
      ],
      NOON,
    );
    expect(board.live[0].elapsedMinutes).toBe(118);
    expect(board.live[0].remainingMinutes).toBe(60);
    expect(board.live[0].expectedEnd).toBe("13:00");
  });

  it("excludes cancelled classes from class utilisation", () => {
    const board = buildBoard(
      "2026-07-24",
      [
        cls({ id: "a", status: "completed" }),
        cls({ id: "b", status: "scheduled" }),
        cls({ id: "c", status: "cancelled" }),
      ],
      NOON,
    );
    // 1 completed of 2 chargeable = 50%, not 33%.
    expect(board.classUtilisationPct).toBe(50);
  });

  it("lists completed classes that still have no attendance", () => {
    const board = buildBoard(
      "2026-07-24",
      [
        cls({ id: "a", status: "completed", attendanceSubmitted: false }),
        cls({ id: "b", status: "completed", attendanceSubmitted: true }),
      ],
      NOON,
    );
    expect(board.attendancePending.map((c) => c.schedule.id)).toEqual(["a"]);
  });

  it("handles an empty day without dividing by zero", () => {
    const board = buildBoard("2026-07-24", [], NOON);
    expect(board.totalClasses).toBe(0);
    expect(board.averageDelayMinutes).toBe(0);
    expect(board.facultyUtilisationPct).toBe(0);
    expect(board.classUtilisationPct).toBe(0);
  });
});

// ── Reminders ───────────────────────────────────────────────────────────────
describe("dueReminders", () => {
  const at = (hhmm: string) => hhmmToMinutes(hhmm);

  it("reminds the faculty inside the 15-minute run-up", () => {
    const out = dueReminders([cls({ startTime: "10:00" })], at("09:50"));
    expect(out).toEqual([{ scheduleId: "c1", kind: "faculty_15" }]);
  });

  it("does not remind the faculty too early", () => {
    expect(dueReminders([cls({ startTime: "10:00" })], at("09:30"))).toEqual([]);
  });

  it("escalates to the coordinator inside the last 5 minutes", () => {
    const out = dueReminders([cls({ startTime: "10:00" })], at("09:58"));
    expect(out).toEqual([{ scheduleId: "c1", kind: "coordinator_5" }]);
  });

  it("stops reminding once the class has started", () => {
    expect(
      dueReminders(
        [cls({ startTime: "10:00", status: "in_progress", startedAt: "2026-07-24T09:58:00" })],
        at("09:58"),
      ),
    ).toEqual([]);
  });

  it("never reminds about a cancelled class", () => {
    expect(dueReminders([cls({ startTime: "10:00", status: "cancelled" })], at("09:50"))).toEqual(
      [],
    );
  });

  it("chases missing attendance after the grace period", () => {
    const out = dueReminders(
      [cls({ startTime: "10:00", endTime: "12:00", status: "completed", attendanceSubmitted: false })],
      at("12:31"),
    );
    expect(out).toEqual([{ scheduleId: "c1", kind: "attendance_missing" }]);
  });

  it("does not chase attendance that was already submitted", () => {
    expect(
      dueReminders(
        [cls({ startTime: "10:00", endTime: "12:00", status: "completed", attendanceSubmitted: true })],
        at("13:00"),
      ),
    ).toEqual([]);
  });
});

// ── Insights ────────────────────────────────────────────────────────────────
const workload = (over: Partial<FacultyWorkload> = {}): FacultyWorkload =>
  ({
    teacherId: "t1",
    teacherName: "Mani",
    todayMinutes: 0,
    weekMinutes: 0,
    monthMinutes: 0,
    allocatedMinutes: 0,
    completedMinutes: 0,
    missedMinutes: 0,
    cancelledMinutes: 0,
    extraMinutes: 0,
    classesTaken: 0,
    classesRemaining: 0,
    averageDelayMinutes: 0,
    lateStarts: 0,
    hourlyRate: 350,
    rateSource: "staff",
    salaryEarned: 0,
    expectedSalary: 0,
    ...over,
  }) as FacultyWorkload;

describe("scoreFaculty", () => {
  it("scores a fully-delivered, punctual, on-target faculty near the top", () => {
    const i = scoreFaculty(
      workload({
        allocatedMinutes: 72 * 60,
        completedMinutes: 72 * 60,
        salaryEarned: 25200,
        averageDelayMinutes: 0,
      }),
      4,
    );
    expect(i.productivityScore).toBe(100);
    expect(i.consistencyScore).toBe(100);
    expect(i.utilisation).toBe("balanced");
    expect(i.burnoutRisk).toBe("low");
    expect(i.costPerHour).toBe(350);
    expect(i.teachingEfficiencyPct).toBe(100);
  });

  it("marks a heavy, chronically-late load as over-utilised and high burnout risk", () => {
    const i = scoreFaculty(
      workload({
        allocatedMinutes: 120 * 60, // 30h/week over 4 weeks
        completedMinutes: 120 * 60,
        averageDelayMinutes: 15,
      }),
      4,
    );
    expect(i.utilisation).toBe("over");
    expect(i.burnoutRisk).toBe("high");
    expect(i.recommendations.some((r) => r.includes("Reduce load"))).toBe(true);
  });

  it("flags an under-utilised faculty member", () => {
    const i = scoreFaculty(
      workload({ allocatedMinutes: 16 * 60, completedMinutes: 16 * 60 }),
      4,
    );
    expect(i.utilisation).toBe("under");
    expect(i.recommendations.some((r) => r.includes("Capacity available"))).toBe(true);
  });

  it("penalises missed classes in the productivity score", () => {
    const clean = scoreFaculty(workload({ allocatedMinutes: 600, completedMinutes: 600 }), 1);
    const missed = scoreFaculty(
      workload({ allocatedMinutes: 600, completedMinutes: 600, missedMinutes: 300 }),
      1,
    );
    expect(missed.productivityScore).toBeLessThan(clean.productivityScore);
    expect(missed.recommendations.some((r) => r.includes("missed"))).toBe(true);
  });

  it("never divides by zero for a faculty member with no activity", () => {
    const i = scoreFaculty(workload(), 4);
    expect(Number.isFinite(i.productivityScore)).toBe(true);
    expect(i.teachingEfficiencyPct).toBe(0);
    expect(i.costPerHour).toBe(350); // falls back to the configured rate
  });
});

describe("weeksBetween", () => {
  it("counts inclusive days as weeks", () => {
    expect(weeksBetween("2026-07-01", "2026-07-28")).toBeCloseTo(4, 5);
  });

  it("never returns less than one week", () => {
    expect(weeksBetween("2026-07-01", "2026-07-01")).toBe(1);
  });
});
