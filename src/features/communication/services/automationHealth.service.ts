// ──────────────────────────────────────────────────────────────────────────────
// AUTOMATION HEALTH — real per-event delivery history, or nothing.
//
// ┌── THE RULE THIS FILE ENFORCES ─────────────────────────────────────────┐
// │ "Last success: never" and "Last success: —" mean different things.     │
// │ The first is a claim about history; the second says we have none.      │
// │ Every field below is null when no row backs it, and the UI renders     │
// │ null as an em dash. Nothing is defaulted to 0, because a 0 next to a   │
// │ green switch reads as "ran, sent nothing" when the truth is "never     │
// │ ran at all" — and those need opposite responses from an operator.      │
// └────────────────────────────────────────────────────────────────────────┘
//
// The source is message_queue, which is where every channel's send actually
// lands. `context_type` carries the event key — set by both the in-app
// dispatcher and the Deno scheduler — so one query covers both paths.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

export interface AutomationHealth {
  eventKey: string;
  /** Most recent queue row for this event, whatever its outcome. null = never ran. */
  lastRunAt: string | null;
  /** Most recent row that actually reached the recipient. */
  lastSuccessAt: string | null;
  /** Most recent failure, with the provider's own words. */
  lastFailureAt: string | null;
  lastError: string | null;
  /** Rows queued in the trailing window. null when the event has no history. */
  recipients30d: number | null;
  sent30d: number | null;
  failed30d: number | null;
  pending30d: number | null;
}

/** Statuses that mean the message reached the provider or the recipient. */
const DELIVERED = new Set(["sent", "delivered", "read"]);
const FAILED = new Set(["failed", "error", "permanently_failed"]);

interface QueueRow {
  context_type: string | null;
  status: string | null;
  last_error: string | null;
  created_at: string | null;
  sent_at: string | null;
}

export const automationHealthService = {
  /**
   * One pass over the tenant's recent queue, bucketed by event key.
   *
   * RLS scopes the read to the caller's organization — this deliberately does
   * NOT accept an organizationId argument. Tenant identity comes from the JWT,
   * never from a parameter a caller could set to someone else's id.
   */
  async byEvent(days = 30): Promise<Record<string, AutomationHealth>> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // `as never` on the table name: message_queue post-dates the generated
    // Supabase types, and every other reader in this feature does the same.
    const { data, error } = await supabase
      .from("message_queue" as never)
      .select("context_type, status, last_error, created_at, sent_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    // A failed read is reported as "no data", never as zeros. The caller shows
    // em dashes, which is honest: we could not determine the history.
    if (error) {
      console.error("[automationHealth] queue read failed:", error.message);
      return {};
    }

    const out: Record<string, AutomationHealth> = {};
    for (const raw of ((data ?? []) as unknown as QueueRow[])) {
      const key = raw.context_type;
      if (!key) continue;

      const h = (out[key] ??= {
        eventKey: key,
        lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastError: null,
        recipients30d: 0, sent30d: 0, failed30d: 0, pending30d: 0,
      });

      const at = raw.created_at;
      // Rows arrive newest-first, so the first sighting of each kind wins.
      if (at && !h.lastRunAt) h.lastRunAt = at;

      const status = String(raw.status ?? "").toLowerCase();
      h.recipients30d = (h.recipients30d ?? 0) + 1;

      if (DELIVERED.has(status)) {
        h.sent30d = (h.sent30d ?? 0) + 1;
        if (!h.lastSuccessAt) h.lastSuccessAt = raw.sent_at ?? at;
      } else if (FAILED.has(status)) {
        h.failed30d = (h.failed30d ?? 0) + 1;
        if (!h.lastFailureAt) {
          h.lastFailureAt = at;
          h.lastError = raw.last_error ?? null;
        }
      } else {
        h.pending30d = (h.pending30d ?? 0) + 1;
      }
    }
    return out;
  },
};

/** An event with no row at all. Every metric null — the UI renders em dashes. */
export const NO_HISTORY = (eventKey: string): AutomationHealth => ({
  eventKey,
  lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastError: null,
  recipients30d: null, sent30d: null, failed30d: null, pending30d: null,
});
