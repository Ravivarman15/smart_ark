import { BaseService, AppError } from "@/shared/services";
import { isOverdue } from "../utils/feeCalc";
import type { StudentFee } from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Fee reminder architecture (WhatsApp / SMS).
//
// Reminders are not sent inline — they are QUEUED into `message_queue`, the
// shared outbox a worker / edge function drains and posts to the provider
// (AiSensy). Until that worker exists the rows accumulate as an auditable
// outbox: nothing is lost, nothing is sent twice, and the UI stays instant.
//
// This service owns only the enqueue side. MIGRATION SAFETY: `message_queue`
// ships in 20260521 — when absent, queueing is a no-op that reports "skipped"
// rather than failing the caller.
// ─────────────────────────────────────────────────────────────────────────────

export type FeeReminderKind = "fee_due" | "fee_overdue";

export interface QueuedFeeMessage {
  id: string;
  template: string;
  recipientName?: string;
  status: string;
  contextId?: string;
  createdAt: string;
}

export interface QueueResult {
  queued: number;
  skipped: number;
}

type QueueRow = {
  id: string;
  template: string;
  recipient_name: string | null;
  status: string;
  context_id: string | null;
  created_at: string;
};

const isMissingTable = (err: unknown): boolean => {
  const m = (err as { message?: string } | null)?.message;
  return (
    !!m &&
    /relation .* does not exist|could not find the table|schema cache/i.test(m)
  );
};

class FeeReminderService extends BaseService {
  /** Build the message_queue row for one fee reminder. */
  private buildRow(
    fee: StudentFee,
    kind: FeeReminderKind,
    createdBy?: string,
  ): Record<string, unknown> {
    return {
      channel: "whatsapp",
      provider: "aisensy",
      template: kind,
      recipient_name: fee.studentName ?? null,
      recipient_student_id: fee.studentId,
      payload: {
        student_name: fee.studentName ?? "",
        batch_name: fee.batchName ?? "",
        amount_pending: fee.amountPending,
        due_date: fee.dueDate ?? null,
      },
      context_type: kind,
      context_id: fee.id,
      status: "queued",
      created_by: createdBy ?? null,
    };
  }

  /** Queue a single reminder. Returns "queued" or "skipped" (no outbox table). */
  async queueReminder(
    fee: StudentFee,
    kind: FeeReminderKind,
    createdBy?: string,
  ): Promise<"queued" | "skipped"> {
    const { error } = await this.db
      .from("message_queue")
      .insert(this.buildRow(fee, kind, createdBy) as never);
    if (error) {
      if (isMissingTable(error)) return "skipped";
      throw AppError.fromSupabase(error, "message_queue");
    }
    return "queued";
  }

  /**
   * Bulk-queue reminders for a set of fees. Each fee is classified as overdue
   * (past due date, balance owing) or simply due. Fully-paid fees are ignored.
   */
  async queueDueReminders(
    fees: StudentFee[],
    createdBy?: string,
  ): Promise<QueueResult> {
    const targets = fees.filter((f) => f.amountPending > 0);
    if (targets.length === 0) return { queued: 0, skipped: 0 };

    const rows = targets.map((f) =>
      this.buildRow(
        f,
        isOverdue(f.dueDate, f.amountPending) ? "fee_overdue" : "fee_due",
        createdBy,
      ),
    );
    const { error } = await this.db
      .from("message_queue")
      .insert(rows as never);
    if (error) {
      if (isMissingTable(error)) return { queued: 0, skipped: targets.length };
      throw AppError.fromSupabase(error, "message_queue");
    }
    return { queued: targets.length, skipped: 0 };
  }

  /** Recently queued fee reminders, for an outbox view. Empty if no table. */
  async listQueued(limit = 50): Promise<QueuedFeeMessage[]> {
    const res = await this.db
      .from("message_queue")
      .select("id, template, recipient_name, status, context_id, created_at")
      .in("context_type", ["fee_due", "fee_overdue"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "message_queue");
    }
    return (res.data as unknown as QueueRow[]).map((r) => ({
      id: r.id,
      template: r.template,
      recipientName: r.recipient_name ?? undefined,
      status: r.status,
      contextId: r.context_id ?? undefined,
      createdAt: r.created_at,
    }));
  }
}

export const feeReminderService = new FeeReminderService();
