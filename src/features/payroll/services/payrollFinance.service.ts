import {
  financeSyncService,
  type PayrollExpenseInput,
} from "@/features/finance/services";
import type { FinanceAuditActor } from "@/features/finance/services";
import type { ImportResult } from "@/features/finance/types/financeImport.types";
import type { PayrollItem } from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Payroll ↔ Finance integration — ENTERPRISE per-employee sync.
//
// Each approved/paid payroll item becomes ONE Expense row in Finance, keyed by
// (source='payroll', source_id=payroll_item.id) — the permanent dedup key. This
// thin adapter maps `PayrollItem` → the finance layer's neutral
// `PayrollExpenseInput` and delegates ALL posting / dedup / reversal to
// `financeSyncService` (the single idempotent poster). No finance table or calc
// is touched here — reuse only.
// ─────────────────────────────────────────────────────────────────────────────

export interface RunFinanceCtx {
  runId: string;
  runTitle?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Salary expense category name (payroll_settings.salaryCategoryName). */
  categoryName: string;
  /** Overrides each item's own method (e.g. the pay-run method). */
  paymentMethod?: string;
}

const monthLabel = (periodStart?: string, periodEnd?: string): string => {
  const iso = periodEnd || periodStart;
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const toInput = (item: PayrollItem, ctx: RunFinanceCtx): PayrollExpenseInput => ({
  itemId: item.id,
  staffId: item.staffId,
  staffName: item.staffName,
  department: item.department,
  designation: item.role,
  netSalary: item.netSalary,
  grossEarnings: item.grossEarnings,
  allowances: item.allowances,
  deductions: item.deductions,
  status: item.status,
  paymentMethod: ctx.paymentMethod ?? item.paymentMethod,
  date: ctx.periodEnd || new Date().toISOString().slice(0, 10),
  payrollMonth: monthLabel(ctx.periodStart, ctx.periodEnd),
  runId: ctx.runId,
  runTitle: ctx.runTitle,
  categoryName: ctx.categoryName,
});

class PayrollFinanceService {
  /**
   * Sync every positive-net item of a run to Finance (idempotent). Returns the
   * per-item Finance txn ids so the caller can stamp `finance_txn_id`.
   */
  async syncRunItems(
    items: PayrollItem[],
    ctx: RunFinanceCtx,
    actor?: FinanceAuditActor,
  ): Promise<{ result: ImportResult; txnByItem: Map<string, string> }> {
    const inputs = items
      .filter((i) => i.netSalary > 0)
      .map((i) => toInput(i, ctx));
    return financeSyncService.syncPayrollItems(inputs, actor);
  }

  /** Mark the Finance expenses for these items as paid. */
  async markRunItemsPaid(itemIds: string[]): Promise<void> {
    await financeSyncService.markPayrollItemsPaid(itemIds);
  }

  /** Reverse (delete) the Finance expenses for these items. */
  async removeRunItems(itemIds: string[]): Promise<void> {
    await financeSyncService.removeBySourceIds("payroll", itemIds);
  }
}

export const payrollFinanceService = new PayrollFinanceService();
