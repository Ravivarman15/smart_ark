import { round2 } from "./payrollCalc";
import type { RoleRate, Shift, StaffRate } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Faculty hourly-rate resolution (Phase 2 of the faculty-tracking spec).
//
// This does NOT re-implement payroll. The actual salary run still goes through
// `computePayroll()` untouched — this module only answers ONE question that the
// allocation dashboards need to preview an expected salary:
//
//        "what is this faculty member's effective hourly rate?"
//
// It reuses exactly the salary configuration the payroll module already owns:
//
//   1. staff rate   — an explicit per-staff hourlyRate wins (individual salary)
//   2. role rate    — otherwise the active role rate (role-wise salary)
//   3. derived      — otherwise DERIVE it from a monthly salary:
//                        monthly ÷ working days ÷ working hours per day
//                     using the staff/role/department Shift already configured
//                     in Payroll → Shifts (falling back to 26 × 8).
//
// Pure functions — no I/O — so the arithmetic is unit tested directly.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WORKING_DAYS = 26;
export const DEFAULT_DAILY_HOURS = 8;

export interface RateContext {
  staffId: string;
  role?: string;
  department?: string;
  staffRate?: StaffRate;
  roleRate?: RoleRate;
  shifts?: Shift[];
  /** Overrides for institutes that don't configure shifts at all. */
  fallbackWorkingDays?: number;
  fallbackDailyHours?: number;
}

export interface ResolvedRate {
  hourlyRate: number;
  source: "staff" | "role" | "derived" | "none";
  /** Only set when the rate was derived from a monthly salary. */
  monthlySalary?: number;
  workingDays: number;
  dailyHours: number;
}

/**
 * The Shift that applies to a staff member, most specific first:
 * staff → department → role. Mirrors how the payroll module scopes shifts.
 */
export const shiftFor = (ctx: RateContext): Shift | undefined => {
  const active = (ctx.shifts ?? []).filter((s) => s.isActive);
  const match = (scope: Shift["scope"], ref?: string): Shift | undefined =>
    ref
      ? active.find(
          (s) => s.scope === scope && s.scopeRef.toLowerCase() === ref.toLowerCase(),
        )
      : undefined;
  return (
    match("staff", ctx.staffId) ??
    match("department", ctx.department) ??
    match("role", ctx.role)
  );
};

/** Monthly salary ÷ working days ÷ daily hours — the derived hourly rate. */
export const deriveHourlyRate = (
  monthlySalary: number,
  workingDays: number,
  dailyHours: number,
): number => {
  if (monthlySalary <= 0 || workingDays <= 0 || dailyHours <= 0) return 0;
  return round2(monthlySalary / workingDays / dailyHours);
};

export const resolveHourlyRate = (ctx: RateContext): ResolvedRate => {
  const shift = shiftFor(ctx);
  const workingDays =
    shift?.workingDays && shift.workingDays > 0
      ? shift.workingDays
      : (ctx.fallbackWorkingDays ?? DEFAULT_WORKING_DAYS);
  const dailyHours =
    shift?.expectedDailyMinutes && shift.expectedDailyMinutes > 0
      ? shift.expectedDailyMinutes / 60
      : (ctx.fallbackDailyHours ?? DEFAULT_DAILY_HOURS);

  // 1 — explicit individual hourly rate
  const staffHourly = ctx.staffRate?.hourlyRate ?? 0;
  if (ctx.staffRate?.isActive !== false && staffHourly > 0) {
    return { hourlyRate: round2(staffHourly), source: "staff", workingDays, dailyHours };
  }

  // 2 — role-wise hourly rate
  const roleHourly = ctx.roleRate?.isActive !== false ? (ctx.roleRate?.hourlyRate ?? 0) : 0;
  if (roleHourly > 0) {
    return { hourlyRate: round2(roleHourly), source: "role", workingDays, dailyHours };
  }

  // 3 — derive from whichever monthly salary is configured (staff wins)
  const monthly =
    (ctx.staffRate?.monthlySalary ?? 0) ||
    (ctx.staffRate?.basicSalary ?? 0) ||
    (ctx.roleRate?.monthlySalary ?? 0);
  if (monthly > 0) {
    return {
      hourlyRate: deriveHourlyRate(monthly, workingDays, dailyHours),
      source: "derived",
      monthlySalary: monthly,
      workingDays,
      dailyHours,
    };
  }

  return { hourlyRate: 0, source: "none", workingDays, dailyHours };
};

/** Minutes × hourly rate → money, rounded to paise. Reuses payrollCalc.round2. */
export const earningsFor = (minutes: number, hourlyRate: number): number =>
  round2((Math.max(0, minutes) / 60) * Math.max(0, hourlyRate));
