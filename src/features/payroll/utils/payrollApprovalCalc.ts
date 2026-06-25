// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL-STAGE SALARY ARITHMETIC
//
// Pure, side-effect-free. The Approval Center lets Management adjust named
// one-time components (bonus, reimbursements, loan/PF/ESI/tax/other deductions,
// manual adjustment) on top of the engine-computed base. This module is the ONE
// place that recomputes gross / net from those components, so the grid, the edit
// drawer and the service can never disagree on a figure.
//
//   gross = basic + hourly + overtime + incentives + allowances
//                 + bonus + reimbursements + manualAdjustment
//   net   = max(gross − (deductions + penalties + loan + pf + esi + tax + other), 0)
//
// `manualAdjustment` is SIGNED — a negative value is how "decrease salary" is
// represented. Net is floored at 0 so a run can never pay a negative amount.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from "./payrollCalc";
import type { ApprovalSummary } from "../types/payroll.types";

export interface NetComponents {
  basicSalary: number;
  hourlyEarnings: number;
  overtimeEarnings: number;
  incentives: number;
  allowances: number;
  bonus: number;
  reimbursements: number;
  manualAdjustment: number;
  deductions: number;
  penalties: number;
  loanDeduction: number;
  pf: number;
  esi: number;
  tax: number;
  otherDeductions: number;
}

export interface RecomputedNet {
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

/** Recompute gross / total-deductions / net from the full component set. */
export const recomputeNet = (c: NetComponents): RecomputedNet => {
  const grossEarnings = round2(
    c.basicSalary +
      c.hourlyEarnings +
      c.overtimeEarnings +
      c.incentives +
      c.allowances +
      c.bonus +
      c.reimbursements +
      c.manualAdjustment,
  );
  const totalDeductions = round2(
    c.deductions +
      c.penalties +
      c.loanDeduction +
      c.pf +
      c.esi +
      c.tax +
      c.otherDeductions,
  );
  const netSalary = round2(Math.max(grossEarnings - totalDeductions, 0));
  return { grossEarnings, totalDeductions, netSalary };
};

// ── Approval summary (the review page totals) ────────────────────────────────

export interface SummariseRow {
  netSalary: number;
  bonus: number;
  incentives: number;
  deductions: number;
  penalties: number;
  loanDeduction: number;
  pf: number;
  esi: number;
  tax: number;
  otherDeductions: number;
}

/** Aggregate the approval review figures across every employee line. */
export const summariseApproval = (rows: SummariseRow[]): ApprovalSummary => {
  const employees = rows.length;
  let totalPayroll = 0;
  let totalBonuses = 0;
  let totalDeductions = 0;
  let highestSalary = 0;
  let lowestSalary = employees > 0 ? Infinity : 0;

  for (const r of rows) {
    totalPayroll = round2(totalPayroll + r.netSalary);
    totalBonuses = round2(totalBonuses + r.bonus + r.incentives);
    totalDeductions = round2(
      totalDeductions +
        r.deductions +
        r.penalties +
        r.loanDeduction +
        r.pf +
        r.esi +
        r.tax +
        r.otherDeductions,
    );
    if (r.netSalary > highestSalary) highestSalary = r.netSalary;
    if (r.netSalary < lowestSalary) lowestSalary = r.netSalary;
  }

  return {
    employees,
    totalPayroll,
    totalBonuses,
    totalDeductions,
    averageSalary: employees > 0 ? round2(totalPayroll / employees) : 0,
    highestSalary,
    lowestSalary: lowestSalary === Infinity ? 0 : lowestSalary,
  };
};
