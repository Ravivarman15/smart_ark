// ──────────────────────────────────────────────────────────────────────────────
// Communication timeline — READ-ONLY per-recipient message history.
//
// Reads the existing `message_queue` (the authoritative per-person record:
// recipient_student_id / recipient_phone + status + sent/delivered/read + retry).
// No new table, no writes. Degrades to [] pre-migration.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { normalizePhone } from "../utils/commsValidation";
import type { TimelineEntry } from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  created_at: string;
  channel: string | null;
  provider: string | null;
  template: string | null;
  template_key: string | null;
  context_type: string | null;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  retry_count: number | null;
  last_error: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
};

const toEntry = (r: DbRow): TimelineEntry => ({
  id: r.id,
  createdAt: r.created_at,
  channel: r.channel ?? "whatsapp",
  template: r.template_key ?? r.template ?? "",
  provider: r.provider ?? "aisensy",
  context: r.context_type ?? undefined,
  status: r.status ?? "queued",
  sentAt: r.sent_at ?? undefined,
  deliveredAt: r.delivered_at ?? undefined,
  readAt: r.read_at ?? undefined,
  retryCount: Number(r.retry_count ?? 0),
  lastError: r.last_error ?? undefined,
  recipientName: r.recipient_name ?? undefined,
  recipientPhone: r.recipient_phone ?? undefined,
});

const SELECT =
  "id, created_at, channel, provider, template, template_key, context_type, status, sent_at, delivered_at, read_at, retry_count, last_error, recipient_name, recipient_phone";

class CommsTimelineService extends BaseService {
  /**
   * Message history for one recipient — by student id and/or phone. When both
   * are given, results are merged (a parent may be reached by either key).
   */
  async forRecipient(
    target: { studentId?: string; phone?: string },
    limit = 100,
  ): Promise<TimelineEntry[]> {
    const merged = new Map<string, TimelineEntry>();

    const run = async (column: "recipient_student_id" | "recipient_phone", value: string) => {
      const res = await this.db
        .from("message_queue" as never)
        .select(SELECT)
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (res.error) {
        if (isMissingTable(res.error)) return;
        throw AppError.fromSupabase(res.error, "message_queue.timeline");
      }
      for (const r of (res.data as unknown as DbRow[]) ?? []) merged.set(r.id, toEntry(r));
    };

    if (target.studentId) await run("recipient_student_id", target.studentId);
    if (target.phone) await run("recipient_phone", normalizePhone(target.phone));

    return Array.from(merged.values())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }
}

export const commsTimelineService = new CommsTimelineService();
