import { BaseService, AppError } from "@/shared/services";
import { WA_TEMPLATES } from "../utils/constants";
import { formatClassDate, formatTimeRange } from "../utils/helpers";
import { PLATFORM_META } from "../utils/constants";
import type { LiveClass, QueuedMessage } from "../types/liveClass.types";

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface MessageRecipient {
  studentId: string;
  name: string;
  phone?: string | null;
}

const rowToQueued = (r: Record<string, unknown>): QueuedMessage => ({
  id: String(r.id),
  channel: String(r.channel ?? "whatsapp"),
  template: String(r.template ?? ""),
  recipientName: (r.recipient_name as string) ?? undefined,
  recipientPhone: (r.recipient_phone as string) ?? undefined,
  status: (r.status as QueuedMessage["status"]) ?? "queued",
  attempts: Number(r.attempts ?? 0),
  lastError: (r.last_error as string) ?? undefined,
  contextType: (r.context_type as string) ?? undefined,
  contextId: (r.context_id as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
  sentAt: (r.sent_at as string) ?? undefined,
});

/**
 * WhatsApp / SMS automation for the Live Class module.
 *
 * Architecture — built for AiSensy, deliberately decoupled from it:
 *   1. This service only ever WRITES rows to `message_queue`. It never calls
 *      an external API directly from the browser (provider tokens must stay
 *      server-side — never shipped in the bundle).
 *   2. A Supabase Edge Function / cron worker (not part of this build) drains
 *      `status = 'queued'` rows, POSTs them to AiSensy, then writes back
 *      `sent` / `delivered` / `failed` + `provider_message_id`.
 *   3. `attempts` + `last_error` give the worker a retry budget; `retry()`
 *      here re-queues a failed row for the next worker pass.
 *
 * Until the worker exists the queue is a durable, auditable outbox — class
 * creation never fails because messaging is unavailable.
 */
class LiveClassMessagingService extends BaseService {
  /** Build the template variables a provider template will interpolate. */
  private buildPayload(lc: LiveClass) {
    return {
      class_title: lc.title,
      subject: lc.subjectName ?? "",
      teacher_name: lc.teacherName ?? "",
      date: formatClassDate(lc.startDate),
      time: formatTimeRange(lc.startTime, lc.endTime),
      platform: PLATFORM_META[lc.platform]?.label ?? lc.platform,
      meeting_link: lc.meetingLink ?? "",
      meeting_password: lc.meetingPassword ?? "",
      reminder: "Please join 5 minutes early. Keep your mic muted on entry.",
    };
  }

  /**
   * Queue an outbound WhatsApp message for every assigned student.
   * Returns `{ skipped: true }` when the queue table is absent (pre-migration)
   * so the caller (class creation) still succeeds.
   */
  async enqueueClassNotification(args: {
    liveClass: LiveClass;
    recipients: MessageRecipient[];
    template?: string;
    createdByProfileId?: string;
  }): Promise<{ queued: number; skipped: boolean }> {
    const { liveClass, recipients, template = WA_TEMPLATES.liveClassScheduled } = args;
    if (recipients.length === 0) return { queued: 0, skipped: false };

    const payload = this.buildPayload(liveClass);
    const rows = recipients.map((r) => ({
      channel: "whatsapp",
      provider: "aisensy",
      template,
      recipient_name: r.name,
      recipient_phone: r.phone ?? null,
      recipient_student_id: r.studentId,
      payload,
      context_type: "live_class",
      context_id: liveClass.id,
      status: "queued",
      created_by: args.createdByProfileId ?? null,
    }));

    const res = await this.db.from("message_queue" as never).insert(rows as never);
    if (res.error) {
      if (tableMissing(res.error)) return { queued: 0, skipped: true };
      throw AppError.fromSupabase(res.error, "message_queue.insert");
    }
    return { queued: rows.length, skipped: false };
  }

  /** Delivery log for a live class. Empty when the table is absent. */
  async listForClass(liveClassId: string): Promise<QueuedMessage[]> {
    const res = await this.db
      .from("message_queue" as never)
      .select("*")
      .eq("context_type", "live_class")
      .eq("context_id", liveClassId)
      .order("created_at", { ascending: false });
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "message_queue.list");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(rowToQueued);
  }

  /** Re-queue a failed message for the next worker pass. */
  async retry(messageId: string): Promise<void> {
    const res = await this.db
      .from("message_queue" as never)
      .update({ status: "queued", last_error: null } as never)
      .eq("id", messageId);
    if (res.error && !tableMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "message_queue.retry");
    }
  }

  /** Cancel still-queued messages for a class (used when a class is cancelled). */
  async cancelPending(liveClassId: string): Promise<void> {
    const res = await this.db
      .from("message_queue" as never)
      .update({ status: "cancelled" } as never)
      .eq("context_type", "live_class")
      .eq("context_id", liveClassId)
      .eq("status", "queued");
    if (res.error && !tableMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "message_queue.cancel");
    }
  }
}

export const liveClassMessagingService = new LiveClassMessagingService();
