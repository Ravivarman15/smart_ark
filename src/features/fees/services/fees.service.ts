import { BaseService, AppError } from "@/shared/services";
import { deriveFeeStatus, finalAmount, pendingBalance } from "../utils/calculations";
import type { CreateFeeRecordInput, FeeRecord, FeeStatus } from "../types/fee.types";

// ── DB row shapes (private) ──────────────────────────────────────────────────
// The system has TWO sources of truth historically:
//   - `fee_transactions` (legacy, single-row "did they pay?" model)
//   - `student_fees` (current, supports discount + partial + multi-installment)
// New writes target `student_fees` + `fee_installments` when a student_fees
// row exists; otherwise fall back to legacy. Reads merge both views so the
// UI sees a single coherent FeeRecord list.

type FeeTxnRow = {
  id: string;
  student_name: string | null;
  batch_name: string | null;
  amount: number | string | null;
  paid: boolean | null;
  paid_at: string | null;
  due_since: string | null;
  campuses: { name: string } | { name: string }[] | null;
};

type StudentFeeRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  batch_name: string | null;
  total_amount: number | string | null;
  discount_amount: number | string | null;
  amount_received: number | string | null;
  amount_pending: number | string | null;
  status: string | null;
  due_date: string | null;
  updated_at: string | null;
};

const pickJoin = <T extends { name: string }>(v: T | T[] | null): string =>
  Array.isArray(v) ? v[0]?.name ?? "" : v?.name ?? "";

const txnToDomain = (r: FeeTxnRow): FeeRecord => {
  const amount = Number(r.amount) || 0;
  return {
    id: r.id,
    student: r.student_name ?? "",
    batch: r.batch_name ?? "",
    campus: pickJoin(r.campuses) || undefined,
    amount,
    finalAmount: amount,
    discount: 0,
    received: 0,
    refund: 0,
    pending: amount,
    paid: !!r.paid,
    paidDate: r.paid_at ? r.paid_at.split("T")[0] : undefined,
    dueSince: r.due_since ?? undefined,
    taxEnabled: false,
    receiptNo: "",
    installments: [],
  };
};

const studentFeeToDomain = (r: StudentFeeRow): FeeRecord => {
  const gross = Number(r.total_amount) || 0;
  const discount = Number(r.discount_amount) || 0;
  const received = Number(r.amount_received) || 0;
  const pending = Number(r.amount_pending) || pendingBalance({ gross, discount, received });
  const status = (r.status as FeeStatus) || deriveFeeStatus({ pending, received, gross });
  return {
    id: r.id,
    studentId: r.student_id,
    student: r.student_name ?? "",
    batch: r.batch_name ?? "",
    amount: gross,
    finalAmount: finalAmount(gross, discount),
    discount,
    received,
    refund: 0,
    pending,
    paid: status === "paid",
    paidDate: r.updated_at ? r.updated_at.split("T")[0] : undefined,
    dueSince: r.due_date ?? undefined,
    installments: [],
    status,
  };
};

// ── Service ──────────────────────────────────────────────────────────────────
class FeesService extends BaseService {
  /**
   * List fee records — merged view from legacy fee_transactions + student_fees.
   * Returned shape matches the existing AppDataContext.FeeRecord so consumers
   * don't need to change.
   *
   * Order: student_fees first (current source), legacy fee_transactions last.
   */
  async list(): Promise<FeeRecord[]> {
    const [txns, sfs] = await Promise.all([
      this.db.from("fee_transactions").select("*, campuses(name)"),
      this.db
        .from("student_fees")
        .select("id, student_id, student_name, batch_name, total_amount, discount_amount, amount_received, amount_pending, status, due_date, updated_at"),
    ]);

    if (txns.error) throw AppError.fromSupabase(txns.error, "fee_transactions");
    if (sfs.error) throw AppError.fromSupabase(sfs.error, "student_fees");

    const txnRows = ((txns.data ?? []) as unknown as FeeTxnRow[]).map(txnToDomain);
    const sfRows = ((sfs.data ?? []) as unknown as StudentFeeRow[]).map(studentFeeToDomain);
    return [...sfRows, ...txnRows];
  }

  /**
   * Manually create a fee record. Most rows are created automatically when a
   * student is admitted, but admins occasionally enter ad-hoc fees.
   *
   * Currently writes to legacy `fee_transactions` to preserve the existing
   * AppDataContext.addFeeRecord behaviour. Bridge does the local-state update.
   */
  async create(input: CreateFeeRecordInput, enteredByProfileId?: string): Promise<{ id: string }> {
    const res = await this.db
      .from("fee_transactions")
      .insert({
        student_name: input.student,
        batch_name: input.batch,
        amount: input.amount,
        due_since: input.dueSince,
        paid: input.paid,
        entered_by: enteredByProfileId,
      } as never)
      .select("id")
      .single();
    const row = this.guard(res, "fee_transaction");
    return { id: (row as { id: string }).id };
  }

  /**
   * Mark a legacy fee_transactions row as paid. student_fees rows are
   * settled via `addInstallment` (which updates totals) — not this method.
   */
  async markPaid(id: string): Promise<void> {
    const { error } = await this.db
      .from("fee_transactions")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "fee_transactions.markPaid");
  }

  /**
   * Apply a discount to a student's fee.
   *
   * Lookup contract (preserved from AppDataContext):
   *   - First try `student_fees` keyed by student_id (the legacy callers
   *     pass the studentId here, which is why this works).
   *   - If absent, fall back to a legacy `fee_transactions` row update.
   *
   * Recomputes pending + status via the shared calculation utils — never
   * inline a `total - discount` again.
   */
  async applyDiscount(feeRefId: string, discount: number): Promise<{
    path: "student_fees" | "legacy_fee_transactions";
    pending?: number;
    status?: FeeStatus;
  }> {
    if (discount < 0) throw AppError.validation("Discount cannot be negative");

    const { data: sfRow, error: sfErr } = await this.db
      .from("student_fees")
      .select("id, total_amount, amount_received")
      .eq("student_id", feeRefId)
      .maybeSingle();
    if (sfErr) throw AppError.fromSupabase(sfErr, "student_fees lookup");

    if (sfRow) {
      const gross = Number(sfRow.total_amount) || 0;
      const received = Number(sfRow.amount_received) || 0;
      const pending = pendingBalance({ gross, discount, received });
      const status = deriveFeeStatus({ pending, received, gross });
      const upd = await this.db
        .from("student_fees")
        .update({
          discount_amount: discount,
          amount_pending: pending,
          status,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", sfRow.id);
      if (upd.error) throw AppError.fromSupabase(upd.error, "student_fees.discount");
      return { path: "student_fees", pending, status };
    }

    // Legacy fallback — fee_transactions has a discount column on older rows
    const legacy = await this.db
      .from("fee_transactions")
      .update({ discount } as never)
      .eq("id", feeRefId);
    if (legacy.error) throw AppError.fromSupabase(legacy.error, "fee_transactions.discount (legacy)");
    return { path: "legacy_fee_transactions" };
  }
}

export const feesService = new FeesService();
