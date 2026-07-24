import { describe, it, expect } from "vitest";
import {
  DEFAULT_DAILY_HOURS,
  DEFAULT_WORKING_DAYS,
  deriveHourlyRate,
  earningsFor,
  resolveHourlyRate,
  shiftFor,
} from "./facultyRate";
import type { RoleRate, Shift, StaffRate } from "../types/payroll.types";

// ════════════════════════════════════════════════════════════════════════════
// Faculty hourly-rate resolution. This is the ONLY new salary arithmetic in the
// faculty-tracking module — the payroll engine itself is untouched. Contract:
//   1. an explicit individual hourly rate wins
//   2. otherwise the active ROLE rate
//   3. otherwise DERIVE it: monthly ÷ working days ÷ daily hours, taking the
//      working days / hours from the Shift already configured in Payroll
//   4. nothing configured ⇒ 0 with source "none" (never a guessed number)
// ════════════════════════════════════════════════════════════════════════════

const staffRate = (over: Partial<StaffRate> = {}): StaffRate =>
  ({
    id: "sr1",
    staffId: "t1",
    currency: "INR",
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as StaffRate;

const roleRate = (over: Partial<RoleRate> = {}): RoleRate =>
  ({
    id: "rr1",
    role: "teacher",
    hourlyRate: 0,
    monthlySalary: 0,
    currency: "INR",
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as RoleRate;

const shift = (over: Partial<Shift> = {}): Shift =>
  ({
    id: "s1",
    scope: "role",
    scopeRef: "teacher",
    startTime: "09:00",
    endTime: "17:00",
    expectedDailyMinutes: 480,
    expectedWeeklyMinutes: 2400,
    expectedMonthlyMinutes: 10560,
    workingDays: 22,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Shift;

describe("resolveHourlyRate", () => {
  it("prefers an explicit individual hourly rate", () => {
    const r = resolveHourlyRate({
      staffId: "t1",
      role: "teacher",
      staffRate: staffRate({ hourlyRate: 350 }),
      roleRate: roleRate({ hourlyRate: 200 }),
    });
    expect(r.hourlyRate).toBe(350);
    expect(r.source).toBe("staff");
  });

  it("falls back to the active role rate", () => {
    const r = resolveHourlyRate({
      staffId: "t1",
      role: "teacher",
      staffRate: staffRate(),
      roleRate: roleRate({ hourlyRate: 200 }),
    });
    expect(r.hourlyRate).toBe(200);
    expect(r.source).toBe("role");
  });

  it("ignores an inactive role rate", () => {
    const r = resolveHourlyRate({
      staffId: "t1",
      role: "teacher",
      roleRate: roleRate({ hourlyRate: 200, isActive: false }),
    });
    expect(r.source).toBe("none");
    expect(r.hourlyRate).toBe(0);
  });

  it("derives the rate from a monthly salary using the configured shift", () => {
    // ₹52,800 ÷ 22 working days ÷ 8 hours = ₹300/h
    const r = resolveHourlyRate({
      staffId: "t1",
      role: "teacher",
      staffRate: staffRate({ monthlySalary: 52800 }),
      shifts: [shift()],
    });
    expect(r.source).toBe("derived");
    expect(r.hourlyRate).toBe(300);
    expect(r.workingDays).toBe(22);
    expect(r.dailyHours).toBe(8);
    expect(r.monthlySalary).toBe(52800);
  });

  it("uses the 26 × 8 fallback when no shift is configured", () => {
    const r = resolveHourlyRate({
      staffId: "t1",
      role: "teacher",
      staffRate: staffRate({ monthlySalary: 41600 }),
    });
    expect(r.workingDays).toBe(DEFAULT_WORKING_DAYS);
    expect(r.dailyHours).toBe(DEFAULT_DAILY_HOURS);
    expect(r.hourlyRate).toBe(200); // 41600 / 26 / 8
  });

  it("returns 0 / none when nothing at all is configured", () => {
    const r = resolveHourlyRate({ staffId: "t1", role: "teacher" });
    expect(r.hourlyRate).toBe(0);
    expect(r.source).toBe("none");
  });
});

describe("shiftFor", () => {
  it("picks the most specific shift: staff over department over role", () => {
    const shifts = [
      shift({ id: "role", scope: "role", scopeRef: "teacher", workingDays: 22 }),
      shift({ id: "dept", scope: "department", scopeRef: "Science", workingDays: 24 }),
      shift({ id: "staff", scope: "staff", scopeRef: "t1", workingDays: 26 }),
    ];
    expect(shiftFor({ staffId: "t1", role: "teacher", department: "Science", shifts })?.id).toBe(
      "staff",
    );
    expect(shiftFor({ staffId: "t9", role: "teacher", department: "Science", shifts })?.id).toBe(
      "dept",
    );
    expect(shiftFor({ staffId: "t9", role: "teacher", shifts })?.id).toBe("role");
  });

  it("ignores inactive shifts", () => {
    expect(
      shiftFor({ staffId: "t1", role: "teacher", shifts: [shift({ isActive: false })] }),
    ).toBeUndefined();
  });
});

describe("deriveHourlyRate / earningsFor", () => {
  it("refuses to divide by zero", () => {
    expect(deriveHourlyRate(50000, 0, 8)).toBe(0);
    expect(deriveHourlyRate(50000, 26, 0)).toBe(0);
    expect(deriveHourlyRate(0, 26, 8)).toBe(0);
  });

  it("computes earnings from minutes × rate", () => {
    // The spec's worked example: 72 hours at ₹350/h = ₹25,200.
    expect(earningsFor(72 * 60, 350)).toBe(25200);
    expect(earningsFor(90, 350)).toBe(525); // 1.5h
  });

  it("never returns negative earnings", () => {
    expect(earningsFor(-120, 350)).toBe(0);
    expect(earningsFor(120, -350)).toBe(0);
  });
});
