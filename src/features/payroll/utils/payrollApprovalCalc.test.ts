import { describe, it, expect } from "vitest";
import { recomputeNet, summariseApproval, type NetComponents, type SummariseRow } from "./payrollApprovalCalc";

const base: NetComponents = {
  basicSalary: 20000,
  hourlyEarnings: 0,
  overtimeEarnings: 0,
  incentives: 0,
  allowances: 2000,
  bonus: 0,
  reimbursements: 0,
  manualAdjustment: 0,
  deductions: 0,
  penalties: 0,
  loanDeduction: 0,
  pf: 0,
  esi: 0,
  tax: 0,
  otherDeductions: 0,
};

describe("recomputeNet", () => {
  it("sums earnings into gross and subtracts all deduction buckets", () => {
    const r = recomputeNet({
      ...base,
      bonus: 5000,
      reimbursements: 1000,
      loanDeduction: 1500,
      pf: 1200,
      esi: 300,
      tax: 800,
      otherDeductions: 200,
    });
    expect(r.grossEarnings).toBe(28000); // 20000 + 2000 + 5000 + 1000
    expect(r.totalDeductions).toBe(4000); // 1500 + 1200 + 300 + 800 + 200
    expect(r.netSalary).toBe(24000);
  });

  it("treats a negative manualAdjustment as a salary decrease", () => {
    const r = recomputeNet({ ...base, manualAdjustment: -3000 });
    expect(r.grossEarnings).toBe(19000); // 22000 - 3000
    expect(r.netSalary).toBe(19000);
  });

  it("floors net at zero — a run never pays a negative amount", () => {
    const r = recomputeNet({ ...base, basicSalary: 1000, allowances: 0, loanDeduction: 5000 });
    expect(r.netSalary).toBe(0);
  });
});

describe("summariseApproval", () => {
  const rows: SummariseRow[] = [
    { netSalary: 30000, bonus: 5000, incentives: 1000, deductions: 0, penalties: 0, loanDeduction: 2000, pf: 0, esi: 0, tax: 1000, otherDeductions: 0 },
    { netSalary: 8000, bonus: 0, incentives: 0, deductions: 500, penalties: 0, loanDeduction: 0, pf: 0, esi: 0, tax: 0, otherDeductions: 0 },
    { netSalary: 16000, bonus: 2000, incentives: 0, deductions: 0, penalties: 1000, loanDeduction: 0, pf: 500, esi: 0, tax: 0, otherDeductions: 0 },
  ];

  it("computes the review-page figures", () => {
    const s = summariseApproval(rows);
    expect(s.employees).toBe(3);
    expect(s.totalPayroll).toBe(54000);
    expect(s.totalBonuses).toBe(8000); // 5000+1000 + 2000
    expect(s.totalDeductions).toBe(5000); // (2000+1000) + 500 + (1000+500)
    expect(s.averageSalary).toBe(18000);
    expect(s.highestSalary).toBe(30000);
    expect(s.lowestSalary).toBe(8000);
  });

  it("returns zeros for an empty run (no NaN / Infinity)", () => {
    const s = summariseApproval([]);
    expect(s.employees).toBe(0);
    expect(s.averageSalary).toBe(0);
    expect(s.lowestSalary).toBe(0);
    expect(s.highestSalary).toBe(0);
  });
});
