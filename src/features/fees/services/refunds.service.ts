import { BaseService, AppError } from "@/shared/services";
import { deriveFeeStatus, pendingBalance } from "../utils/calculations";

interface IssueRefundArgs {
  /** Student id (legacy contract — caller may pass studentId). */
  feeRefId: string;
  amount: number;
  reason?: string;
}

interface IssueRefundResult {
  newReceived: number;
  newPending: number;
  newStatus: "pending" | "partial" | "paid";
}

class RefundsService extends BaseService {
  /**
   * Issue a refund against a student_fees row. Mirrors AppDataContext.issueRefund:
   *   - decreases amount_received by the refund amount (clamped at 0)
   *   - recomputes amount_pending and status
   *
   * NOTE: there is currently no dedicated `refunds` audit table. When one
   * lands, log the entry from THIS method and nowhere else (services are
   * the only writer to financial DB state).
   */
  async issue(args: IssueRefundArgs): Promise<IssueRefundResult> {
    if (!(args.amount > 0)) throw AppError.validation("Refund amount must be greater than 0");

    const { data: sfRow, error: sfErr } = await this.db
      .from("student_fees")
      .select("id, amount_received, amount_pending, total_amount, discount_amount")
      .eq("student_id", args.feeRefId)
      .maybeSingle();
    if (sfErr) throw AppError.fromSupabase(sfErr, "student_fees lookup");

    if (!sfRow) {
      // No student_fees row → nothing to refund. Surface explicitly so the
      // caller can decide what to do (legacy fee_transactions don't model refunds).
      throw AppError.notFound("student_fees", args.feeRefId);
    }

    const gross = Number(sfRow.total_amount) || 0;
    const discount = Number(sfRow.discount_amount) || 0;
    const newReceived = Math.max(0, (Number(sfRow.amount_received) || 0) - args.amount);
    const newPending = pendingBalance({ gross, discount, received: newReceived });
    const newStatus = deriveFeeStatus({ pending: newPending, received: newReceived, gross });

    const upd = await this.db
      .from("student_fees")
      .update({
        amount_received: newReceived,
        amount_pending: newPending,
        status: newStatus,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", sfRow.id);
    if (upd.error) throw AppError.fromSupabase(upd.error, "student_fees.refund");

    return { newReceived, newPending, newStatus };
  }
}

export const refundsService = new RefundsService();
