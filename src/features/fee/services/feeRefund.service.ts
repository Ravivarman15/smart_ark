import { BaseService, AppError } from "@/shared/services";
import { toAmount } from "../utils/feeCalc";
import { studentFeeService } from "./studentFee.service";
import type { FeeRefund, IssueRefundInput } from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Fee refund service — issue + approve refunds with a full audit trail.
//
// A SETTLED refund (status 'completed' or 'approved') feeds back into the
// ledger: `studentFeeService.applyRefundAdjustment()` drops `amount_received`
// and raises the balance. A refund left 'pending_approval' has no ledger
// effect until an approver clears it — so money never moves without sign-off.
//
// MIGRATION SAFETY: `fee_refunds` ships in 20260521. Until then `list()`
// returns empty and `issue()` raises a clear "run the migration" message.
// ─────────────────────────────────────────────────────────────────────────────

type RefundRow = {
  id: string;
  student_fee_id: string | null;
  student_id: string | null;
  student_name: string | null;
  amount: number | null;
  reason: string | null;
  status: string | null;
  method: string | null;
  issued_by: string | null;
  created_at: string;
};

const MIGRATION_MSG =
  "Refunds need the fee module migration (20260521_live_classes_and_fee_module.sql). " +
  "Run it in the Supabase SQL editor, then retry.";

const isMissingTable = (err: unknown): boolean => {
  const m = (err as { message?: string } | null)?.message;
  return (
    !!m &&
    /relation .* does not exist|could not find the table|schema cache/i.test(m)
  );
};

const normaliseStatus = (s?: string | null): FeeRefund["status"] =>
  s === "pending_approval" || s === "approved" || s === "rejected"
    ? s
    : "completed";

const toDomain = (r: RefundRow): FeeRefund => ({
  id: r.id,
  studentFeeId: r.student_fee_id ?? undefined,
  studentId: r.student_id ?? undefined,
  studentName: r.student_name ?? undefined,
  amount: Number(r.amount ?? 0),
  reason: r.reason ?? undefined,
  status: normaliseStatus(r.status),
  method: r.method ?? undefined,
  issuedBy: r.issued_by ?? undefined,
  createdAt: r.created_at,
});

class FeeRefundService extends BaseService {
  /** Every refund, newest first. Empty when the table is not yet migrated. */
  async list(): Promise<FeeRefund[]> {
    const res = await this.db
      .from("fee_refunds")
      .select("*")
      .order("created_at", { ascending: false });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "fee_refunds");
    }
    return (res.data as unknown as RefundRow[]).map(toDomain);
  }

  /**
   * Issue a refund. `autoApprove` settles it immediately (status 'completed')
   * and adjusts the ledger; otherwise it is recorded as 'pending_approval'
   * with no ledger effect until approved.
   */
  async issue(input: IssueRefundInput): Promise<FeeRefund> {
    const amount = toAmount(input.amount);
    if (amount <= 0) throw AppError.validation("Enter a valid refund amount");
    if (!input.reason?.trim()) {
      throw AppError.validation("A refund reason is required");
    }

    // Guard: cannot refund more than the student has actually paid.
    const fee = await studentFeeService.getById(input.studentFeeId);
    if (amount > fee.amountReceived + 0.01) {
      throw AppError.validation(
        `Refund exceeds the amount received (₹${fee.amountReceived.toLocaleString("en-IN")})`,
      );
    }

    const settled = !!input.autoApprove;
    const { data, error } = await this.db
      .from("fee_refunds")
      .insert({
        student_fee_id: input.studentFeeId,
        student_id: input.studentId ?? fee.studentId ?? null,
        student_name: input.studentName ?? fee.studentName ?? null,
        amount,
        reason: input.reason.trim(),
        method: input.method ?? null,
        status: settled ? "completed" : "pending_approval",
        issued_by: input.issuedBy ?? null,
      } as never)
      .select("*")
      .single();
    if (error) {
      if (isMissingTable(error)) throw AppError.validation(MIGRATION_MSG);
      throw AppError.fromSupabase(error, "refund");
    }

    if (settled) {
      await studentFeeService.applyRefundAdjustment(input.studentFeeId, amount);
    }
    return toDomain(data as unknown as RefundRow);
  }

  /** Approve a pending refund — settles it and adjusts the ledger now. */
  async approve(refundId: string): Promise<void> {
    const { data, error } = await this.db
      .from("fee_refunds")
      .select("*")
      .eq("id", refundId)
      .maybeSingle();
    if (error) throw AppError.fromSupabase(error, "refund");
    if (!data) throw AppError.notFound("refund", refundId);
    const refund = toDomain(data as unknown as RefundRow);
    if (refund.status !== "pending_approval") {
      throw AppError.validation("Only a pending refund can be approved");
    }

    const { error: updErr } = await this.db
      .from("fee_refunds")
      .update({ status: "approved" } as never)
      .eq("id", refundId);
    if (updErr) throw AppError.fromSupabase(updErr, "refund");

    if (refund.studentFeeId) {
      await studentFeeService.applyRefundAdjustment(
        refund.studentFeeId,
        refund.amount,
      );
    }
  }

  /** Reject a pending refund — no money moves. */
  async reject(refundId: string): Promise<void> {
    const { error } = await this.db
      .from("fee_refunds")
      .update({ status: "rejected" } as never)
      .eq("id", refundId);
    if (error) throw AppError.fromSupabase(error, "refund");
  }
}

export const feeRefundService = new FeeRefundService();
