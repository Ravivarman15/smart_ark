// ──────────────────────────────────────────────────────────────────────────────
// Communication HEALTH / DIAGNOSTICS service.
//
// NOT a second communication engine — it sends nothing of its own. It READS the
// existing backbone (message_queue, comms_templates, lead_whatsapp_logs) for a
// live health snapshot and RUNS real probes against the EXISTING edge functions
// (send-aisensy debug mode, send-email) so Management can prove the pipeline
// end-to-end. Reuses aisensyService / commsAnalyticsService / commsTemplatesService.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { aisensyService } from "./aisensy.service";
import { commsAnalyticsService } from "./commsAnalytics.service";
import { commsTemplatesService } from "./commsTemplates.service";
import { planAfterFailure, MAX_RETRIES, BACKOFF_MINUTES } from "../utils/retryPolicy";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface CommsHealthSnapshot {
  // Queue lifecycle counts (reused from analytics overview).
  queued: number;
  processing: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  total: number;
  deliveryRate: number;
  failureRate: number;
  // Diagnostics.
  retrying: number;
  templateCount: number;
  latestWhatsappAt: string | null;
  latestFailedAt: string | null;
  latestFailedError: string | null;
  avgDeliveryMs: number | null;
  // Whether the underlying tables responded at all (false ⇒ migrations missing).
  queueReachable: boolean;
}

export interface TemplateUsageRow {
  sent: number;
  failed: number;
  lastUsedAt: string | null;
  lastSuccessAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
}

export type HealthTestKind =
  | "whatsapp"
  | "aisensy"
  | "email"
  | "brevo"
  | "queue"
  | "edge"
  | "retry";

export interface HealthTestResult {
  kind: HealthTestKind;
  pass: boolean;
  /** One-line human summary. */
  summary: string;
  /** Raw provider / edge response (status code, body, messageId…) for display. */
  detail?: string;
}

type InvokeFn = (
  name: string,
  opts?: { body?: unknown },
) => Promise<{ data?: unknown; error?: { message?: string } | null }>;

class CommsHealthService extends BaseService {
  private functions(): InvokeFn | null {
    const fn = (this.db as unknown as { functions?: { invoke: InvokeFn } }).functions;
    return fn?.invoke ? fn.invoke.bind(fn) : null;
  }

  /** Live snapshot composed from the existing tables — degrades gracefully. */
  async snapshot(): Promise<CommsHealthSnapshot> {
    const analytics = await commsAnalyticsService.overview();

    let queueReachable = true;
    let retrying = 0;
    let latestWhatsappAt: string | null = null;
    let latestFailedAt: string | null = null;
    let latestFailedError: string | null = null;
    let avgDeliveryMs: number | null = null;

    // Retrying = queued rows that have already been re-scheduled at least once.
    const retryRes = await this.db
      .from("message_queue" as never)
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .gt("retry_count", 0);
    if (retryRes.error) {
      if (isMissingTable(retryRes.error)) queueReachable = false;
    } else {
      retrying = retryRes.count ?? 0;
    }

    // Latest successful WhatsApp.
    const okRes = await this.db
      .from("message_queue" as never)
      .select("sent_at")
      .in("channel", ["whatsapp", "sms"])
      .in("status", ["sent", "delivered", "read"])
      .order("sent_at", { ascending: false })
      .limit(1);
    if (!okRes.error) {
      const row = (okRes.data as unknown as Array<{ sent_at: string | null }>)?.[0];
      latestWhatsappAt = row?.sent_at ?? null;
    }

    // Latest failure (with reason).
    const failRes = await this.db
      .from("message_queue" as never)
      .select("created_at, last_error")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!failRes.error) {
      const row = (failRes.data as unknown as Array<{ created_at: string; last_error: string | null }>)?.[0];
      latestFailedAt = row?.created_at ?? null;
      latestFailedError = row?.last_error ?? null;
    }

    // Average delivery latency (delivered_at − sent_at) over the recent window.
    const deliverRes = await this.db
      .from("message_queue" as never)
      .select("sent_at, delivered_at")
      .not("sent_at", "is", null)
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(200);
    if (!deliverRes.error) {
      const rows = (deliverRes.data as unknown as Array<{ sent_at: string; delivered_at: string }>) ?? [];
      const deltas = rows
        .map((r) => new Date(r.delivered_at).getTime() - new Date(r.sent_at).getTime())
        .filter((d) => Number.isFinite(d) && d >= 0);
      if (deltas.length > 0) {
        avgDeliveryMs = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
      }
    }

    let templateCount = 0;
    try {
      templateCount = (await commsTemplatesService.list()).length;
    } catch {
      /* leave 0 */
    }

    return {
      queued: analytics.queued,
      processing: analytics.processing,
      sent: analytics.sent,
      delivered: analytics.delivered,
      read: analytics.read,
      failed: analytics.failed,
      cancelled: analytics.cancelled,
      total: analytics.total,
      deliveryRate: analytics.deliveryRate,
      failureRate: analytics.failureRate,
      retrying,
      templateCount,
      latestWhatsappAt,
      latestFailedAt,
      latestFailedError,
      avgDeliveryMs,
      queueReachable,
    };
  }

  /**
   * Per-template usage facts from message_queue: sent/failed counts and the
   * last-used / last-success / last-failure timestamps. Powers the inventory +
   * template-verification sections. Degrades to an empty map pre-migration.
   */
  async templateUsage(): Promise<Record<string, TemplateUsageRow>> {
    const out: Record<string, TemplateUsageRow> = {};
    const res = await this.db
      .from("message_queue" as never)
      .select("template_key, template, status, created_at, sent_at, last_error")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (res.error) return out; // missing table ⇒ no usage
    const rows =
      (res.data as unknown as Array<{
        template_key: string | null;
        template: string | null;
        status: string;
        created_at: string;
        sent_at: string | null;
        last_error: string | null;
      }>) ?? [];
    for (const r of rows) {
      const key = r.template_key || r.template;
      if (!key) continue;
      const row =
        out[key] ??
        (out[key] = { sent: 0, failed: 0, lastUsedAt: null, lastSuccessAt: null, lastFailedAt: null, lastError: null });
      if (!row.lastUsedAt) row.lastUsedAt = r.created_at;
      if (["sent", "delivered", "read"].includes(r.status)) {
        row.sent += 1;
        if (!row.lastSuccessAt) row.lastSuccessAt = r.sent_at ?? r.created_at;
      } else if (r.status === "failed") {
        row.failed += 1;
        if (!row.lastFailedAt) {
          row.lastFailedAt = r.created_at;
          row.lastError = r.last_error ?? null;
        }
      }
    }
    return out;
  }

  /** Test WhatsApp / AiSensy — real provider call via send-aisensy debug mode. */
  async testWhatsApp(destination: string, campaignName = "ark_broadcast_alert"): Promise<HealthTestResult> {
    if (!destination.trim()) {
      return { kind: "whatsapp", pass: false, summary: "Enter a test WhatsApp number first." };
    }
    const res = await aisensyService.debugSend({
      campaignName,
      destination,
      templateParams: ["ARK Communication Center — live test message."],
    });
    if (res.error) {
      return { kind: "whatsapp", pass: false, summary: "Edge/provider call failed.", detail: res.error };
    }
    return {
      kind: "whatsapp",
      pass: res.ok,
      summary: res.ok
        ? `AiSensy accepted the message (HTTP ${res.responseStatus}).`
        : `AiSensy rejected the message (HTTP ${res.responseStatus ?? "?"}).`,
      detail: res.responseBody,
    };
  }

  /** Test Email / Brevo — real send via the send-email edge function. */
  async testEmail(email: string): Promise<HealthTestResult> {
    if (!email.trim()) {
      return { kind: "email", pass: false, summary: "Enter a test email address first." };
    }
    const invoke = this.functions();
    if (!invoke) return { kind: "email", pass: false, summary: "Edge runtime unavailable in this client." };
    try {
      const res = await invoke("send-email", {
        body: {
          templateId: "generic-notice",
          to: { email: email.trim() },
          params: {
            heading: "ARK Communication Center — test email",
            paragraphs: [
              "This is a live test from the Communication Center health page.",
              "If you received this, the send-email function and Brevo are configured correctly.",
            ],
          },
        },
      });
      if (res.error) {
        return { kind: "email", pass: false, summary: "send-email call failed.", detail: String(res.error.message ?? res.error) };
      }
      const data = (res.data ?? {}) as { ok?: boolean; status?: string; messageId?: string; error?: string };
      return {
        kind: "email",
        pass: !!data.ok,
        summary: data.ok ? `Brevo accepted the email (${data.status}).` : `Email failed: ${data.error ?? data.status ?? "unknown"}.`,
        detail: data.messageId ? `messageId: ${data.messageId}` : data.error,
      };
    } catch (e) {
      return { kind: "email", pass: false, summary: "send-email threw.", detail: (e as Error).message };
    }
  }

  /** Test Queue / Edge Functions — nudge send-aisensy to drain (limit 1). */
  async testQueue(): Promise<HealthTestResult> {
    const res = await aisensyService.dispatchViaEdge({ limit: 1 });
    return {
      kind: "queue",
      pass: res.dispatched,
      summary: res.dispatched
        ? "send-aisensy responded — queue drain reachable."
        : "send-aisensy did not respond.",
      detail: res.reason,
    };
  }

  /**
   * Test Retry — verifies the retry ENGINE (pure policy) behaves to spec without
   * burning provider quota: 429/5xx retry with backoff, 4xx fail immediately.
   */
  testRetry(): HealthTestResult {
    const checks: Array<{ name: string; ok: boolean }> = [];
    // 429 → should requeue with backoff.
    const r429 = planAfterFailure(0, 429);
    checks.push({ name: "429 retries with backoff", ok: r429.status === "queued" && !!r429.retryAt });
    // 503 → should requeue.
    checks.push({ name: "503 retries", ok: planAfterFailure(0, 503).status === "queued" });
    // 400 → permanent fail, no retry.
    checks.push({ name: "400 fails immediately", ok: planAfterFailure(0, 400).status === "failed" });
    // 401/403/404 → permanent.
    checks.push({ name: "401/403/404 never retry", ok: [401, 403, 404].every((s) => planAfterFailure(0, s).status === "failed") });
    // Exhaustion → fail after MAX_RETRIES.
    checks.push({ name: "stops after max retries", ok: planAfterFailure(MAX_RETRIES, 503).status === "failed" });
    const pass = checks.every((c) => c.ok);
    return {
      kind: "retry",
      pass,
      summary: pass
        ? `Retry engine OK — backoff ${BACKOFF_MINUTES.join("/")} min, max ${MAX_RETRIES}.`
        : "Retry engine FAILED one or more policy checks.",
      detail: checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}`).join("  ·  "),
    };
  }
}

export const commsHealthService = new CommsHealthService();
