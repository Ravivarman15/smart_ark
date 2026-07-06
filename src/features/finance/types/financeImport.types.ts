// ─────────────────────────────────────────────────────────────────────────────
// Types for the Enterprise auto-sync import flows (Student-Fee → Income,
// Payroll → Expense). Kept separate from finance.types.ts because these shapes
// describe *source* records enriched for the import popups, not Finance rows.
// ─────────────────────────────────────────────────────────────────────────────

/** Module a synced Finance row originates from (matches expense_transactions.source). */
export type ImportSource = "fee" | "payroll";

// ── Phase 1: Student-Fee collection → Income ─────────────────────────────────

/** One collected fee payment (a `fee_installments` row) enriched for import. */
export interface CollectedPayment {
  /** fee_installments.id — the dedup key (expense_transactions.source_id). */
  id: string;
  studentFeeId: string;
  studentId?: string;
  receiptNo?: string;
  studentName?: string;
  admissionNo?: string;
  className?: string;
  section?: string;
  /** Fee structure / batch context shown in the "Fee Category" column. */
  feeCategory?: string;
  batchId?: string;
  /** This payment's amount. */
  collectedAmount: number;
  /** Discount on the parent fee record (context only — not re-posted). */
  discount: number;
  /** Total received on the parent fee record. */
  receivedAmount: number;
  /** Outstanding balance on the parent fee record. */
  pending: number;
  paymentMethod?: string;
  collectedDate?: string;
  /** Resolved name of the profile that recorded the payment. */
  collectedBy?: string;
  collectedById?: string;
  /** Parent fee record status: paid | partial | pending. */
  status: string;
  academicYearId?: string;
  /** True when this payment already has an Income row (source='fee', source_id=id). */
  alreadyImported: boolean;
}

export interface FeeCollectionFilters {
  academicYearId?: string;
  /** "YYYY-MM" — filters on payment_date month. */
  month?: string;
  from?: string;
  to?: string;
  batchId?: string;
  section?: string;
  feeCategory?: string;
  paymentMethod?: string;
  /** Parent fee status. */
  paymentStatus?: string;
  collectedById?: string;
  search?: string;
}

// ── Phase 2: Payroll salary line → Expense ───────────────────────────────────

/** One payroll item (staff salary line) enriched for the salary import popup. */
export interface SalaryLine {
  /** payroll_items.id — the dedup key (expense_transactions.source_id). */
  id: string;
  runId: string;
  /** Stable employee code (EMP-XXXXXX) derived from the staff id. */
  employeeCode: string;
  staffId?: string;
  employeeName?: string;
  department?: string;
  designation?: string;
  /** Human month label, e.g. "June 2026". */
  payrollMonth?: string;
  /** "YYYY-MM" of the run period end — for month filtering. */
  monthKey?: string;
  gross: number;
  allowances: number;
  deductions: number;
  net: number;
  paymentDate?: string;
  paymentMethod?: string;
  /** payroll_items.status: approved | paid | pending. */
  status: string;
  /** True when this salary line already has an Expense row (source='payroll'). */
  alreadyImported: boolean;
}

export interface SalaryImportFilters {
  search?: string;
  department?: string;
  designation?: string;
  /** "YYYY-MM". */
  monthKey?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  staffId?: string;
  from?: string;
  to?: string;
}

// ── Shared import outcome ────────────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  /** Already imported (deduped) — never re-posted. */
  skipped: number;
  failed: number;
  errors: string[];
}

export const emptyImportResult = (): ImportResult => ({
  imported: 0,
  skipped: 0,
  failed: 0,
  errors: [],
});
