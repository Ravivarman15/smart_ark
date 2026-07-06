import { BaseService } from "@/shared/services";
import { financeSyncService } from "./financeSync.service";
import type { FinanceAuditActor } from "./financeAudit.service";
import { toAmount } from "../utils/financeCalc";
import {
  emptyImportResult,
  type CollectedPayment,
  type FeeCollectionFilters,
  type ImportResult,
} from "../types/financeImport.types";

// ─────────────────────────────────────────────────────────────────────────────
// FEE COLLECTION IMPORT (Phase 1) — reads the money that has ALREADY been
// collected in the Fee module (`fee_installments` payment rows) and enriches
// each payment with its student / fee context for the "Import Student Fee
// Collection" popup on the Manage Income page.
//
// Reuses, never rebuilds:
//   • fee_installments  — the collection ledger (source of the payments)
//   • student_fees      — parent balances / discount / status
//   • students, standards, fee_structures, profiles — display context
//   • financeSyncService — the idempotent poster (writes the Income rows)
//
// Every posted row is deduped by (source='fee', source_id=installment.id), so an
// already-imported payment shows an "Already Imported" badge and is never
// re-posted.
// ─────────────────────────────────────────────────────────────────────────────

type InstallmentRow = {
  id: string;
  student_fee_id: string;
  amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  receipt_no: string | null;
  created_by: string | null;
  created_at: string;
};

type FeeRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  batch_name: string | null;
  discount_amount: number | string | null;
  amount_received: number | string | null;
  amount_pending: number | string | null;
  status: string | null;
  fee_structure_id: string | null;
};

type StudentRow = {
  id: string;
  enrolment_no: string | null;
  gr_no: string | null;
  roll_number: string | null;
  section: string | null;
  standard_id: string | null;
  batch_id: string | null;
  academic_year_id: string | null;
};

const monthOf = (date?: string | null): string =>
  date ? date.slice(0, 7) : "";

class FeeCollectionImportService extends BaseService {
  /**
   * List collected fee payments (real payments, not scheduled installments)
   * enriched with student + fee context and an `alreadyImported` flag.
   */
  async listCollectedPayments(
    filters: FeeCollectionFilters = {},
  ): Promise<CollectedPayment[]> {
    // 1. Payments — actual collections only (exclude the "Scheduled" plan rows).
    let q = this.db
      .from("fee_installments")
      .select(
        "id, student_fee_id, amount, payment_date, payment_method, receipt_no, created_by, created_at",
      )
      .neq("payment_method", "Scheduled");
    if (filters.from) q = q.gte("payment_date", filters.from);
    if (filters.to) q = q.lte("payment_date", filters.to);
    if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
    if (filters.collectedById) q = q.eq("created_by", filters.collectedById);
    const res = await q.order("payment_date", { ascending: false });
    const installments = this.guardList(res, "fee_installments") as unknown as InstallmentRow[];
    if (installments.length === 0) return [];

    // 2. Parent fee records.
    const feeIds = Array.from(new Set(installments.map((i) => i.student_fee_id).filter(Boolean)));
    const fees = await this.fetchFees(feeIds);

    // 3. Students → 4. standards + 5. structures + 6. profiles, hydrated in parallel.
    const studentIds = Array.from(
      new Set(Array.from(fees.values()).map((f) => f.student_id).filter((x): x is string => !!x)),
    );
    const structureIds = Array.from(
      new Set(Array.from(fees.values()).map((f) => f.fee_structure_id).filter((x): x is string => !!x)),
    );
    const creatorIds = Array.from(
      new Set(installments.map((i) => i.created_by).filter((x): x is string => !!x)),
    );
    const students = await this.fetchStudents(studentIds);
    const standardIds = Array.from(
      new Set(Array.from(students.values()).map((s) => s.standard_id).filter((x): x is string => !!x)),
    );
    const [standards, structures, profiles, importedIds] = await Promise.all([
      this.fetchNames("standards", standardIds),
      this.fetchNames("fee_structures", structureIds),
      this.fetchNames("profiles", creatorIds),
      financeSyncService.existingSourceIds("fee", installments.map((i) => i.id)),
    ]);

    // 7. Assemble.
    const rows: CollectedPayment[] = installments.map((i) => {
      const fee = fees.get(i.student_fee_id);
      const student = fee?.student_id ? students.get(fee.student_id) : undefined;
      return {
        id: i.id,
        studentFeeId: i.student_fee_id,
        studentId: fee?.student_id ?? undefined,
        receiptNo: i.receipt_no ?? undefined,
        studentName: fee?.student_name ?? undefined,
        admissionNo:
          student?.enrolment_no ?? student?.gr_no ?? student?.roll_number ?? undefined,
        className: student?.standard_id ? standards.get(student.standard_id) : undefined,
        section: student?.section ?? undefined,
        feeCategory:
          (fee?.fee_structure_id ? structures.get(fee.fee_structure_id) : undefined) ??
          fee?.batch_name ??
          undefined,
        batchId: student?.batch_id ?? undefined,
        collectedAmount: toAmount(i.amount),
        discount: toAmount(fee?.discount_amount),
        receivedAmount: toAmount(fee?.amount_received),
        pending: toAmount(fee?.amount_pending),
        paymentMethod: i.payment_method ?? undefined,
        collectedDate: i.payment_date ?? i.created_at?.slice(0, 10) ?? undefined,
        collectedBy: i.created_by ? profiles.get(i.created_by) : undefined,
        collectedById: i.created_by ?? undefined,
        status: fee?.status ?? "pending",
        academicYearId: student?.academic_year_id ?? undefined,
        alreadyImported: importedIds.has(i.id),
      };
    });

    return this.applyInMemoryFilters(rows, filters);
  }

  private applyInMemoryFilters(
    rows: CollectedPayment[],
    filters: FeeCollectionFilters,
  ): CollectedPayment[] {
    let out = rows;
    if (filters.month)
      out = out.filter((r) => monthOf(r.collectedDate) === filters.month);
    if (filters.batchId) out = out.filter((r) => r.batchId === filters.batchId);
    if (filters.academicYearId)
      out = out.filter((r) => r.academicYearId === filters.academicYearId);
    if (filters.section)
      out = out.filter(
        (r) => (r.section ?? "").toLowerCase() === filters.section!.toLowerCase(),
      );
    if (filters.feeCategory)
      out = out.filter((r) => r.feeCategory === filters.feeCategory);
    if (filters.paymentStatus)
      out = out.filter((r) => r.status === filters.paymentStatus);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      out = out.filter((r) =>
        [r.studentName, r.admissionNo, r.receiptNo, r.className, r.section, r.feeCategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    return out;
  }

  private async fetchFees(ids: string[]): Promise<Map<string, FeeRow>> {
    const map = new Map<string, FeeRow>();
    if (ids.length === 0) return map;
    const { data, error } = await this.db
      .from("student_fees")
      .select(
        "id, student_id, student_name, batch_name, discount_amount, amount_received, amount_pending, status, fee_structure_id",
      )
      .in("id", ids);
    if (error) return map;
    for (const r of (data as FeeRow[]) ?? []) map.set(r.id, r);
    return map;
  }

  private async fetchStudents(ids: string[]): Promise<Map<string, StudentRow>> {
    const map = new Map<string, StudentRow>();
    if (ids.length === 0) return map;
    // Rich projection first; degrade to the core columns if a column is absent.
    let res = await this.db
      .from("students")
      .select("id, enrolment_no, gr_no, roll_number, section, standard_id, batch_id, academic_year_id")
      .in("id", ids);
    if (res.error) {
      res = await this.db
        .from("students")
        .select("id, roll_number, standard_id, batch_id")
        .in("id", ids);
    }
    for (const r of (res.data as StudentRow[]) ?? []) map.set(r.id, r);
    return map;
  }

  /** Generic id→name lookup for a reference table. Degrades to empty on error. */
  private async fetchNames(
    table: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const { data, error } = await this.db
      .from(table)
      .select("id, name")
      .in("id", ids);
    if (error) return map;
    for (const r of (data as { id: string; name: string | null }[]) ?? []) {
      if (r.name) map.set(r.id, r.name);
    }
    return map;
  }

  /**
   * Import the supplied payments into Finance Income — idempotently. Already
   * imported payments are counted as `skipped`, never re-posted.
   */
  async importPayments(
    payments: CollectedPayment[],
    actor?: FinanceAuditActor,
  ): Promise<ImportResult> {
    const result = emptyImportResult();
    for (const p of payments) {
      try {
        const outcome = await financeSyncService.upsertIncomeFromFee(p, actor);
        if (outcome === "imported") result.imported += 1;
        else result.skipped += 1;
      } catch (err) {
        result.failed += 1;
        result.errors.push(
          `${p.receiptNo ?? p.studentName ?? p.id}: ${err instanceof Error ? err.message : "import failed"}`,
        );
      }
    }
    // Per-transaction audit rows are written by financeSyncService for each
    // imported payment (Phase 7) — no batch-level row needed.
    return result;
  }
}

export const feeCollectionImportService = new FeeCollectionImportService();
