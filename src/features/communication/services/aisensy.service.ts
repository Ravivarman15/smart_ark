// ──────────────────────────────────────────────────────────────────────────────
// AiSensy — Centralised WhatsApp provider engine.
//
// SECURITY ARCHITECTURE
// ─────────────────────
// AiSensy API keys and webhook secrets stay SERVER-SIDE only — they live in
// Supabase edge function secrets (AISENSY_API_KEY, AISENSY_CAMPAIGN_API,
// AISENSY_PROJECT_NAME, AISENSY_WEBHOOK_SECRET). The browser never sees them
// and the bundle never references them.
//
// Runtime contract
//   - Pages / hooks call `aisensyService.enqueue(...)` which writes a row to
//     `message_queue` with status='queued'. That is the ONLY thing the browser
//     does — no provider POST.
//   - A Supabase edge function ("send-aisensy") drains queued rows, posts to
//     AiSensy via process.env.AISENSY_*, writes back delivery state, retries
//     failures with exponential backoff and surfaces webhook updates.
//   - `dispatchViaEdge()` is an explicit nudge for "send now" buttons — it
//     invokes the same edge function (no secrets needed client-side; the edge
//     function authenticates server-to-server).
//
// Migration safety: every method degrades gracefully when `message_queue` or
// the edge function is missing.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import type {
  CommsChannel,
  CommsProvider,
  RecipientKind,
  QueueMessage,
  QueueStatus,
} from "../types/communication.types";
import type { RenderedMessage } from "../utils/whatsappTemplates";
import { safeInsert, safeInsertBatch } from "../utils/safeInsert";
import { validateEnqueue, dedupeKey, dropDuplicates, normalizePhone } from "../utils/commsValidation";

// FK-bearing columns on `message_queue`. Order matters — `created_by` is
// stripped first because it's the most common offender (auth uid vs profile id).
const MQ_FK_FIELDS = [
  "created_by",
  "template_id",
  "campaign_id",
  "recipient_student_id",
] as const;

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface EnqueueInput {
  channel?: CommsChannel;
  provider?: CommsProvider;
  rendered: RenderedMessage;
  campaignId?: string;
  templateId?: string;
  contextType?: string;
  contextId?: string;
  recipient: {
    kind?: RecipientKind;
    name?: string;
    phone?: string;
    studentId?: string;
  };
  scheduledAt?: string;
  createdBy?: string;
}

export interface InvalidEnqueue {
  reason: string;
  recipient?: string;
}

export interface EnqueueResult {
  queued: number;
  skipped: number;
  ids: string[];
  /** Recipients rejected by validation (bad/missing phone, unresolved vars). */
  invalid: InvalidEnqueue[];
}

const toQueueMessage = (r: Record<string, unknown>): QueueMessage => ({
  id: String(r.id),
  channel: (r.channel as CommsChannel) ?? "whatsapp",
  provider: (r.provider as CommsProvider) ?? "aisensy",
  template: String(r.template ?? ""),
  templateId: (r.template_id as string) ?? undefined,
  templateKey: (r.template_key as string) ?? undefined,
  language: (r.language as string) ?? "en",
  recipientKind: (r.recipient_kind as string) ?? undefined,
  recipientName: (r.recipient_name as string) ?? undefined,
  recipientPhone: (r.recipient_phone as string) ?? undefined,
  recipientStudentId: (r.recipient_student_id as string) ?? undefined,
  campaignId: (r.campaign_id as string) ?? undefined,
  payload: (r.payload as Record<string, unknown>) ?? {},
  contextType: (r.context_type as string) ?? undefined,
  contextId: (r.context_id as string) ?? undefined,
  status: ((r.status as string) ?? "queued") as QueueStatus,
  attempts: Number(r.attempts ?? 0),
  retryCount: Number(r.retry_count ?? 0),
  retryAt: (r.retry_at as string) ?? undefined,
  lastError: (r.last_error as string) ?? undefined,
  providerMessageId: (r.provider_message_id as string) ?? undefined,
  scheduledAt: (r.scheduled_at as string) ?? undefined,
  sentAt: (r.sent_at as string) ?? undefined,
  deliveredAt: (r.delivered_at as string) ?? undefined,
  readAt: (r.read_at as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

class AiSensyService extends BaseService {
  /** Single row writer — used internally by enqueue / enqueueBulk. */
  private buildRow(input: EnqueueInput): Record<string, unknown> {
    const r = input.rendered;
    return {
      channel: input.channel ?? "whatsapp",
      provider: input.provider ?? "aisensy",
      template: r.providerName ?? r.templateKey,
      template_id: input.templateId ?? null,
      template_key: r.templateKey,
      language: r.language,
      recipient_kind: input.recipient.kind ?? "student",
      recipient_name: input.recipient.name ?? null,
      recipient_phone: input.recipient.phone ? normalizePhone(input.recipient.phone) : null,
      recipient_student_id: input.recipient.studentId ?? null,
      campaign_id: input.campaignId ?? null,
      // Persist the fully-rendered body alongside the variables under a reserved
      // key so the queue drainer can dispatch the exact text and the UI can
      // preview it. `__body` is ignored by variable consumers.
      payload: { ...r.variables, __body: r.body },
      context_type: input.contextType ?? null,
      context_id: input.contextId ?? null,
      status: "queued",
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
      created_by: input.createdBy ?? null,
    };
  }

  /** Run a single input through validation; returns the failing reason or null. */
  private validate(input: EnqueueInput): InvalidEnqueue | null {
    const res = validateEnqueue({
      channel: input.channel ?? "whatsapp",
      rendered: input.rendered,
      recipient: input.recipient,
    });
    return res.ok ? null : { reason: res.reason ?? "invalid", recipient: input.recipient.name };
  }

  /** Queue a single message. Validates first — never queues an unsendable row. */
  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const bad = this.validate(input);
    if (bad) return { queued: 0, skipped: 1, ids: [], invalid: [bad] };

    const res = await safeInsert<{ id?: string }>(
      this.db,
      "message_queue",
      this.buildRow(input),
      [...MQ_FK_FIELDS],
      "id"
    );
    if (res.error) {
      if (isMissingTable(res.error)) return { queued: 0, skipped: 1, ids: [], invalid: [] };
      throw AppError.fromSupabase(res.error, "message_queue");
    }
    const id = res.data?.id;
    return { queued: 1, skipped: 0, ids: id ? [id] : [], invalid: [] };
  }

  /**
   * Bulk queue — used by campaign launches & every "Send X" page.
   * Pipeline: validate each → drop in-batch duplicates → insert the survivors.
   * Invalid recipients are reported (never silently "sent"); duplicates and
   * invalids both count toward `skipped`.
   */
  async enqueueBulk(inputs: EnqueueInput[]): Promise<EnqueueResult> {
    if (inputs.length === 0) return { queued: 0, skipped: 0, ids: [], invalid: [] };

    // 1. Validation gate.
    const invalid: InvalidEnqueue[] = [];
    const valid: EnqueueInput[] = [];
    for (const input of inputs) {
      const bad = this.validate(input);
      if (bad) invalid.push(bad);
      else valid.push(input);
    }

    // 2. De-duplicate within the batch (same template+phone+context).
    const { unique, dropped } = dropDuplicates(valid, (i) =>
      dedupeKey({
        templateKey: i.rendered.templateKey,
        phone: i.recipient.phone,
        contextType: i.contextType,
        contextId: i.contextId,
      })
    );

    const baseSkipped = invalid.length + dropped;
    if (unique.length === 0) {
      return { queued: 0, skipped: baseSkipped, ids: [], invalid };
    }

    const rows = unique.map((i) => this.buildRow(i));
    const res = await safeInsertBatch<{ id: string }>(
      this.db,
      "message_queue",
      rows,
      [...MQ_FK_FIELDS],
      "id"
    );
    if (res.error) {
      if (isMissingTable(res.error)) {
        return { queued: 0, skipped: inputs.length, ids: [], invalid };
      }
      throw AppError.fromSupabase(res.error, "message_queue.bulk");
    }
    const ids = (res.data ?? []).map((r) => r.id);
    return {
      queued: ids.length,
      skipped: baseSkipped + (unique.length - ids.length),
      ids,
      invalid,
    };
  }

  /** List recent queued messages with optional filters. */
  async listQueue(filters: {
    campaignId?: string;
    templateKey?: string;
    status?: QueueStatus | "all";
    limit?: number;
  } = {}): Promise<QueueMessage[]> {
    let q = this.db
      .from("message_queue" as never)
      .select(
        "id, channel, provider, template, template_id, template_key, language, recipient_kind, recipient_name, recipient_phone, recipient_student_id, campaign_id, payload, context_type, context_id, status, attempts, retry_count, retry_at, last_error, provider_message_id, scheduled_at, sent_at, delivered_at, read_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 100);
    if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
    if (filters.templateKey) q = q.eq("template_key", filters.templateKey);
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "message_queue.list");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toQueueMessage);
  }

  /** Re-queue a failed message. */
  async retry(messageId: string): Promise<void> {
    const res = await this.db
      .from("message_queue" as never)
      .update({
        status: "queued",
        last_error: null,
        retry_at: new Date().toISOString(),
      } as never)
      .eq("id", messageId);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "message_queue.retry");
    }
  }

  /** Cancel a pending message (only if still queued / processing). */
  async cancel(messageId: string): Promise<void> {
    const res = await this.db
      .from("message_queue" as never)
      .update({ status: "cancelled" } as never)
      .eq("id", messageId)
      .in("status", ["queued", "processing"]);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "message_queue.cancel");
    }
  }

  /**
   * Nudge the edge function to drain queued rows now. Webhook-ready: the
   * function is invoked server-to-server with the service role. If the edge
   * function isn't deployed yet this resolves silently — the queue still
   * drains on its own cron schedule.
   */
  async dispatchViaEdge(payload: { campaignId?: string; limit?: number } = {}): Promise<{
    dispatched: boolean;
    reason?: string;
  }> {
    try {
      const fn = (
        this.db as unknown as {
          functions?: {
            invoke: (
              name: string,
              opts?: { body?: unknown }
            ) => Promise<{ error?: { message?: string } | null }>;
          };
        }
      ).functions;
      if (!fn) return { dispatched: false, reason: "no-edge-runtime" };
      const res = await fn.invoke("send-aisensy", {
        body: { campaignId: payload.campaignId, limit: payload.limit ?? 50 },
      });
      if (res?.error) return { dispatched: false, reason: String(res.error.message ?? res.error) };
      return { dispatched: true };
    } catch (e) {
      return { dispatched: false, reason: (e as Error).message };
    }
  }
}

export const aisensyService = new AiSensyService();
