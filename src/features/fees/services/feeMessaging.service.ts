import { BaseService, AppError } from "@/shared/services";
import { formatINR } from "../utils/format";

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

// WhatsApp template keys — kept here so the worker / AiSensy template config
// can be aligned with what the app enqueues.
export const FEE_WA_TEMPLATES = {
  receipt: "fee_receipt",
  due: "fee_due",
  overdue: "fee_overdue",
  installment: "fee_installment",
} as const;

export interface FeeMessageTarget {
  studentId?: string;
  studentName: string;
  phone?: string | null;
  amount: number;
  dueDate?: string;
  receiptNo?: string;
  pending?: number;
}

export interface QueuedFeeMessage {
  id: string;
  template: string;
  recipientName?: string;
  recipientPhone?: string;
  status: string;
  attempts: number;
  lastError?: string;
  contextType?: string;
  createdAt: string;
}

const rowToMsg = (r: Record<string, unknown>): QueuedFeeMessage => ({
  id: String(r.id),
  template: String(r.template ?? ""),
  recipientName: (r.recipient_name as string) ?? undefined,
  recipientPhone: (r.recipient_phone as string) ?? undefined,
  status: String(r.status ?? "queued"),
  attempts: Number(r.attempts ?? 0),
  lastError: (r.last_error as string) ?? undefined,
  contextType: (r.context_type as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

/**
 * WhatsApp / SMS automation for the Fee module.
 *
 * Architecture (identical contract to the Live Class messaging service):
 *   - The browser only ever WRITES rows to `message_queue`; provider tokens
 *     (AiSensy) stay server-side and are never bundled.
 *   - A Supabase Edge Function / cron worker drains `status='queued'` rows,
 *     POSTs them to AiSensy and writes back delivery state + retry counters.
 *   - Until that worker exists, the queue is a durable, auditable outbox.
 */
class FeeMessagingService extends BaseService {
  private async enqueue(
    rows: Record<string, unknown>[]
  ): Promise<{ queued: number; skipped: boolean }> {
    if (rows.length === 0) return { queued: 0, skipped: false };
    const res = await this.db.from("message_queue" as never).insert(rows as never);
    if (res.error) {
      if (tableMissing(res.error)) return { queued: 0, skipped: true };
      throw AppError.fromSupabase(res.error, "message_queue.insert");
    }
    return { queued: rows.length, skipped: false };
  }

  private row(template: string, contextType: string, t: FeeMessageTarget) {
    return {
      channel: "whatsapp",
      provider: "aisensy",
      template,
      recipient_name: t.studentName,
      recipient_phone: t.phone ?? null,
      recipient_student_id: t.studentId ?? null,
      payload: {
        student_name: t.studentName,
        amount: formatINR(t.amount),
        pending: formatINR(t.pending ?? 0),
        due_date: t.dueDate ?? "",
        receipt_no: t.receiptNo ?? "",
      },
      context_type: contextType,
      context_id: t.studentId ?? null,
      status: "queued",
    };
  }

  /** Queue a payment-receipt message after a successful collection. */
  async enqueueReceipt(t: FeeMessageTarget) {
    return this.enqueue([this.row(FEE_WA_TEMPLATES.receipt, "fee_receipt", t)]);
  }

  /** Queue a single fee-due reminder. */
  async enqueueDueReminder(t: FeeMessageTarget) {
    return this.enqueue([this.row(FEE_WA_TEMPLATES.due, "fee_due", t)]);
  }

  /**
   * Bulk reminders — used by the "Send Reminders" action on the collection
   * screen. Overdue targets get the overdue template, the rest a due reminder.
   */
  async enqueueBulkReminders(
    targets: (FeeMessageTarget & { overdue?: boolean })[]
  ): Promise<{ queued: number; skipped: boolean }> {
    const rows = targets.map((t) =>
      t.overdue
        ? this.row(FEE_WA_TEMPLATES.overdue, "fee_overdue", t)
        : this.row(FEE_WA_TEMPLATES.due, "fee_due", t)
    );
    return this.enqueue(rows);
  }

  /** Recent fee-related outbound messages — delivery tracking. */
  async listRecent(limit = 50): Promise<QueuedFeeMessage[]> {
    const res = await this.db
      .from("message_queue" as never)
      .select("*")
      .in("context_type", ["fee_receipt", "fee_due", "fee_overdue", "fee_installment"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "message_queue.list");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(rowToMsg);
  }

  /** Re-queue a failed fee message. */
  async retry(messageId: string): Promise<void> {
    const res = await this.db
      .from("message_queue" as never)
      .update({ status: "queued", last_error: null } as never)
      .eq("id", messageId);
    if (res.error && !tableMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "message_queue.retry");
    }
  }
}

export const feeMessagingService = new FeeMessagingService();
