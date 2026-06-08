// ─────────────────────────────────────────────────────────────────────────────
// CENTRALISED PAYROLL CALCULATION ENGINE
//
// Every rupee figure the Payroll module shows or writes flows through here.
// No UI component and no service may do its own salary arithmetic — that is how
// a payroll system silently pays the wrong amount.
//
//   round2()            — the only rounding (matches NUMERIC(12,2))
//   formatINR()         — display formatter
//   minutesToHours()    — minutes → decimal hours
//   ruleAmount()        — a single rule's contribution for one staff member
//   computePayroll()    — full salary breakdown for one staff member
//   summariseRun()      — totals across a set of computed items
//
// Pure functions, no I/O — trivially unit-testable.
//
//   Formula:
//     hourly      = hourlyRate × regularHours
//     overtime    = hourlyRate × overtimeMultiplier × overtimeHours
//     gross       = basic + hourly + overtime + incentives + allowances
//     net         = gross − deductions − penalties
//
//   Staff-specific rate ALWAYS takes priority over the role rate — that
//   resolution happens in resolveHourlyRate() before the engine runs.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BreakdownLine,
  PayrollCalcInput,
  PayrollCalcResult,
  PayrollItem,
  PayrollRule,
  RoleRate,
  StaffRate,
} from "../types/payroll.types";

/** Round to 2 decimals — the precision of NUMERIC(12,2). The only rounding. */
export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Coerce a form value to a non-negative number; junk / blank / negative → 0. */
export const toAmount = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

/** Indian-rupee display formatting (no decimals when integer). */
export const formatINR = (n: number | null | undefined): string =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Minutes → decimal hours (e.g. 90 → 1.5). */
export const minutesToHours = (minutes: number): number =>
  round2(Math.max(minutes, 0) / 60);

/** Human-friendly "7h 30m" from minutes. */
export const formatMinutes = (minutes: number): string => {
  const m = Math.max(Math.round(minutes), 0);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

/**
 * Staff-specific rate takes priority over the role rate. Returns the resolved
 * hourly rate + fixed monthly base for one staff member.
 */
export const resolveHourlyRate = (args: {
  role?: string;
  roleRates: RoleRate[];
  staffRate?: StaffRate;
}): { hourlyRate: number; basicSalary: number } => {
  const { role, roleRates, staffRate } = args;
  const roleRate = role
    ? roleRates.find((r) => r.isActive && r.role.toLowerCase() === role.toLowerCase())
    : undefined;

  const hourlyRate =
    staffRate?.hourlyRate != null && staffRate.hourlyRate > 0
      ? staffRate.hourlyRate
      : roleRate?.hourlyRate ?? 0;

  const basicSalary =
    staffRate?.basicSalary != null && staffRate.basicSalary > 0
      ? staffRate.basicSalary
      : staffRate?.monthlySalary != null && staffRate.monthlySalary > 0
        ? 0 // a monthly-salary staff is treated as fixed-base below
        : 0;

  return { hourlyRate: round2(hourlyRate), basicSalary: round2(basicSalary) };
};

/** True when a rule targets a given staff member. */
export const ruleApplies = (rule: PayrollRule, ctx: PayrollCalcInput): boolean => {
  if (!rule.isActive) return false;
  // Optional structured condition:
  //   { minAttendancePct }  apply only at/above an attendance threshold
  //   { maxLateCount }      apply only up to a late count (e.g. punctuality bonus)
  //   { minLateCount }      apply only at/above a late count (e.g. lateness penalty)
  const cond = rule.condition ?? {};
  const minAtt = Number((cond as Record<string, unknown>).minAttendancePct);
  if (Number.isFinite(minAtt) && ctx.attendancePct < minAtt) return false;
  const maxLate = Number((cond as Record<string, unknown>).maxLateCount);
  if (Number.isFinite(maxLate) && ctx.lateCount > maxLate) return false;
  const minLate = Number((cond as Record<string, unknown>).minLateCount);
  if (Number.isFinite(minLate) && ctx.lateCount < minLate) return false;

  switch (rule.appliesTo) {
    case "all":
      return true;
    case "role":
      return !!ctx.role && (rule.appliesRef ?? "").toLowerCase() === ctx.role.toLowerCase();
    case "staff":
      return rule.appliesRef === ctx.staffId;
    case "department":
      return (
        !!ctx.department &&
        (rule.appliesRef ?? "").toLowerCase() === ctx.department.toLowerCase()
      );
    default:
      return false;
  }
};

/**
 * A single rule's monetary contribution for one staff member.
 * `base` is the figure a `percent` rule applies to (typically gross-so-far).
 */
export const ruleAmount = (
  rule: PayrollRule,
  ctx: PayrollCalcInput,
  base: number,
): number => {
  const hours = minutesToHours(ctx.workedMinutes);
  switch (rule.calcMethod) {
    case "flat":
      return round2(rule.value);
    case "percent":
      return round2((base * rule.value) / 100);
    case "per_hour":
      return round2(rule.value * hours);
    case "per_day":
      return round2(rule.value * ctx.presentDays);
    case "multiplier":
      // multiplier rules are only meaningful for overtime; handled inline.
      return 0;
    default:
      return 0;
  }
};

/**
 * Full salary breakdown for one staff member. Overtime multiplier comes from
 * settings (or an explicit `overtime` multiplier rule, whichever is higher).
 */
export const computePayroll = (
  ctx: PayrollCalcInput,
  rules: PayrollRule[],
  overtimeMultiplier: number,
): PayrollCalcResult => {
  const regularMinutes = Math.max(ctx.workedMinutes - ctx.overtimeMinutes, 0);
  const regularHours = minutesToHours(regularMinutes);
  const overtimeHours = minutesToHours(ctx.overtimeMinutes);

  // An active overtime multiplier rule (applies_to matches) overrides the
  // settings default when larger — lets management pay 2× on weekends, etc.
  const otRule = rules.find(
    (r) => r.ruleType === "overtime" && r.calcMethod === "multiplier" && ruleApplies(r, ctx),
  );
  const effMultiplier = Math.max(overtimeMultiplier, otRule?.value ?? 0) || 1;

  const basicSalary = round2(ctx.basicSalary);
  const hourlyEarnings = round2(ctx.hourlyRate * regularHours);
  const overtimeEarnings = round2(ctx.hourlyRate * effMultiplier * overtimeHours);

  const breakdown: BreakdownLine[] = [];
  if (basicSalary > 0)
    breakdown.push({ label: "Basic Salary", type: "allowance", amount: basicSalary });
  if (hourlyEarnings > 0)
    breakdown.push({ label: "Hourly Earnings", type: "allowance", amount: hourlyEarnings });
  if (overtimeEarnings > 0)
    breakdown.push({ label: "Overtime", type: "overtime", amount: overtimeEarnings });

  // Base used for percentage rules = earnings before rule adjustments.
  const earningsBase = round2(basicSalary + hourlyEarnings + overtimeEarnings);

  let incentives = 0;
  let allowances = 0;
  let deductions = 0;
  let penalties = 0;

  for (const rule of rules) {
    if (rule.ruleType === "overtime") continue; // already handled
    if (!ruleApplies(rule, ctx)) continue;
    const amt = ruleAmount(rule, ctx, earningsBase);
    if (amt <= 0) continue;
    breakdown.push({ ruleId: rule.id, label: rule.name, type: rule.ruleType, amount: amt });
    switch (rule.ruleType) {
      case "incentive":
        incentives = round2(incentives + amt);
        break;
      case "allowance":
        allowances = round2(allowances + amt);
        break;
      case "deduction":
        deductions = round2(deductions + amt);
        break;
      case "penalty":
        penalties = round2(penalties + amt);
        break;
    }
  }

  const grossEarnings = round2(
    basicSalary + hourlyEarnings + overtimeEarnings + incentives + allowances,
  );
  const netSalary = round2(Math.max(grossEarnings - deductions - penalties, 0));

  return {
    basicSalary,
    hourlyEarnings,
    overtimeEarnings,
    incentives,
    allowances,
    grossEarnings,
    deductions,
    penalties,
    netSalary,
    breakdown,
  };
};

// ── Run-level totals ─────────────────────────────────────────────────────────

export interface RunTotals {
  staffCount: number;
  totalGross: number;
  totalOvertime: number;
  totalIncentive: number;
  totalDeductions: number;
  totalNet: number;
}

export const summariseRun = (
  items: Pick<
    PayrollItem,
    | "grossEarnings"
    | "overtimeEarnings"
    | "incentives"
    | "deductions"
    | "penalties"
    | "netSalary"
  >[],
): RunTotals => {
  const t: RunTotals = {
    staffCount: items.length,
    totalGross: 0,
    totalOvertime: 0,
    totalIncentive: 0,
    totalDeductions: 0,
    totalNet: 0,
  };
  for (const it of items) {
    t.totalGross = round2(t.totalGross + it.grossEarnings);
    t.totalOvertime = round2(t.totalOvertime + it.overtimeEarnings);
    t.totalIncentive = round2(t.totalIncentive + it.incentives);
    t.totalDeductions = round2(t.totalDeductions + it.deductions + it.penalties);
    t.totalNet = round2(t.totalNet + it.netSalary);
  }
  return t;
};

// ── Monthly trend buckets ────────────────────────────────────────────────────

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
  });
};

export const monthBuckets = (months: number): Map<string, number> => {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d), 0);
  }
  return buckets;
};

export const periodEndFor = (
  start: string,
  period: "weekly" | "biweekly" | "monthly" | "custom",
): string => {
  const d = new Date(`${start}T00:00:00`);
  if (period === "weekly") d.setDate(d.getDate() + 6);
  else if (period === "biweekly") d.setDate(d.getDate() + 13);
  else if (period === "monthly") {
    d.setMonth(d.getMonth() + 1);
    d.setDate(d.getDate() - 1);
  } else {
    d.setDate(d.getDate() + 29);
  }
  return d.toISOString().slice(0, 10);
};
