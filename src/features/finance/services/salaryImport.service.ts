import { BaseService } from "@/shared/services";
import {
  financeSyncService,
  SALARY_EXPENSE_CATEGORY,
  type PayrollExpenseInput,
} from "./financeSync.service";
import type { FinanceAuditActor } from "./financeAudit.service";
import {
  emptyImportResult,
  type ImportResult,
  type SalaryImportFilters,
  type SalaryLine,
} from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// STAFF SALARY IMPORT (Phase 2) — reads the salary lines already computed by the
// Payroll module (`payroll_items` on approved / paid runs) and enriches each for
// the "Import Staff Salary" popup on the Manage Expense page.
//
// Reuses, never rebuilds:
//   • payroll_runs / payroll_items — the salary ledger (NET is READ, never
//     recomputed — no duplicate payroll calculation)
//   • profiles — designation / department context (tolerant select)
//   • financeSyncService — the idempotent poster (writes the Expense rows,
//     deduped by source='payroll', source_id=payroll_item.id)
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Stable employee code derived from the staff id (no dedicated column). */
const employeeCodeFor = (staffId: string): string =>
  `EMP-${(staffId ?? "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;

const monthLabel = (periodStart?: string, periodEnd?: string): string => {
  const iso = periodEnd || periodStart;
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

type RunRow = {
  id: string;
  title: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
};

type ItemRow = {
  id: string;
  run_id: string;
  staff_id: string | null;
  staff_name: string | null;
  role: string | null;
  department: string | null;
  gross_earnings: number | string | null;
  allowances: number | string | null;
  deductions: number | string | null;
  net_salary: number | string | null;
  status: string | null;
  paid_at: string | null;
  payment_method: string | null;
};

interface ProfileLite {
  designation?: string;
  department?: string;
}

class SalaryImportService extends BaseService {
  /**
   * List staff salary lines (from approved / paid runs) enriched with
   * designation + an `alreadyImported` flag.
   */
  async listSalaryLines(
    filters: SalaryImportFilters = {},
  ): Promise<SalaryLine[]> {
    // 1. Committed runs only (approved / paid) — draft/pending salaries never sync.
    const runsRes = await this.db
      .from("payroll_runs" as never)
      .select("id, title, period_start, period_end, status")
      .in("status", ["approved", "paid"]);
    if (runsRes.error) return [];
    const runs = (runsRes.data as unknown as RunRow[]) ?? [];
    if (runs.length === 0) return [];
    const runById = new Map(runs.map((r) => [r.id, r]));

    // 2. Salary lines for those runs.
    const itemsRes = await this.db
      .from("payroll_items" as never)
      .select(
        "id, run_id, staff_id, staff_name, role, department, gross_earnings, allowances, deductions, net_salary, status, paid_at, payment_method",
      )
      .in("run_id", Array.from(runById.keys()));
    if (itemsRes.error) return [];
    const items = (itemsRes.data as unknown as ItemRow[]) ?? [];
    if (items.length === 0) return [];

    // 3. Designation / department (tolerant — degrades on older profiles schema).
    const staffIds = Array.from(
      new Set(items.map((i) => i.staff_id).filter((x): x is string => !!x)),
    );
    const [profiles, importedIds] = await Promise.all([
      this.profilesFor(staffIds),
      financeSyncService.existingSourceIds("payroll", items.map((i) => i.id)),
    ]);

    // 4. Assemble.
    const lines: SalaryLine[] = items.map((i) => {
      const run = runById.get(i.run_id);
      const prof = i.staff_id ? profiles.get(i.staff_id) : undefined;
      const monthKey = (run?.period_end || run?.period_start || "").slice(0, 7);
      return {
        id: i.id,
        runId: i.run_id,
        employeeCode: employeeCodeFor(i.staff_id ?? ""),
        staffId: i.staff_id ?? undefined,
        employeeName: i.staff_name ?? undefined,
        department: i.department ?? prof?.department ?? undefined,
        designation: prof?.designation ?? i.role ?? undefined,
        payrollMonth: monthLabel(run?.period_start ?? undefined, run?.period_end ?? undefined),
        monthKey,
        gross: num(i.gross_earnings),
        allowances: num(i.allowances),
        deductions: num(i.deductions),
        net: num(i.net_salary),
        paymentDate: i.paid_at?.slice(0, 10) ?? run?.period_end ?? undefined,
        paymentMethod: i.payment_method ?? undefined,
        status: i.status ?? "approved",
        alreadyImported: importedIds.has(i.id),
      };
    });

    return this.applyFilters(lines, filters);
  }

  private applyFilters(
    lines: SalaryLine[],
    filters: SalaryImportFilters,
  ): SalaryLine[] {
    let out = lines;
    if (filters.department)
      out = out.filter((l) => l.department === filters.department);
    if (filters.designation)
      out = out.filter((l) => l.designation === filters.designation);
    if (filters.monthKey) out = out.filter((l) => l.monthKey === filters.monthKey);
    if (filters.paymentStatus)
      out = out.filter((l) => l.status === filters.paymentStatus);
    if (filters.paymentMethod)
      out = out.filter((l) => l.paymentMethod === filters.paymentMethod);
    if (filters.staffId) out = out.filter((l) => l.staffId === filters.staffId);
    if (filters.from) out = out.filter((l) => (l.paymentDate ?? "") >= filters.from!);
    if (filters.to) out = out.filter((l) => (l.paymentDate ?? "") <= filters.to!);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      out = out.filter((l) =>
        [l.employeeName, l.employeeCode, l.department, l.designation, l.payrollMonth]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    return out;
  }

  private async profilesFor(
    staffIds: string[],
  ): Promise<Map<string, ProfileLite>> {
    const map = new Map<string, ProfileLite>();
    if (staffIds.length === 0) return map;
    const res = await this.db
      .from("profiles")
      .select("id, designation, department")
      .in("id", staffIds);
    if (res.error) return map; // older schema → no enrichment, never blocks
    for (const r of (res.data as { id: string; designation: string | null; department: string | null }[]) ?? []) {
      map.set(r.id, {
        designation: r.designation ?? undefined,
        department: r.department ?? undefined,
      });
    }
    return map;
  }

  /**
   * Import the supplied salary lines into Finance Expense — idempotently.
   * Already-imported lines are counted as `skipped`, never re-posted.
   */
  async importSalaryLines(
    lines: SalaryLine[],
    actor?: FinanceAuditActor,
  ): Promise<ImportResult> {
    if (lines.length === 0) return emptyImportResult();
    const inputs: PayrollExpenseInput[] = lines.map((l) => ({
      itemId: l.id,
      staffId: l.staffId,
      staffName: l.employeeName,
      department: l.department,
      designation: l.designation,
      netSalary: l.net,
      grossEarnings: l.gross,
      allowances: l.allowances,
      deductions: l.deductions,
      status: l.status,
      paymentMethod: l.paymentMethod,
      date: l.paymentDate ?? new Date().toISOString().slice(0, 10),
      payrollMonth: l.payrollMonth,
      runId: l.runId,
      categoryName: SALARY_EXPENSE_CATEGORY,
    }));
    const { result } = await financeSyncService.syncPayrollItems(inputs, actor);
    return result;
  }
}

export const salaryImportService = new SalaryImportService();
