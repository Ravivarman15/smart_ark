import { BaseService, AppError } from "@/shared/services";
import { deriveFeeStatus, generateReceiptNumber, pendingBalance } from "../utils/calculations";
import type { Installment } from "../types/fee.types";

type InstallmentRow = {
  id: string;
  amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  receipt_no: string | null;
  notes: string | null;
};

const toDomain = (r: InstallmentRow): Installment => ({
  id: r.id,
  amount: Number(r.amount) || 0,
  date: r.payment_date ?? "",
  receiptNo: r.receipt_no ?? "",
  method: r.payment_method ?? "Cash",
  notes: r.notes ?? undefined,
});

interface AddInstallmentArgs {
  /** Pass the student id (legacy AppDataContext contract) or the student_fee_id. */
  feeRefId: string;
  amount: number;
  method: string;
  notes?: string;
  createdByProfileId?: string;
}

interface AddInstallmentResult {
  /** Result of the operation: which path actually persisted the payment. */
  path: "student_fees" | "legacy_fee_transactions" | "none";
  installmentId?: string;
  receiptNo: string;
  newReceived?: number;
  newPending?: number;
  newStatus?: "pending" | "partial" | "paid";
}

class InstallmentsService extends BaseService {
  /**
   * List installments for a given student_fees row.
   * Returned ordered oldest → newest so UI can build a chronological ledger.
   */
  async listForFee(studentFeeId: string): Promise<Installment[]> {
    const res = await this.db
      .from("fee_installments")
      .select("id, amount, payment_date, payment_method, receipt_no, notes")
      .eq("student_fee_id", studentFeeId)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true });
    const rows = this.guardList(res, "fee_installments");
    return (rows as unknown as InstallmentRow[]).map(toDomain);
  }

  /**
   * Record a payment. Mirrors AppDataContext.addInstallment exactly:
   *   1. Look up student_fees by student_id (legacy contract — caller may pass studentId)
   *   2. If found: insert into fee_installments + recompute totals on student_fees
   *   3. Else: update legacy fee_transactions (paid=true)
   *
   * Always throws on DB error — money workflows must fail loudly.
   */
  async add(args: AddInstallmentArgs): Promise<AddInstallmentResult> {
    if (!(args.amount > 0)) throw AppError.validation("Installment amount must be greater than 0");

    const receiptNo = generateReceiptNumber();
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Resolve target student_fees row. Caller historically passes the
    // student id, so we look up by that.
    const { data: sfRow, error: sfErr } = await this.db
      .from("student_fees")
      .select("id, total_amount, discount_amount, amount_received, amount_pending")
      .eq("student_id", args.feeRefId)
      .maybeSingle();

    if (sfErr) throw AppError.fromSupabase(sfErr, "student_fees lookup");

    if (sfRow) {
      const inst = await this.db
        .from("fee_installments")
        .insert({
          student_fee_id: sfRow.id,
          amount: args.amount,
          payment_date: dateStr,
          payment_method: args.method,
          receipt_no: receiptNo,
          notes: args.notes ?? null,
          created_by: args.createdByProfileId ?? null,
        } as never)
        .select("id")
        .single();
      if (inst.error) throw AppError.fromSupabase(inst.error, "fee_installments.insert");

      const gross = Number(sfRow.total_amount) || 0;
      const discount = Number(sfRow.discount_amount) || 0;
      const received = (Number(sfRow.amount_received) || 0) + args.amount;
      const pending = pendingBalance({ gross, discount, received });
      const status = deriveFeeStatus({ pending, received, gross });

      const upd = await this.db
        .from("student_fees")
        .update({
          amount_received: received,
          amount_pending: pending,
          status,
          updated_at: now.toISOString(),
        } as never)
        .eq("id", sfRow.id);
      if (upd.error) {
        // Payment was recorded but balance is stale — surface loudly.
        throw new AppError(
          "Unknown",
          "Payment recorded but balance update failed — please refresh and verify.",
          upd.error
        );
      }

      return {
        path: "student_fees",
        installmentId: (inst.data as { id: string }).id,
        receiptNo,
        newReceived: received,
        newPending: pending,
        newStatus: status,
      };
    }

    // Legacy fallback
    const legacy = await this.db
      .from("fee_transactions")
      .update({ paid: true, paid_at: now.toISOString() })
      .eq("id", args.feeRefId);
    if (legacy.error) throw AppError.fromSupabase(legacy.error, "fee_transactions.update (legacy)");

    return { path: "legacy_fee_transactions", receiptNo };
  }
}

export const installmentsService = new InstallmentsService();
