import { BaseService, AppError } from "@/shared/services";
import { deriveFeeStatus, pendingBalance } from "../utils/calculations";
import type { FeeRefundRecord } from "../types/fee.types";

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

interface IssueRefundArgs {
  /** Student id (legacy contract — caller may pass studentId). */
  feeRefId: string;
  amount: number;
  reason?: string;
  method?: string;
  issuedByProfileId?: string;
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
   *   - writes an immutable row to fee_refunds (audit trail) — best-effort
   *
   * Services are the ONLY writer to financial DB state.
   */
  async issue(args: IssueRefundArgs): Promise<IssueRefundResult> {
    if (!(args.amount > 0)) throw AppError.validation("Refund amount must be greater than 0");

    const { data: sfRow, error: sfErr } = await this.db
      .from("student_fees")
      .select("id, student_id, student_name, amount_received, amount_pending, total_amount, discount_amount")
      .eq("student_id", args.feeRefId)
      .maybeSingle();
    if (sfErr) throw AppError.fromSupabase(sfErr, "student_fees lookup");
    if (!sfRow) throw AppError.notFound("student_fees", args.feeRefId);

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

    // Audit row — never block the refund if the table is absent.
    const audit = await this.db.from("fee_refunds" as never).insert({
      student_fee_id: sfRow.id,
      student_id: (sfRow as { student_id?: string }).student_id ?? null,
      student_name: (sfRow as { student_name?: string }).student_name ?? null,
      amount: args.amount,
      reason: args.reason ?? null,
      method: args.method ?? null,
      status: "completed",
      issued_by: args.issuedByProfileId ?? null,
    } as never);
    if (audit.error && !tableMissing(audit.error)) {
      throw AppError.fromSupabase(audit.error, "fee_refunds.insert");
    }

    return { newReceived, newPending, newStatus };
  }

  /** Refund audit log (newest first). Empty pre-migration. */
  async list(): Promise<FeeRefundRecord[]> {
    const res = await this.db
      .from("fee_refunds" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "fee_refunds.list");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      studentFeeId: (r.student_fee_id as string) ?? undefined,
      studentId: (r.student_id as string) ?? undefined,
      studentName: (r.student_name as string) ?? undefined,
      amount: Number(r.amount) || 0,
      reason: (r.reason as string) ?? undefined,
      status: (r.status as FeeRefundRecord["status"]) ?? "completed",
      method: (r.method as string) ?? undefined,
      createdAt: String(r.created_at),
    }));
  }
}

export const refundsService = new RefundsService();
