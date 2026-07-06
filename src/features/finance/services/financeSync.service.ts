import { BaseService, AppError } from "@/shared/services";
import { financeTransactionService } from "./financeTransaction.service";
import { financeAuditService, type FinanceAuditActor } from "./financeAudit.service";
import { formatINR } from "../utils/financeCalc";
import {
  emptyImportResult,
  type CollectedPayment,
  type ImportResult,
  type ImportSource,
} from "../types/financeImport.types";

export const SALARY_EXPENSE_CATEGORY = "Salary";

/**
 * Neutral, payroll-agnostic input for posting ONE staff salary line as an
 * Expense. The payroll feature maps its `PayrollItem` → this shape so the
 * finance layer never imports payroll types (no cross-feature coupling).
 */
export interface PayrollExpenseInput {
  /** payroll_items.id — the permanent dedup key (source_id). */
  itemId: string;
  staffId?: string;
  staffName?: string;
  department?: string;
  designation?: string;
  netSalary: number;
  grossEarnings?: number;
  allowances?: number;
  deductions?: number;
  /** payroll_items.status at sync time — 'paid' posts a paid expense. */
  status?: string;
  paymentMethod?: string;
  /** Expense date (usually the run's period end). */
  date: string;
  payrollMonth?: string;
  runId?: string;
  runTitle?: string;
  /** Salary expense category name (payroll_settings.salaryCategoryName). */
  categoryName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE SYNC — the single idempotent poster for ERP → Finance auto-sync.
//
// Every automatic income/expense row (student fee collection, staff salary)
// flows through here so the Smart Duplicate Engine (Phase 4) lives in exactly
// ONE place. Each posted row carries (source, source_id) = the originating
// record's primary key; the DB partial-unique index uq_expense_tx_source is the
// race-safe backstop, and a 23505 → AppError("Conflict") is treated as
// "already imported" rather than an error.
//
// Reuses `financeTransactionService` for the actual write (tax/category snapshot
// + legacy fallbacks) and `expense_transactions` — creates NO new tables.
// Migration-safe: if `source_id` is absent the pre-checks degrade to "unknown"
// (empty set) and the write still succeeds without the dedup guarantee.
// ─────────────────────────────────────────────────────────────────────────────

export const FEE_INCOME_CATEGORY = "Student Fee";

class FinanceSyncService extends BaseService {
  /** Resolve (or create) the income category used for fee collections. */
  private async feeIncomeCategoryId(name = FEE_INCOME_CATEGORY): Promise<string | null> {
    try {
      const { data } = await this.db
        .from("expense_categories")
        .select("id")
        .eq("type", "income")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (data && (data as { id: string }).id) return String((data as { id: string }).id);
      // Prefer the enterprise projection (scope='fee'); fall back to the legacy
      // one when the finance-module extension columns aren't present.
      let ins = await this.db
        .from("expense_categories")
        .insert({ name, type: "income", scope: "fee" } as never)
        .select("id")
        .single();
      if (ins.error) {
        ins = await this.db
          .from("expense_categories")
          .insert({ name, type: "income" } as never)
          .select("id")
          .single();
      }
      return ins.data ? String((ins.data as { id: string }).id) : null;
    } catch {
      return null;
    }
  }

  /** Resolve (or create) the expense category used for salary lines. */
  private async salaryExpenseCategoryId(
    name = SALARY_EXPENSE_CATEGORY,
  ): Promise<string | null> {
    try {
      const { data } = await this.db
        .from("expense_categories")
        .select("id")
        .eq("type", "expense")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (data && (data as { id: string }).id) return String((data as { id: string }).id);
      const ins = await this.db
        .from("expense_categories")
        .insert({ name, type: "expense" } as never)
        .select("id")
        .single();
      return ins.data ? String((ins.data as { id: string }).id) : null;
    } catch {
      return null;
    }
  }

  /** Id of the Finance row already posted for this source record, or null. */
  async findBySource(
    source: ImportSource,
    sourceId: string,
  ): Promise<string | null> {
    const { data, error } = await this.db
      .from("expense_transactions")
      .select("id")
      .eq("source", source)
      .eq("source_id", sourceId)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data ? String((data as { id: string }).id) : null;
  }

  /** True when a Finance row already exists for this source record. */
  async exists(source: ImportSource, sourceId: string): Promise<boolean> {
    return (await this.findBySource(source, sourceId)) != null;
  }

  /**
   * Batch pre-check for the import popups: which of these source ids already
   * have a Finance row? Degrades to an empty set (nothing known imported) on a
   * pre-migration schema so the list still renders.
   */
  async existingSourceIds(
    source: ImportSource,
    ids: string[],
  ): Promise<Set<string>> {
    const found = new Set<string>();
    if (ids.length === 0) return found;
    const { data, error } = await this.db
      .from("expense_transactions")
      .select("source_id")
      .eq("source", source)
      .in("source_id", ids);
    if (error) return found;
    for (const r of (data as { source_id: string | null }[]) ?? []) {
      if (r.source_id) found.add(r.source_id);
    }
    return found;
  }

  /**
   * Post a collected fee payment as an Income row — idempotently. Returns
   * "imported" on a fresh write, "skipped" when a row already exists (pre-check
   * or unique-index conflict). Any other failure throws.
   */
  async upsertIncomeFromFee(
    p: CollectedPayment,
    actor?: FinanceAuditActor,
  ): Promise<"imported" | "skipped"> {
    if (p.collectedAmount <= 0) return "skipped";
    if (await this.exists("fee", p.id)) return "skipped";

    const categoryId = await this.feeIncomeCategoryId();
    try {
      const txn = await financeTransactionService.create(
        {
          type: "income",
          title: p.studentName ? `Fee — ${p.studentName}` : "Student Fee",
          category: FEE_INCOME_CATEGORY,
          categoryId,
          amount: p.collectedAmount,
          paymentMethod: p.paymentMethod ?? null,
          date: p.collectedDate ?? null,
          status: "paid",
          source: "fee",
          sourceId: p.id,
          linkedStudentId: p.studentId ?? null,
          linkedStudentFeeId: p.studentFeeId ?? null,
          transactionReference: p.receiptNo ?? null,
          description: `Fee collection${p.receiptNo ? ` · Receipt ${p.receiptNo}` : ""}${p.studentName ? ` · ${p.studentName}` : ""}`,
        },
        actor?.actorId,
      );
      await financeAuditService.log(
        "transaction",
        txn.id,
        "fee_import",
        `Imported ${formatINR(p.collectedAmount)} fee collection${p.receiptNo ? ` (Receipt ${p.receiptNo})` : ""} from Fee Management`,
        actor,
      );
      return "imported";
    } catch (err) {
      // Unique-index race → already imported. Never a second row.
      if (err instanceof AppError && err.kind === "Conflict") return "skipped";
      throw err;
    }
  }

  /**
   * Post a staff salary line as an Expense row — idempotently. Returns
   * "imported" on a fresh write, "skipped" when a row already exists (and the
   * existing txn id, so payroll can stamp finance_txn_id either way).
   */
  async upsertExpenseFromPayrollItem(
    input: PayrollExpenseInput,
    actor?: FinanceAuditActor,
  ): Promise<{ status: "imported" | "skipped"; txnId: string | null }> {
    const existing = await this.findBySource("payroll", input.itemId);
    if (existing) return { status: "skipped", txnId: existing };
    if (input.netSalary <= 0) return { status: "skipped", txnId: null };

    const categoryId = await this.salaryExpenseCategoryId(input.categoryName);
    try {
      const txn = await financeTransactionService.create(
        {
          type: "expense",
          title: input.staffName ? `Salary — ${input.staffName}` : "Salary",
          category: input.categoryName,
          categoryId,
          amount: input.netSalary,
          paymentMethod: input.paymentMethod ?? null,
          date: input.date,
          department: input.department ?? "Payroll",
          status: input.status === "paid" ? "paid" : "approved",
          source: "payroll",
          sourceId: input.itemId,
          transactionReference: input.runId
            ? `PAYROLL-${input.runId.slice(0, 8).toUpperCase()}`
            : null,
          description: `Salary${input.payrollMonth ? ` · ${input.payrollMonth}` : ""}${input.staffName ? ` · ${input.staffName}` : ""}`,
          notes: input.designation ? `Designation: ${input.designation}` : null,
        },
        actor?.actorId,
      );
      await financeAuditService.log(
        "transaction",
        txn.id,
        "salary_import",
        `Imported ${formatINR(input.netSalary)} salary${input.staffName ? ` for ${input.staffName}` : ""}${input.payrollMonth ? ` (${input.payrollMonth})` : ""} from Payroll`,
        actor,
      );
      return { status: "imported", txnId: txn.id };
    } catch (err) {
      if (err instanceof AppError && err.kind === "Conflict") {
        // Lost the unique-index race — fetch the winner's id so payroll can
        // still stamp finance_txn_id.
        return { status: "skipped", txnId: await this.findBySource("payroll", input.itemId) };
      }
      throw err;
    }
  }

  /**
   * Sync a batch of salary lines. Idempotent — already-posted lines are skipped
   * (their existing txn id is still returned in `txnByItem`). Used by both the
   * on-approve auto-sync and the manual "Import Staff Salary" popup.
   */
  async syncPayrollItems(
    inputs: PayrollExpenseInput[],
    actor?: FinanceAuditActor,
  ): Promise<{ result: ImportResult; txnByItem: Map<string, string> }> {
    const result = emptyImportResult();
    const txnByItem = new Map<string, string>();
    for (const input of inputs) {
      try {
        const { status, txnId } = await this.upsertExpenseFromPayrollItem(input, actor);
        if (status === "imported") result.imported += 1;
        else result.skipped += 1;
        if (txnId) txnByItem.set(input.itemId, txnId);
      } catch (err) {
        result.failed += 1;
        result.errors.push(
          `${input.staffName ?? input.itemId}: ${err instanceof Error ? err.message : "sync failed"}`,
        );
      }
    }
    return { result, txnByItem };
  }

  /** Flip synced salary expenses to paid when their payroll run is paid. */
  async markPayrollItemsPaid(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    try {
      await this.db
        .from("expense_transactions")
        .update({ status: "paid", paid_at: new Date().toISOString() } as never)
        .eq("source", "payroll")
        .in("source_id", itemIds);
    } catch {
      /* best-effort */
    }
  }

  /**
   * Remove a synced Finance row when its source record is deleted / refunded /
   * cancelled — keeps the two ledgers consistent. Best-effort.
   */
  async removeBySource(source: ImportSource, sourceId: string): Promise<void> {
    try {
      await this.db
        .from("expense_transactions")
        .delete()
        .eq("source", source)
        .eq("source_id", sourceId);
    } catch {
      /* best-effort — a failed reversal must not break the source mutation */
    }
  }

  /** Bulk reversal for many source records (e.g. every item of a cancelled run). */
  async removeBySourceIds(source: ImportSource, sourceIds: string[]): Promise<void> {
    if (sourceIds.length === 0) return;
    try {
      await this.db
        .from("expense_transactions")
        .delete()
        .eq("source", source)
        .in("source_id", sourceIds);
    } catch {
      /* best-effort */
    }
  }
}

export const financeSyncService = new FinanceSyncService();
