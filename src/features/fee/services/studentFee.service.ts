import { BaseService, AppError } from "@/shared/services";
import {
  buildSchedule,
  generateReceiptNo,
  modeById,
  recalcStudentFee,
  round2,
  toAmount,
} from "../utils/feeCalc";
import type {
  ApplyDiscountInput,
  CollectPaymentInput,
  FeeInstallment,
  PaymentResult,
  ScheduleInstallmentsInput,
  StudentFee,
  UpdateStudentFeeInput,
} from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Student fee service — the collection engine.
//
// Every mutation that touches money recalculates `amount_pending` + `status`
// through `recalcStudentFee()` (the centralised calc layer) so the ledger can
// never diverge. A payment is a two-row write (installment + fee balance); if
// the balance update fails the just-inserted installment is rolled back, so a
// failed collection never leaves the books half-written.
//
// MIGRATION SAFETY: the discount-approval columns (discount_status,
// discount_approved_by) and `notes` are treated as optional — writes strip them
// on a column error, so the engine runs unchanged on the pre-migration schema
// (where a discount simply applies immediately, the legacy behaviour).
// ─────────────────────────────────────────────────────────────────────────────

type FeeRow = {
  id: string;
  student_id: string;
  fee_structure_id: string | null;
  student_name: string | null;
  batch_name: string | null;
  total_amount: number | null;
  discount_amount: number | null;
  amount_received: number | null;
  amount_pending: number | null;
  seat_confirmation_amount: number | null;
  first_payment_amount: number | null;
  installment_count: number | null;
  due_date: string | null;
  status: string | null;
  discount_status?: string | null;
  discount_approved_by?: string | null;
  notes?: string | null;
  created_at: string;
};

type InstallmentRow = {
  id: string;
  student_fee_id: string;
  amount: number | null;
  payment_date: string;
  payment_method: string;
  receipt_no: string | null;
  notes: string | null;
  created_at: string;
};

/** Optional columns stripped from a write when the schema lacks them. */
const OPTIONAL_KEYS = ["discount_status", "discount_approved_by", "notes"];

const isColumnError = (err: unknown): boolean => {
  const m = (err as { message?: string } | null)?.message;
  return !!m && /column|schema cache|does not exist/i.test(m);
};

const normaliseStatus = (s?: string | null): StudentFee["status"] =>
  s === "paid" || s === "partial" || s === "pending" ? s : "pending";

const normaliseDiscountStatus = (
  s?: string | null,
): StudentFee["discountStatus"] =>
  s === "pending" || s === "rejected" ? s : "approved";

const toDomain = (r: FeeRow): StudentFee => ({
  id: r.id,
  studentId: r.student_id,
  feeStructureId: r.fee_structure_id ?? undefined,
  studentName: r.student_name ?? undefined,
  batchName: r.batch_name ?? undefined,
  totalAmount: Number(r.total_amount ?? 0),
  discountAmount: Number(r.discount_amount ?? 0),
  amountReceived: Number(r.amount_received ?? 0),
  amountPending: Number(r.amount_pending ?? 0),
  seatConfirmationAmount: Number(r.seat_confirmation_amount ?? 0),
  firstPaymentAmount: Number(r.first_payment_amount ?? 0),
  installmentCount: Number(r.installment_count ?? 0),
  dueDate: r.due_date ?? undefined,
  status: normaliseStatus(r.status),
  discountStatus: normaliseDiscountStatus(r.discount_status),
  discountApprovedBy: r.discount_approved_by ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

/** Discount that is actually deducted today — a pending one counts as 0. */
const effectiveDiscount = (r: FeeRow): number =>
  normaliseDiscountStatus(r.discount_status) === "approved"
    ? Number(r.discount_amount ?? 0)
    : 0;

const stripOptional = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const clean = { ...payload };
  for (const k of OPTIONAL_KEYS) delete clean[k];
  return clean;
};

interface ListParams {
  /** Exclude fully-paid records (the collection view). */
  unpaidOnly?: boolean;
}

class StudentFeeService extends BaseService {
  /** List student fee records, newest first. */
  async list(params: ListParams = {}): Promise<StudentFee[]> {
    let q = this.db.from("student_fees").select("*");
    if (params.unpaidOnly) q = q.neq("status", "paid");
    const res = await q.order("created_at", { ascending: false });
    const rows = this.guardList(res, "student_fees");
    return (rows as unknown as FeeRow[]).map(toDomain);
  }

  /** Fetch one fee record. */
  async getById(id: string): Promise<StudentFee> {
    const res = await this.db
      .from("student_fees")
      .select("*")
      .eq("id", id)
      .single();
    return toDomain(this.guard(res, "student fee") as unknown as FeeRow);
  }

  /** Raw row fetch — internal use, throws if missing. */
  private async fetchRow(id: string): Promise<FeeRow> {
    const { data, error } = await this.db
      .from("student_fees")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw AppError.fromSupabase(error, "student fee");
    if (!data) throw AppError.notFound("student fee", id);
    return data as unknown as FeeRow;
  }

  /** Patch a fee row, stripping optional columns if the schema lacks them. */
  private async patchRow(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let res = await this.db
      .from("student_fees")
      .update(payload as never)
      .eq("id", id);
    if (res.error && isColumnError(res.error)) {
      res = await this.db
        .from("student_fees")
        .update(stripOptional(payload) as never)
        .eq("id", id);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "student fee");
  }

  /** Payment + scheduled installments for one fee, newest first. */
  async listInstallments(studentFeeId: string): Promise<FeeInstallment[]> {
    const res = await this.db
      .from("fee_installments")
      .select("*")
      .eq("student_fee_id", studentFeeId)
      .order("payment_date", { ascending: false });
    const rows = this.guardList(res, "fee_installments");
    return (rows as unknown as InstallmentRow[]).map((r) => ({
      id: r.id,
      studentFeeId: r.student_fee_id,
      amount: Number(r.amount ?? 0),
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      receiptNo: r.receipt_no ?? undefined,
      notes: r.notes ?? undefined,
      createdAt: r.created_at,
      scheduled: r.payment_method === "Scheduled",
    }));
  }

  /**
   * Record a payment. Inserts the installment, then updates the fee balance;
   * if the balance update fails the installment is rolled back so the books
   * are never left half-written.
   */
  async collectPayment(input: CollectPaymentInput): Promise<PaymentResult> {
    const amount = toAmount(input.amount);
    if (amount <= 0) throw AppError.validation("Enter a valid payment amount");

    const row = await this.fetchRow(input.studentFeeId);
    const pending = Number(row.amount_pending ?? 0);
    if (amount > pending + 0.01) {
      throw AppError.validation(
        `Payment exceeds the pending balance of ₹${pending.toLocaleString("en-IN")}`,
      );
    }

    const receiptNo = generateReceiptNo();
    const today = new Date().toISOString().slice(0, 10);

    const { data: inst, error: instErr } = await this.db
      .from("fee_installments")
      .insert({
        student_fee_id: input.studentFeeId,
        amount,
        payment_date: today,
        payment_method: input.method || "Cash",
        receipt_no: receiptNo,
        notes: input.notes || null,
        created_by: input.createdBy || null,
      } as never)
      .select("id")
      .single();
    if (instErr) throw AppError.fromSupabase(instErr, "payment");
    const installmentId = (inst as { id: string } | null)?.id ?? null;

    const amountReceived = round2(Number(row.amount_received ?? 0) + amount);
    const { amountPending, status } = recalcStudentFee({
      totalAmount: Number(row.total_amount ?? 0),
      discountAmount: effectiveDiscount(row),
      amountReceived,
    });

    try {
      await this.patchRow(input.studentFeeId, {
        amount_received: amountReceived,
        amount_pending: amountPending,
        status,
      });
    } catch (err) {
      // Compensating action — undo the installment so a retry can't double-book.
      if (installmentId) {
        await this.db
          .from("fee_installments")
          .delete()
          .eq("id", installmentId);
      }
      throw err;
    }

    return { receiptNo, amount, amountReceived, amountPending, status };
  }

  /**
   * Apply a discount. When `autoApprove` is false the discount is stored but
   * marked pending — the balance is NOT reduced until an approver clears it.
   * On the pre-migration schema (no discount_status column) the discount
   * applies immediately, matching the legacy behaviour.
   */
  async applyDiscount(input: ApplyDiscountInput): Promise<void> {
    const discount = toAmount(input.discountAmount);
    const row = await this.fetchRow(input.studentFeeId);
    if (discount > Number(row.total_amount ?? 0)) {
      throw AppError.validation("Discount cannot exceed the total fee");
    }
    const approve = !!input.autoApprove;
    const { amountPending, status } = recalcStudentFee({
      totalAmount: Number(row.total_amount ?? 0),
      discountAmount: approve ? discount : 0,
      amountReceived: Number(row.amount_received ?? 0),
    });

    try {
      // Full write — with the approval-workflow columns.
      let res = await this.db
        .from("student_fees")
        .update({
          discount_amount: discount,
          discount_status: approve ? "approved" : "pending",
          discount_approved_by: approve ? input.approverId ?? null : null,
          amount_pending: amountPending,
          status,
        } as never)
        .eq("id", input.studentFeeId);
      if (res.error && isColumnError(res.error)) {
        // No approval workflow on this schema — apply the discount directly.
        const legacy = recalcStudentFee({
          totalAmount: Number(row.total_amount ?? 0),
          discountAmount: discount,
          amountReceived: Number(row.amount_received ?? 0),
        });
        res = await this.db
          .from("student_fees")
          .update({
            discount_amount: discount,
            amount_pending: legacy.amountPending,
            status: legacy.status,
          } as never)
          .eq("id", input.studentFeeId);
      }
      if (res.error) throw AppError.fromSupabase(res.error, "discount");
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.validation("Failed to apply discount");
    }
  }

  /** Approve a pending discount — the balance is reduced now. */
  async approveDiscount(
    studentFeeId: string,
    approverId?: string,
  ): Promise<void> {
    const row = await this.fetchRow(studentFeeId);
    const { amountPending, status } = recalcStudentFee({
      totalAmount: Number(row.total_amount ?? 0),
      discountAmount: Number(row.discount_amount ?? 0),
      amountReceived: Number(row.amount_received ?? 0),
    });
    await this.patchRow(studentFeeId, {
      discount_status: "approved",
      discount_approved_by: approverId ?? null,
      amount_pending: amountPending,
      status,
    });
  }

  /** Reject a pending discount — it is cleared and the balance restored. */
  async rejectDiscount(studentFeeId: string): Promise<void> {
    const row = await this.fetchRow(studentFeeId);
    const { amountPending, status } = recalcStudentFee({
      totalAmount: Number(row.total_amount ?? 0),
      discountAmount: 0,
      amountReceived: Number(row.amount_received ?? 0),
    });
    await this.patchRow(studentFeeId, {
      discount_amount: 0,
      discount_status: "rejected",
      discount_approved_by: null,
      amount_pending: amountPending,
      status,
    });
  }

  /** Edit the headline figures of a fee record and recalculate the balance. */
  async updateRecord(
    id: string,
    input: UpdateStudentFeeInput,
  ): Promise<void> {
    const row = await this.fetchRow(id);
    const payload: Record<string, unknown> = {};
    if (input.totalAmount !== undefined)
      payload.total_amount = toAmount(input.totalAmount);
    if (input.seatConfirmationAmount !== undefined)
      payload.seat_confirmation_amount = toAmount(input.seatConfirmationAmount);
    if (input.firstPaymentAmount !== undefined)
      payload.first_payment_amount = toAmount(input.firstPaymentAmount);
    if (input.installmentCount !== undefined)
      payload.installment_count = Math.max(0, Math.floor(input.installmentCount));
    if (input.notes !== undefined) payload.notes = input.notes || null;

    const total =
      input.totalAmount !== undefined
        ? toAmount(input.totalAmount)
        : Number(row.total_amount ?? 0);
    const { amountPending, status } = recalcStudentFee({
      totalAmount: total,
      discountAmount: effectiveDiscount(row),
      amountReceived: Number(row.amount_received ?? 0),
    });
    payload.amount_pending = amountPending;
    payload.status = status;

    await this.patchRow(id, payload);
  }

  /** Set (or change) the next due date. */
  async setDueDate(id: string, dueDate: string): Promise<void> {
    await this.patchRow(id, { due_date: dueDate || null });
  }

  /**
   * Replace the installment plan: clear existing "Scheduled" rows, write a
   * fresh dated schedule for the pending balance, and stamp the first due
   * date on the fee. Returns the number of installments created.
   */
  async scheduleInstallments(
    input: ScheduleInstallmentsInput,
  ): Promise<number> {
    const row = await this.fetchRow(input.studentFeeId);
    const pending = Number(row.amount_pending ?? 0);
    const schedule = buildSchedule(
      pending,
      Math.max(1, Math.floor(input.count)),
      new Date(`${input.startDate}T00:00:00`),
      modeById(input.modeId),
    );
    if (schedule.length === 0) {
      throw AppError.validation("Nothing to schedule — the balance is clear");
    }

    // Drop any prior unpaid plan so re-scheduling never stacks.
    await this.db
      .from("fee_installments")
      .delete()
      .eq("student_fee_id", input.studentFeeId)
      .eq("payment_method", "Scheduled");

    const rows = schedule.map((s, i) => ({
      student_fee_id: input.studentFeeId,
      amount: s.amount,
      payment_date: s.date.toISOString().slice(0, 10),
      payment_method: "Scheduled",
      notes: `Installment ${i + 1} of ${schedule.length}`,
      created_by: input.createdBy || null,
    }));
    const { error: insErr } = await this.db
      .from("fee_installments")
      .insert(rows as never);
    if (insErr) throw AppError.fromSupabase(insErr, "installment schedule");

    await this.patchRow(input.studentFeeId, {
      installment_count: schedule.length,
      due_date: rows[0].payment_date,
    });
    return schedule.length;
  }

  /**
   * Apply a settled refund to the ledger: money leaves, so `amount_received`
   * drops and the balance rises. Called by the refund service — keeps all
   * student-fee arithmetic inside this one engine.
   */
  async applyRefundAdjustment(
    studentFeeId: string,
    refundAmount: number,
  ): Promise<void> {
    const row = await this.fetchRow(studentFeeId);
    const amountReceived = round2(
      Math.max(0, Number(row.amount_received ?? 0) - toAmount(refundAmount)),
    );
    const { amountPending, status } = recalcStudentFee({
      totalAmount: Number(row.total_amount ?? 0),
      discountAmount: effectiveDiscount(row),
      amountReceived,
    });
    await this.patchRow(studentFeeId, {
      amount_received: amountReceived,
      amount_pending: amountPending,
      status,
    });
  }
}

export const studentFeeService = new StudentFeeService();
