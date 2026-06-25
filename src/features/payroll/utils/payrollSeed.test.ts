import { describe, it, expect } from "vitest";
import {
  computePayroll,
  resolveHourlyRate,
  summariseRun,
  round2,
} from "./payrollCalc";
import {
  periodsOverlap,
  findOverlappingRun,
  canApprove,
  canPay,
  canHold,
  canResume,
  canEditRun,
  canDeleteRun,
} from "./payrollLifecycle";
import type {
  PayrollCalcInput,
  PayrollRule,
  PayrollRun,
  RoleRate,
  StaffRate,
} from "../types/payroll.types";

// ════════════════════════════════════════════════════════════════════════════
// SEED-DATA CALCULATION VALIDATION
//
// This is the executable half of the payroll QA pass. It feeds the SAME figures
// the SQL seed (supabase/seed/payroll_seed.sql) produces through the real,
// centralised engine and asserts every rupee against an independent hand
// calculation. No mocks, no stubbed success — if the engine drifts, this fails.
//
//   Settings:  overtimeMultiplier = 1.5
//   Role rates: teacher 250 · senior_teacher 400 · coordinator 500 ·
//               office_staff 200 · marketing 300 · support_staff 180
//   Overrides:  Ravi 350/hr · Priya 450/hr  (must beat the role rate)
//   Rules:
//     R1 punctuality bonus  incentive flat 2000  if attendance≥95 & lates≤0
//     R2 lateness penalty   penalty   flat 500   if lates≥3
//     R3 travel allowance   allowance flat 1000  role=teacher
//     R4 performance bonus  incentive percent 5  (of earnings base)
// ════════════════════════════════════════════════════════════════════════════

const OT_MULTIPLIER = 1.5;

const roleRates: RoleRate[] = [
  ["teacher", 250],
  ["senior_teacher", 400],
  ["coordinator", 500],
  ["office_staff", 200],
  ["marketing", 300],
  ["support_staff", 180],
].map(([role, rate], i) => ({
  id: `rr${i}`,
  role: role as string,
  hourlyRate: rate as number,
  monthlySalary: 0,
  currency: "INR",
  isActive: true,
  createdAt: "",
  updatedAt: "",
}));

const rule = (over: Partial<PayrollRule>): PayrollRule => ({
  id: over.id ?? "r",
  ruleType: over.ruleType ?? "incentive",
  name: over.name ?? "Rule",
  calcMethod: over.calcMethod ?? "flat",
  value: over.value ?? 0,
  appliesTo: over.appliesTo ?? "all",
  appliesRef: over.appliesRef,
  condition: over.condition,
  isActive: over.isActive ?? true,
  sortOrder: over.sortOrder ?? 0,
  createdAt: "",
  updatedAt: "",
});

const RULES: PayrollRule[] = [
  rule({ id: "R1", ruleType: "incentive", name: "Punctuality Bonus", calcMethod: "flat", value: 2000, condition: { minAttendancePct: 95, maxLateCount: 0 } }),
  rule({ id: "R2", ruleType: "penalty", name: "Lateness Penalty", calcMethod: "flat", value: 500, condition: { minLateCount: 3 } }),
  rule({ id: "R3", ruleType: "allowance", name: "Travel Allowance", calcMethod: "flat", value: 1000, appliesTo: "role", appliesRef: "teacher" }),
  rule({ id: "R4", ruleType: "incentive", name: "Performance Bonus", calcMethod: "percent", value: 5 }),
];

const h = (hours: number) => hours * 60;

const ctx = (over: Partial<PayrollCalcInput>): PayrollCalcInput => ({
  staffId: over.staffId ?? "s",
  staffName: over.staffName ?? "Staff",
  role: over.role,
  department: over.department,
  hourlyRate: over.hourlyRate ?? 0,
  basicSalary: over.basicSalary ?? 0,
  workedMinutes: over.workedMinutes ?? 0,
  overtimeMinutes: over.overtimeMinutes ?? 0,
  expectedMinutes: over.expectedMinutes ?? 0,
  attendancePct: over.attendancePct ?? 0,
  lateCount: over.lateCount ?? 0,
  presentDays: over.presentDays ?? 0,
});

// Mirror the service's attendance% derivation so the test tracks production.
const attPct = (worked: number, expected: number) =>
  expected > 0 ? Math.round(Math.min(worked / expected, 1) * 100) : 0;

describe("payroll seed — rate resolution", () => {
  it("staff override beats the role rate (Ravi 350 over teacher 250)", () => {
    const staffRate: StaffRate = {
      id: "sr", staffId: "ravi", hourlyRate: 350, currency: "INR",
      isActive: true, createdAt: "", updatedAt: "",
    };
    expect(resolveHourlyRate({ role: "teacher", roleRates, staffRate }).hourlyRate).toBe(350);
  });

  it("falls back to the role rate when no override (coordinator 500)", () => {
    expect(resolveHourlyRate({ role: "coordinator", roleRates }).hourlyRate).toBe(500);
  });

  it("a zero/blank override does NOT shadow the role rate", () => {
    const staffRate: StaffRate = {
      id: "sr", staffId: "x", hourlyRate: 0, currency: "INR",
      isActive: true, createdAt: "", updatedAt: "",
    };
    expect(resolveHourlyRate({ role: "marketing", roleRates, staffRate }).hourlyRate).toBe(300);
  });
});

describe("payroll seed — per-staff salary (hand-verified)", () => {
  // ── A: Ravi, teacher, override 350/hr, 200h worked incl 20h OT, 0 late ──────
  it("A · Ravi (override + OT + punctuality + travel + 5%)", () => {
    const worked = h(200), ot = h(20), expected = h(180);
    const r = computePayroll(
      ctx({ staffId: "ravi", role: "teacher", hourlyRate: 350, workedMinutes: worked, overtimeMinutes: ot, expectedMinutes: expected, attendancePct: attPct(worked, expected), lateCount: 0, presentDays: 24 }),
      RULES, OT_MULTIPLIER,
    );
    expect(r.hourlyEarnings).toBe(63000);      // 350 × 180h
    expect(r.overtimeEarnings).toBe(10500);    // 350 × 1.5 × 20h
    expect(r.allowances).toBe(1000);           // travel (teacher)
    expect(r.incentives).toBe(round2(2000 + 3675)); // punctuality + 5% of 73500
    expect(r.deductions).toBe(0);
    expect(r.penalties).toBe(0);
    expect(r.grossEarnings).toBe(80175);
    expect(r.netSalary).toBe(80175);
  });

  // ── B: office staff, role 200/hr, 160h, 91% attendance, 4 lates ─────────────
  it("B · office staff (lateness penalty + 5%, no punctuality)", () => {
    const worked = h(160), expected = h(176);
    const pct = attPct(worked, expected); // 91
    expect(pct).toBe(91);
    const r = computePayroll(
      ctx({ staffId: "off", role: "office_staff", hourlyRate: 200, workedMinutes: worked, overtimeMinutes: 0, expectedMinutes: expected, attendancePct: pct, lateCount: 4, presentDays: 20 }),
      RULES, OT_MULTIPLIER,
    );
    expect(r.hourlyEarnings).toBe(32000);   // 200 × 160h
    expect(r.overtimeEarnings).toBe(0);
    expect(r.incentives).toBe(1600);        // 5% of 32000; punctuality excluded (91<95)
    expect(r.penalties).toBe(500);          // lateness (4 ≥ 3)
    expect(r.grossEarnings).toBe(33600);
    expect(r.netSalary).toBe(33100);
  });

  // ── C: Priya, senior_teacher, override 450/hr, 150h incl 10h OT, 1 late ─────
  it("C · Priya (override, OT, no travel since not 'teacher')", () => {
    const worked = h(150), ot = h(10), expected = h(160);
    const r = computePayroll(
      ctx({ staffId: "priya", role: "senior_teacher", hourlyRate: 450, workedMinutes: worked, overtimeMinutes: ot, expectedMinutes: expected, attendancePct: attPct(worked, expected), lateCount: 1, presentDays: 22 }),
      RULES, OT_MULTIPLIER,
    );
    expect(r.hourlyEarnings).toBe(63000);   // 450 × 140h
    expect(r.overtimeEarnings).toBe(6750);  // 450 × 1.5 × 10h
    expect(r.allowances).toBe(0);           // travel is teacher-only
    expect(r.incentives).toBe(3487.5);      // 5% of 69750; punctuality excluded (94<95)
    expect(r.penalties).toBe(0);            // 1 < 3
    expect(r.grossEarnings).toBe(73237.5);
    expect(r.netSalary).toBe(73237.5);
  });

  // ── D: staff fully on leave — no attendance → zero salary, never negative ───
  it("D · leave staff (no attendance → ₹0, not negative)", () => {
    const r = computePayroll(
      ctx({ staffId: "leave", role: "support_staff", hourlyRate: 180 }),
      RULES, OT_MULTIPLIER,
    );
    expect(r.grossEarnings).toBe(0);
    expect(r.netSalary).toBe(0);
  });

  // ── E: penalty can never push net below zero ────────────────────────────────
  it("E · catastrophic penalty floors net at 0", () => {
    const r = computePayroll(
      ctx({ role: "support_staff", hourlyRate: 180, workedMinutes: h(10), expectedMinutes: h(10), attendancePct: 100, lateCount: 5 }),
      [rule({ ruleType: "penalty", calcMethod: "flat", value: 999999, condition: { minLateCount: 3 } })],
      OT_MULTIPLIER,
    );
    expect(r.netSalary).toBe(0);
  });
});

describe("payroll seed — run totals", () => {
  it("summarises a 4-staff run (A+B+C+D) to the hand totals", () => {
    const items = [
      computePayroll(ctx({ role: "teacher", hourlyRate: 350, workedMinutes: h(200), overtimeMinutes: h(20), expectedMinutes: h(180), attendancePct: 100, lateCount: 0, presentDays: 24 }), RULES, OT_MULTIPLIER),
      computePayroll(ctx({ role: "office_staff", hourlyRate: 200, workedMinutes: h(160), expectedMinutes: h(176), attendancePct: 91, lateCount: 4, presentDays: 20 }), RULES, OT_MULTIPLIER),
      computePayroll(ctx({ role: "senior_teacher", hourlyRate: 450, workedMinutes: h(150), overtimeMinutes: h(10), expectedMinutes: h(160), attendancePct: 94, lateCount: 1, presentDays: 22 }), RULES, OT_MULTIPLIER),
      computePayroll(ctx({ role: "support_staff", hourlyRate: 180 }), RULES, OT_MULTIPLIER),
    ];
    const t = summariseRun(items);
    expect(t.staffCount).toBe(4);
    expect(t.totalGross).toBe(187012.5);
    expect(t.totalNet).toBe(186512.5);
    expect(t.totalOvertime).toBe(17250);
    expect(t.totalIncentive).toBe(10762.5);
    expect(t.totalDeductions).toBe(500); // deductions + penalties
  });
});

describe("payroll seed — lifecycle & duplicate guards", () => {
  const run = (over: Partial<PayrollRun>): PayrollRun => ({
    id: over.id ?? "run", title: over.title ?? "Run", periodType: "monthly",
    periodStart: over.periodStart ?? "2026-01-01", periodEnd: over.periodEnd ?? "2026-01-31",
    status: over.status ?? "pending", staffCount: 0, totalGross: 0, totalOvertime: 0,
    totalIncentive: 0, totalDeductions: 0, totalNet: 0, locked: over.locked ?? false,
    createdAt: "", updatedAt: "",
  });

  it("detects overlapping periods", () => {
    expect(periodsOverlap("2026-01-01", "2026-01-31", "2026-01-15", "2026-02-15")).toBe(true);
    expect(periodsOverlap("2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });

  it("blocks a duplicate run for an already-covered period", () => {
    const existing = [run({ id: "jan", status: "paid", periodStart: "2026-01-01", periodEnd: "2026-01-31" })];
    expect(findOverlappingRun(existing, "2026-01-10", "2026-01-20")?.id).toBe("jan");
  });

  it("ignores cancelled runs when checking duplicates", () => {
    const existing = [run({ id: "jan", status: "cancelled", periodStart: "2026-01-01", periodEnd: "2026-01-31" })];
    expect(findOverlappingRun(existing, "2026-01-10", "2026-01-20")).toBeUndefined();
  });

  it("approve guard: only pending/draft may be approved", () => {
    expect(canApprove("pending").ok).toBe(true);
    expect(canApprove("draft").ok).toBe(true);
    expect(canApprove("approved").ok).toBe(false);
    expect(canApprove("paid").ok).toBe(false);
    expect(canApprove("cancelled").ok).toBe(false);
  });

  it("pay guard: only an approved run may be paid (double-pay blocked)", () => {
    expect(canPay("approved").ok).toBe(true);
    expect(canPay("paid").ok).toBe(false);    // ← prevents a second Finance post
    expect(canPay("pending").ok).toBe(false);
    expect(canPay("cancelled").ok).toBe(false);
  });

  // ── Edge cases requested for Edit / Delete / Hold / Resume ──────────────────
  it("edge: a held run cannot be paid (#5)", () => {
    expect(canPay("on_hold").ok).toBe(false);
  });

  it("edge: a held run cannot be approved — resume first (#6)", () => {
    expect(canApprove("on_hold").ok).toBe(false);
  });

  it("hold guard: only pending/approved runs may be held; paid cannot (#3)", () => {
    expect(canHold("pending").ok).toBe(true);
    expect(canHold("approved").ok).toBe(true);
    expect(canHold("paid").ok).toBe(false);       // #3
    expect(canHold("cancelled").ok).toBe(false);
    expect(canHold("on_hold").ok).toBe(false);
  });

  it("resume guard: only a held run may be resumed (#8)", () => {
    expect(canResume("on_hold").ok).toBe(true);
    expect(canResume("pending").ok).toBe(false);
    expect(canResume("approved").ok).toBe(false);
    expect(canResume("paid").ok).toBe(false);
  });

  it("edit guard: paid & cancelled runs cannot be edited (#1)", () => {
    expect(canEditRun("draft").ok).toBe(true);
    expect(canEditRun("pending").ok).toBe(true);
    expect(canEditRun("approved").ok).toBe(true);
    expect(canEditRun("on_hold").ok).toBe(true);
    expect(canEditRun("paid").ok).toBe(false);    // #1
    expect(canEditRun("cancelled").ok).toBe(false);
  });

  it("delete guard: a paid run cannot be deleted (#2)", () => {
    expect(canDeleteRun("paid").ok).toBe(false);  // #2
    expect(canDeleteRun("cancelled").ok).toBe(true);
    expect(canDeleteRun("pending").ok).toBe(true);
    expect(canDeleteRun("on_hold").ok).toBe(true);
  });
});
