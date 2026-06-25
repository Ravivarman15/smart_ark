import * as XLSX from "xlsx";
import { round2 } from "./payrollCalc";
import type { ApprovalGridRow } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Payroll report builders + CSV/Excel writers for the Approval Center.
//
// Each builder turns the enriched approval grid into a flat, human-readable row
// set. Per-report PDF templates are intentionally deferred — CSV/Excel covers
// the register / bank-transfer / department / bonus / deduction / tax needs and
// reuses the same `xlsx` dependency the Salary Register already ships.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportRow = Record<string, string | number>;

export const buildRegisterRows = (rows: ApprovalGridRow[]): ReportRow[] =>
  rows.map((r) => ({
    "Employee ID": r.employeeCode,
    Name: r.staffName ?? "",
    Department: r.department ?? "",
    Designation: r.designation ?? "",
    "Working Days": r.workingDays,
    Present: r.presentDays,
    Leave: r.leaveDays,
    "Overtime (hrs)": round2(r.overtimeMinutes / 60),
    Basic: r.basicSalary,
    Allowances: r.allowances,
    Bonus: r.bonus,
    Incentives: r.incentives,
    Reimbursements: r.reimbursements,
    "Loan Deduction": r.loanDeduction,
    PF: r.pf,
    ESI: r.esi,
    Tax: r.tax,
    "Other Deductions": r.otherDeductions,
    "Net Salary": r.netSalary,
    "Previous Month": r.previousNet,
    Difference: r.difference,
    Status: r.status,
  }));

export const buildBankTransferRows = (rows: ApprovalGridRow[]): ReportRow[] =>
  rows.map((r) => ({
    "Employee ID": r.employeeCode,
    Name: r.staffName ?? "",
    Department: r.department ?? "",
    "Net Payable": r.netSalary,
    Currency: "INR",
  }));

export const buildDepartmentRows = (rows: ApprovalGridRow[]): ReportRow[] => {
  const byDept = new Map<string, { count: number; net: number }>();
  for (const r of rows) {
    const key = r.department ?? "Unassigned";
    const cur = byDept.get(key) ?? { count: 0, net: 0 };
    cur.count += 1;
    cur.net = round2(cur.net + r.netSalary);
    byDept.set(key, cur);
  }
  return [...byDept.entries()].map(([Department, v]) => ({
    Department,
    Employees: v.count,
    "Total Net": v.net,
  }));
};

export const buildBonusRows = (rows: ApprovalGridRow[]): ReportRow[] =>
  rows
    .filter((r) => r.bonus > 0 || r.incentives > 0)
    .map((r) => ({
      "Employee ID": r.employeeCode,
      Name: r.staffName ?? "",
      Bonus: r.bonus,
      Incentives: r.incentives,
      Total: round2(r.bonus + r.incentives),
    }));

export const buildDeductionRows = (rows: ApprovalGridRow[]): ReportRow[] =>
  rows.map((r) => ({
    "Employee ID": r.employeeCode,
    Name: r.staffName ?? "",
    PF: r.pf,
    ESI: r.esi,
    Tax: r.tax,
    Loan: r.loanDeduction,
    Penalties: r.penalties,
    Other: round2(r.deductions + r.otherDeductions),
    Total: round2(
      r.pf + r.esi + r.tax + r.loanDeduction + r.penalties + r.deductions + r.otherDeductions,
    ),
  }));

export const buildTaxRows = (rows: ApprovalGridRow[]): ReportRow[] =>
  rows.map((r) => ({
    "Employee ID": r.employeeCode,
    Name: r.staffName ?? "",
    "Gross Earnings": r.grossEarnings,
    Tax: r.tax,
    PF: r.pf,
    ESI: r.esi,
  }));

// ── Writers ──────────────────────────────────────────────────────────────────
export const downloadCsv = (rows: ReportRow[], fileBase: string): void => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const downloadXlsx = (
  rows: ReportRow[],
  sheetName: string,
  fileBase: string,
): void => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
};
