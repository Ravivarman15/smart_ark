import { describe, it, expect } from "vitest";

import {
  computeWorkHours,
  aggregateWorkHours,
  expectedForStatus,
  minutesBetween,
  parseTimeToMinutes,
  DEFAULT_SETTINGS,
} from "../utils/workHours";
import {
  addDays,
  previousDay,
  monthStart,
  monthEnd,
  dateRange,
  composeTimestamp,
} from "../utils/dates";
import {
  computeStudentRiskScore,
  computeStaffRiskScore,
  riskLevelFromScore,
  studentDedupe,
  staffDedupe,
  buildStudentAlerts,
  buildStaffAlerts,
} from "../automation/utils/scan";
import {
  templateKeyForAlert,
  renderAlert,
} from "../automation/utils/alertTemplates";
import {
  lockWindow,
  monthWindow,
  coversDate,
} from "../governance/utils/governance";
import type { AttendanceSettings, StaffAttendanceRecord } from "../types/attendance.types";
import type { DefaulterRow, StaffPerfRow } from "../analytics/types/analytics.types";
import type { AttendanceAlert } from "../automation/types/automation.types";

// ════════════════════════════════════════════════════════════════════════════
// ATTENDANCE QA — executable verification.
//
// This is the runnable half of the attendance QA pass. It feeds the SAME shapes
// the SQL seed (supabase/seed/attendance_seed.sql) produces through the REAL,
// centralised attendance engines and asserts every derived figure against an
// independent hand calculation. No mocks, no stubbed success — if any engine
// drifts (work-hours, risk scoring, alert builders, governance windows), this
// fails. Live-environment checks (realtime, RLS/RBAC at runtime, WhatsApp
// delivery, exports, mobile) are listed in testing/README.md as manual steps —
// they are NOT asserted here and are NOT claimed as passing.
// ════════════════════════════════════════════════════════════════════════════

// Engine settings used across the work-hours cases. Institute day 09:00–17:00,
// 480 expected minutes, 10-minute late grace — the defaults the engine ships.
const SETTINGS: AttendanceSettings = {
  instituteStartTime: "09:00",
  instituteEndTime: "17:00",
  lateThresholdMinutes: 10,
  expectedDailyMinutes: 480,
  expectedWeeklyMinutes: 2400,
  attendanceMinPct: 75,
  autoNotifications: false,
  correctionApprovalRequired: false,
};

const D = "2026-06-10"; // a Wednesday
const at = (t: string) => composeTimestamp(D, t)!; // local "HH:MM" → ISO

// ──────────────────────────────────────────────────────────────────────────────
// 1. WORK-HOURS ENGINE — one assertion per seed variety (k = 0..else)
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — work-hours engine (staff varieties)", () => {
  it("primitives: parseTimeToMinutes + minutesBetween", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("09:40")).toBe(580);
    expect(parseTimeToMinutes("17:00")).toBe(1020);
    expect(minutesBetween(at("09:00"), at("17:00"))).toBe(480);
    expect(minutesBetween(at("17:00"), at("09:00"))).toBe(0); // never negative
  });

  it("expectedForStatus respects half-day / leave", () => {
    expect(expectedForStatus("present", SETTINGS)).toBe(480);
    expect(expectedForStatus("half_day", SETTINGS)).toBe(240);
    expect(expectedForStatus("leave", SETTINGS)).toBe(0);
    expect(expectedForStatus("absent", SETTINGS)).toBe(0);
  });

  it("normal day (in 09:00 → out 17:00) = full 480, no late/OT", () => {
    const w = computeWorkHours(at("09:00"), at("17:00"), SETTINGS, "present");
    expect(w.workedMinutes).toBe(480);
    expect(w.expectedMinutes).toBe(480);
    expect(w.remainingMinutes).toBe(0);
    expect(w.overtimeMinutes).toBe(0);
    expect(w.lateMinutes).toBe(0);
    expect(w.earlyExitMinutes).toBe(0);
    expect(w.attendancePct).toBe(100);
  });

  it("late day (in 09:40) → 30 late mins, 440 worked, pct 92", () => {
    const w = computeWorkHours(at("09:40"), at("17:00"), SETTINGS, "late");
    expect(w.workedMinutes).toBe(440);
    expect(w.lateMinutes).toBe(30);     // 09:40 − (09:00 + 10 grace)
    expect(w.remainingMinutes).toBe(40);
    expect(w.overtimeMinutes).toBe(0);
    expect(w.attendancePct).toBe(92);   // round(440/480)
  });

  it("overtime day (out 19:00) → 600 worked, 120 OT, pct capped 100", () => {
    const w = computeWorkHours(at("09:00"), at("19:00"), SETTINGS, "present");
    expect(w.workedMinutes).toBe(600);
    expect(w.overtimeMinutes).toBe(120);
    expect(w.remainingMinutes).toBe(0);
    expect(w.attendancePct).toBe(100);
  });

  it("early exit (out 16:00) → 420 worked, 60 early-exit mins", () => {
    const w = computeWorkHours(at("09:00"), at("16:00"), SETTINGS, "present");
    expect(w.workedMinutes).toBe(420);
    expect(w.earlyExitMinutes).toBe(60); // 17:00 − 16:00
    expect(w.remainingMinutes).toBe(60);
    expect(w.attendancePct).toBe(88);    // round(420/480)
  });

  it("half day (in 09:00 → out 13:00, status half_day) → 240/240, pct 100", () => {
    const w = computeWorkHours(at("09:00"), at("13:00"), SETTINGS, "half_day");
    expect(w.workedMinutes).toBe(240);
    expect(w.expectedMinutes).toBe(240);
    expect(w.remainingMinutes).toBe(0);
    expect(w.attendancePct).toBe(100);
  });

  it("leave (no in/out) → 0 worked, 0 expected, pct 0", () => {
    const w = computeWorkHours(undefined, undefined, SETTINGS, "leave");
    expect(w.workedMinutes).toBe(0);
    expect(w.expectedMinutes).toBe(0);
    expect(w.attendancePct).toBe(0);
  });

  it("missing checkout (in only) → 0 worked, full 480 remaining", () => {
    const w = computeWorkHours(at("09:00"), undefined, SETTINGS, "present");
    expect(w.workedMinutes).toBe(0);
    expect(w.expectedMinutes).toBe(480);
    expect(w.remainingMinutes).toBe(480);
    expect(w.attendancePct).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. WORK-HOURS AGGREGATION — one staff member's seeded week
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — weekly aggregate (one staff member)", () => {
  const rec = (over: Partial<StaffAttendanceRecord>): StaffAttendanceRecord => ({
    id: over.id ?? "r",
    staffId: "s1",
    date: over.date ?? D,
    status: over.status ?? "present",
    workedMinutes: over.workedMinutes ?? 0,
    expectedMinutes: over.expectedMinutes ?? 0,
    overtimeMinutes: over.overtimeMinutes ?? 0,
    lateMinutes: over.lateMinutes ?? 0,
    source: "bulk_import",
  });

  it("aggregates the 6 seed varieties to the hand totals", () => {
    const week = [
      rec({ status: "present", workedMinutes: 480, expectedMinutes: 480 }),                       // normal
      rec({ status: "half_day", workedMinutes: 240, expectedMinutes: 240 }),                      // half
      rec({ status: "late", workedMinutes: 440, expectedMinutes: 480, lateMinutes: 30 }),         // late
      rec({ status: "present", workedMinutes: 600, expectedMinutes: 480, overtimeMinutes: 120 }), // overtime
      rec({ status: "present", workedMinutes: 420, expectedMinutes: 480 }),                       // early exit
      rec({ status: "leave", workedMinutes: 0, expectedMinutes: 0 }),                             // leave
    ];
    const a = aggregateWorkHours(week);
    expect(a.days).toBe(6);
    expect(a.presentDays).toBe(5);          // present/late/half_day count as present
    expect(a.workedMinutes).toBe(2180);
    expect(a.expectedMinutes).toBe(2160);
    expect(a.overtimeMinutes).toBe(120);
    expect(a.lateCount).toBe(1);            // status late OR lateMinutes>0
    expect(a.leaveCount).toBe(1);
    expect(a.attendancePct).toBe(100);      // worked ≥ expected → capped
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. RISK ENGINE (0–100) + level mapping
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — risk engine", () => {
  it("student composite score is hand-verified", () => {
    // 27.5 + 18 + 12 + 6 = 63.5 → 64
    expect(
      computeStudentRiskScore({ attendancePct: 45, consecutiveAbsence: 6, daysMissed: 20, lateCount: 3 }),
    ).toBe(64);
    // healthy student → near-zero
    expect(
      computeStudentRiskScore({ attendancePct: 95, consecutiveAbsence: 0, daysMissed: 2, lateCount: 0 }),
    ).toBe(6);
    // worst case is capped at 100
    expect(
      computeStudentRiskScore({ attendancePct: 0, consecutiveAbsence: 30, daysMissed: 60, lateCount: 20 }),
    ).toBe(100);
  });

  it("staff composite score is hand-verified", () => {
    // 18 + 20 + 12 = 50
    expect(computeStaffRiskScore({ attendancePct: 70, lateCount: 5, earlyExitCount: 4 })).toBe(50);
    expect(computeStaffRiskScore({ attendancePct: 100, lateCount: 0, earlyExitCount: 0 })).toBe(0);
  });

  it("score → level thresholds (75/50/25)", () => {
    expect(riskLevelFromScore(80)).toBe("critical");
    expect(riskLevelFromScore(75)).toBe("critical");
    expect(riskLevelFromScore(74)).toBe("high");
    expect(riskLevelFromScore(50)).toBe("high");
    expect(riskLevelFromScore(25)).toBe("medium");
    expect(riskLevelFromScore(24)).toBe("low");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. ALERT BUILDERS — defaulter bands, streak bands, staff alerts, dedupe
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — student alert builder", () => {
  const def = (over: Partial<DefaulterRow>): DefaulterRow => ({
    studentId: over.studentId ?? "stu",
    studentName: over.studentName ?? "Student",
    batchName: over.batchName ?? "Grade 6 - Div A",
    attendancePct: over.attendancePct ?? 100,
    daysMissed: over.daysMissed ?? 0,
    totalDays: over.totalDays ?? 60,
    consecutiveAbsence: over.consecutiveAbsence ?? 0,
    riskLevel: over.riskLevel ?? "low",
  });

  const PERIOD = "2026-06";

  it("a 45% / 6-streak defaulter raises one defaulter + one streak alert", () => {
    const alerts = buildStudentAlerts([def({ studentId: "A", attendancePct: 45, daysMissed: 24, consecutiveAbsence: 6 })], PERIOD);
    const types = alerts.map((a) => a.alertType).sort();
    expect(types).toEqual(["defaulter_50", "streak_5"]);
    const defaulter = alerts.find((a) => a.alertType === "defaulter_50")!;
    expect(defaulter.category).toBe("student");
    expect(defaulter.threshold).toBe(50);
    expect(defaulter.metricValue).toBe(45);
    expect(defaulter.dedupeKey).toBe(studentDedupe("A", "defaulter_50", PERIOD));
    expect(defaulter.riskScore).toBeGreaterThan(0);
  });

  it("a 70% student raises only the < 75% band; a 90% student raises nothing", () => {
    const alerts = buildStudentAlerts(
      [
        def({ studentId: "B", attendancePct: 70, daysMissed: 18 }),
        def({ studentId: "C", attendancePct: 90, daysMissed: 6 }),
      ],
      PERIOD,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("defaulter_75");
    expect(alerts[0].subjectId).toBe("B");
  });

  it("dedupe keys are stable per period and differ across periods", () => {
    const row = def({ studentId: "A", attendancePct: 45, consecutiveAbsence: 6 });
    const a1 = buildStudentAlerts([row], "2026-06");
    const a2 = buildStudentAlerts([row], "2026-06");
    const a3 = buildStudentAlerts([row], "2026-07");
    expect(a1.map((a) => a.dedupeKey)).toEqual(a2.map((a) => a.dedupeKey)); // converges → no dupes
    expect(a1[0].dedupeKey).not.toBe(a3[0].dedupeKey);                      // new period → new alert
  });
});

describe("attendance seed — staff alert builder", () => {
  const perf = (over: Partial<StaffPerfRow>): StaffPerfRow => ({
    staffId: over.staffId ?? "s",
    staffName: over.staffName ?? "Staff",
    role: over.role ?? "teacher",
    attendancePct: over.attendancePct ?? 100,
    lateCount: over.lateCount ?? 0,
    earlyExitCount: over.earlyExitCount ?? 0,
    overtimeMinutes: over.overtimeMinutes ?? 0,
    avgWorkedMinutes: over.avgWorkedMinutes ?? 480,
    days: over.days ?? 60,
  });

  const T = { minPct: 90, maxLate: 3, maxEarlyExit: 3 };
  const PERIOD = "2026-06";

  it("a low/late/early staff trips all three alerts; a clean staff trips none", () => {
    const alerts = buildStaffAlerts(
      [
        perf({ staffId: "X", attendancePct: 70, lateCount: 5, earlyExitCount: 4 }),
        perf({ staffId: "Y", attendancePct: 95, lateCount: 1, earlyExitCount: 0 }),
      ],
      T,
      PERIOD,
    );
    const xTypes = alerts.filter((a) => a.subjectId === "X").map((a) => a.alertType).sort();
    expect(xTypes).toEqual(["staff_early_exit", "staff_late", "staff_low"]);
    expect(alerts.filter((a) => a.subjectId === "Y")).toHaveLength(0);
    const late = alerts.find((a) => a.alertType === "staff_late")!;
    expect(late.severity).toBe("medium");      // 5 < maxLate*2 (6)
    expect(late.dedupeKey).toBe(staffDedupe("X", "staff_late", PERIOD));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. WHATSAPP TEMPLATE BRIDGE
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — WhatsApp alert templates", () => {
  it("routes each alert kind to the right template", () => {
    expect(templateKeyForAlert("streak_5")).toBe("consecutive_absence");
    expect(templateKeyForAlert("defaulter_50")).toBe("attendance_defaulter");
    expect(templateKeyForAlert("defaulter_75")).toBe("attendance_defaulter");
    expect(templateKeyForAlert("staff_low")).toBe("monthly_attendance_warning");
  });

  const alert = (over: Partial<AttendanceAlert>): AttendanceAlert => ({
    id: "al",
    alertType: over.alertType ?? "defaulter_50",
    category: over.category ?? "student",
    severity: over.severity ?? "high",
    subjectName: over.subjectName ?? "Aarav Sharma",
    metricValue: over.metricValue,
    threshold: over.threshold,
    title: over.title ?? "alert",
    status: "open",
    channels: {},
    dedupeKey: "k",
    createdAt: "",
  });

  it("renders a defaulter message with all variables substituted (no gaps)", () => {
    const msg = renderAlert(alert({ alertType: "defaulter_50", metricValue: 45, threshold: 50 }), { branchName: "ARK Central" });
    expect(msg.body).toContain("Aarav Sharma");
    expect(msg.body).toContain("45");
    expect(msg.body).toContain("50");
    expect(msg.body).toContain("ARK Central");
    expect(msg.body).not.toContain("{{"); // every placeholder filled
    expect(msg.missing).toHaveLength(0);
  });

  it("renders a consecutive-absence message with the day count", () => {
    const msg = renderAlert(alert({ alertType: "streak_5", metricValue: 6 }));
    expect(msg.body).toContain("6");
    expect(msg.body).not.toContain("{{");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. GOVERNANCE — lock windows, month windows, lock coverage
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — governance windows", () => {
  it("day lock window", () => {
    expect(lockWindow("day", "2026-06-10")).toEqual({
      periodKey: "2026-06-10",
      fromDate: "2026-06-10",
      toDate: "2026-06-10",
    });
  });

  it("month lock window", () => {
    expect(lockWindow("month", "2026-06-10")).toEqual({
      periodKey: "2026-06",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    });
  });

  it("week lock window (Mon..Sun around 2026-06-10)", () => {
    const w = lockWindow("week", "2026-06-10");
    expect(w.fromDate).toBe("2026-06-08"); // Monday
    expect(w.toDate).toBe("2026-06-14");   // Sunday
    expect(w.periodKey).toMatch(/^2026-W\d{2}$/);
  });

  it("monthWindow handles non-leap February", () => {
    expect(monthWindow("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("coversDate respects scope and range", () => {
    const monthLock = { scope: "student" as const, fromDate: "2026-06-01", toDate: "2026-06-30", locked: true };
    expect(coversDate(monthLock, "student", "2026-06-10")).toBe(true);
    expect(coversDate(monthLock, "student", "2026-07-01")).toBe(false); // out of range
    expect(coversDate({ ...monthLock, locked: false }, "student", "2026-06-10")).toBe(false); // not locked

    const allLock = { scope: "all" as const, fromDate: "2026-06-01", toDate: "2026-06-30", locked: true };
    expect(coversDate(allLock, "student", "2026-06-10")).toBe(true); // 'all' covers any scope

    const staffLock = { scope: "staff" as const, fromDate: "2026-06-01", toDate: "2026-06-30", locked: true };
    expect(coversDate(staffLock, "student", "2026-06-10")).toBe(false); // staff lock ≠ student write
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. DATE HELPERS — backdated / month boundaries used across the module
// ──────────────────────────────────────────────────────────────────────────────
describe("attendance seed — date helpers", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("previousDay for Copy-Yesterday", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });

  it("monthStart / monthEnd incl. leap year", () => {
    expect(monthStart("2026-06-17")).toBe("2026-06-01");
    expect(monthEnd("2026-06-17")).toBe("2026-06-30");
    expect(monthEnd("2024-02-10")).toBe("2024-02-29"); // leap
  });

  it("dateRange is inclusive and capped", () => {
    expect(dateRange("2026-06-01", "2026-06-05")).toHaveLength(5);
    expect(dateRange("2026-06-01", "2026-06-01")).toEqual(["2026-06-01"]);
  });

  it("DEFAULT_SETTINGS are internally consistent", () => {
    expect(DEFAULT_SETTINGS.expectedDailyMinutes).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.expectedWeeklyMinutes).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.expectedDailyMinutes);
  });
});
