// ── Email delivery log ──────────────────────────────────────────────────────
//
// ┌── WHY THIS EXISTS ─────────────────────────────────────────────────────┐
// │ Asked "check the email status", the honest answer was that it could    │
// │ not be checked. `message_queue` held 108 email rows and every one of   │
// │ them was a fee receipt, because fee receipts were the only path that   │
// │ wrote a row — and it wrote it from the FRONTEND, after the fact.       │
// │                                                                        │
// │ Everything else — staff welcome, password reset, payslips, lead        │
// │ alerts, public-form acknowledgements, the organization welcome, every  │
// │ billing notice — sent (or silently failed to send) with no record at   │
// │ all. Callers treat email as best-effort and swallow the error, which   │
// │ is correct behaviour and also why nine hard failures went unnoticed    │
// │ for months.                                                            │
// └────────────────────────────────────────────────────────────────────────┘
//
// So the log lives in `sendBrevoEmail` — the ONE place edge functions talk to
// Brevo — and its context is a REQUIRED parameter. Optional would mean it can
// be forgotten, and being forgotten is the entire defect.
//
// Rows go to `message_queue` (channel = 'email'), reusing the existing comms
// backbone rather than inventing a parallel table. The queue drain filters
// `channel in ('whatsapp','sms')`, so an email row is a record, never work.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailAuditContext {
  /** Service-role client used for the insert. */
  db: SupabaseClient;
  /**
   * The tenant this email belongs to.
   *
   * NULL is legitimate — a platform-level lead alert belongs to no tenant. It
   * is NOT guessed: `message_queue.organization_id` is NOT NULL and the column
   * default resolves to NULL under a service role once more than one
   * organization exists, so an unstamped insert would simply fail. A null org
   * is logged to the console and skipped instead.
   */
  organizationId: string | null;
  /** Registered template id, e.g. "fee-receipt". */
  template: string;
  /** Display name of the recipient, when known. */
  recipientName?: string;
  /** Links the row to the thing it is about, e.g. "fee_receipt". */
  contextType?: string;
  contextId?: string;
  /** profiles.id of whoever triggered it, when a human did. */
  createdBy?: string;
  /**
   * Domain fields merged into the logged `payload`.
   *
   * Fee receipts need `receipt_no` here: the duplicate guard that stops a
   * receipt being emailed twice looks the row up by `payload->>receipt_no`, so
   * a row logged without it would silently re-send on every collection.
   */
  extraPayload?: Record<string, unknown>;
}

export interface EmailAuditOutcome {
  ok: boolean;
  status: string;
  messageId?: string;
  error?: string;
}

/**
 * Record one email attempt. Never throws and never blocks delivery — the email
 * has already been sent (or has already failed) by the time this runs, and an
 * audit failure must not turn a delivered email into a reported error.
 */
export const logEmailDelivery = async (
  ctx: EmailAuditContext,
  recipientEmail: string,
  outcome: EmailAuditOutcome,
): Promise<void> => {
  if (!ctx.organizationId) {
    console.log(
      `[email-log] ${ctx.template} → ${recipientEmail}: ${outcome.status} ` +
        `(not recorded — no tenant to attribute it to)`,
    );
    return;
  }
  try {
    await ctx.db.from("message_queue").insert({
      organization_id: ctx.organizationId,
      channel: "email",
      provider: "brevo",
      template: ctx.template,
      template_key: ctx.template,
      recipient_name: ctx.recipientName ?? null,
      recipient_phone: null,
      payload: {
        ...(ctx.extraPayload ?? {}),
        email: recipientEmail,
        // The WhatsApp drain fails any row with no `__body` as "empty body".
        // Email rows are never drained, but a queue row that would be invalid
        // if it ever were is a trap left for someone else.
        __body: `${ctx.template} email`,
      },
      context_type: ctx.contextType ?? ctx.template,
      context_id: ctx.contextId ?? null,
      status: outcome.ok ? "sent" : outcome.status === "skipped" ? "skipped" : "failed",
      attempts: 1,
      provider_message_id: outcome.messageId ?? null,
      last_error: outcome.error ?? null,
      sent_at: outcome.ok ? new Date().toISOString() : null,
      created_by: ctx.createdBy ?? null,
    });
  } catch (e) {
    // Best-effort by design.
    console.warn(`[email-log] could not record ${ctx.template}:`, (e as Error).message);
  }
};
