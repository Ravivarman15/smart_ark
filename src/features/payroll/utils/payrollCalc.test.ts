import { describe, it, expect } from "vitest";
import {
  computePayroll,
  resolveHourlyRate,
  summariseRun,
  round2,
  minutesToHours,
} from "./payrollCalc";
import type {
  PayrollCalcInput,
  PayrollRule,
  RoleRate,
  StaffRate,
} from "../types/payroll.types";

const baseCtx: PayrollCalcInput = {
  staffId: "s1",
  staffName: "Ravi",
  role: "teacher",
  department: "Academics",
  hourlyRate: 250,
  basicSalary: 0,
  workedMinutes: 60 * 100, // 100h worked
  overtimeMinutes: 60 * 10, // 10h overtime
  expectedMinutes: 60 * 90, // 90h expected
  attendancePct: 100,
  lateCount: 0,
  presentDays: 22,
};

const rule = (over: Partial<PayrollRule>): PayrollRule => ({
  id: over.id ?? "r1",
  ruleType: over.ruleType ?? "incentive",
  name: over.name ?? "Rule",
  calcMethod: over.calcMethod ?? "flat",
  value: over.value ?? 0,
  appliesTo: over.appliesTo ?? "all",
  appliesRef: over.appliesRef,
  condition: over.condition,
  isActive: over.isActive ?? true,
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
});

describe("payroll calc engine", () => {
  it("computes hourly + overtime with the multiplier", () => {
    // regular = 90h, overtime = 10h, rate 250, OT ×1.5
    const r = computePayroll(baseCtx, [], 1.5);
    expect(r.hourlyEarnings).toBe(round2(250 * 90)); // 22500
    expect(r.overtimeEarnings).toBe(round2(250 * 1.5 * 10)); // 3750
    expect(r.grossEarnings).toBe(26250);
    expect(r.netSalary).toBe(26250);
  });

  it("adds a flat incentive and subtracts a deduction", () => {
    const rules = [
      rule({ id: "i", ruleType: "incentive", calcMethod: "flat", value: 1000 }),
      rule({ id: "d", ruleType: "deduction", calcMethod: "flat", value: 500 }),
    ];
    const r = computePayroll(baseCtx, rules, 1.5);
    expect(r.incentives).toBe(1000);
    expect(r.deductions).toBe(500);
    expect(r.netSalary).toBe(26250 + 1000 - 500);
  });

  it("applies a percent rule on the earnings base", () => {
    const rules = [rule({ ruleType: "incentive", calcMethod: "percent", value: 10 })];
    const r = computePayroll(baseCtx, rules, 1.5);
    // base = 90h*250 + OT 3750 = 26250 → 10% = 2625
    expect(r.incentives).toBe(2625);
  });

  it("respects a condition (minAttendancePct)", () => {
    const rules = [
      rule({
        ruleType: "incentive",
        calcMethod: "flat",
        value: 5000,
        condition: { minAttendancePct: 95 },
      }),
    ];
    const high = computePayroll({ ...baseCtx, attendancePct: 98 }, rules, 1.5);
    const low = computePayroll({ ...baseCtx, attendancePct: 80 }, rules, 1.5);
    expect(high.incentives).toBe(5000);
    expect(low.incentives).toBe(0);
  });

  it("never returns a negative net salary", () => {
    const rules = [rule({ ruleType: "penalty", calcMethod: "flat", value: 999999 })];
    const r = computePayroll(baseCtx, rules, 1.5);
    expect(r.netSalary).toBe(0);
  });

  it("staff hourly rate overrides the role rate", () => {
    const roleRates: RoleRate[] = [
      {
        id: "rr",
        role: "teacher",
        hourlyRate: 250,
        monthlySalary: 0,
        currency: "INR",
        isActive: true,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const staffRate: StaffRate = {
      id: "sr",
      staffId: "s1",
      hourlyRate: 350,
      currency: "INR",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };
    const resolved = resolveHourlyRate({ role: "teacher", roleRates, staffRate });
    expect(resolved.hourlyRate).toBe(350);
  });

  it("summarises run totals", () => {
    const a = computePayroll(baseCtx, [], 1.5);
    const totals = summariseRun([
      { ...a },
      { ...a },
    ]);
    expect(totals.staffCount).toBe(2);
    expect(totals.totalNet).toBe(round2(a.netSalary * 2));
  });

  it("minutesToHours rounds to 2dp", () => {
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(50)).toBe(0.83);
  });
});
