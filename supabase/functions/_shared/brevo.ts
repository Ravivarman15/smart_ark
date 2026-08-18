// ── Brevo transactional email client ────────────────────────────────────────
//
// The ONE place edge functions talk to Brevo (https://www.brevo.com). Used by
// `invite-staff` (staff welcome emails) and `send-email` (generic transactional
// emails). Future student / fee / exam emails reuse this same client.
//
// WHY SERVER-SIDE ONLY:
//   • BREVO_API_KEY must never be bundled into client-side JavaScript.
//   • SENDER_EMAIL must be a verified Brevo sender — kept with the key.
//
// REQUIRED SUPABASE SECRETS:
//   supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx
//   supabase secrets set SENDER_EMAIL=no-reply@thearktuition.com
// OPTIONAL:
//   supabase secrets set SENDER_NAME="Your Institution"
//
// GRACEFUL DEGRADATION:
//   If the secrets are not configured the client returns
//   `{ ok:false, status:"skipped" }` instead of throwing — the caller can
//   still complete its work (e.g. create the staff account) and surface the
//   credentials another way. This keeps the feature usable before Brevo is
//   wired up.
// ─────────────────────────────────────────────────────────────────────────────

import { type EmailAuditContext, logEmailDelivery } from "./email-log.ts";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Transient failures worth retrying: Brevo rate-limiting, its own 5xx, and any
 * network error. A 400 (bad template, invalid recipient) is never retried —
 * repeating it just burns time and produces the same rejection.
 */
const isTransient = (httpStatus: number | undefined): boolean =>
  httpStatus === undefined || httpStatus === 429 || httpStatus >= 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BrevoRecipient {
  email: string;
  name?: string;
}

/**
 * A file attachment for the email. Provide EITHER a publicly reachable `url`
 * (Brevo fetches it) OR base64 `content` — plus a `name` with extension.
 */
export interface BrevoAttachment {
  name: string;
  url?: string;
  content?: string;
}

export interface BrevoSendParams {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  /** Brevo tags — used for delivery analytics / filtering in the Brevo UI. */
  tags?: string[];
  /** Optional reply-to override (defaults to the sender). */
  replyTo?: BrevoRecipient;
  /** Optional file attachments (e.g. the fee receipt PDF). */
  attachment?: BrevoAttachment[];
}

export type EmailDeliveryStatus = "sent" | "failed" | "skipped";

export interface BrevoSendResult {
  ok: boolean;
  status: EmailDeliveryStatus;
  /** Brevo message id when the send succeeded. */
  messageId?: string;
  /** Human-readable failure / skip reason. */
  error?: string;
}

/** True when both required secrets are present. */
export const brevoConfigured = (): boolean =>
  !!Deno.env.get("BREVO_API_KEY") && !!Deno.env.get("SENDER_EMAIL");

/**
 * Send one transactional email through Brevo's SMTP API.
 * Never throws — always resolves to a {@link BrevoSendResult} so callers can
 * record the delivery status without a try/catch around every send.
 */
export const sendBrevoEmail = async (
  params: BrevoSendParams,
  /**
   * REQUIRED delivery-log context — see _shared/email-log.ts.
   *
   * It is required rather than optional because "most emails leave no record"
   * was the actual defect: fee receipts were the only path that logged, so
   * every other failure was invisible. An optional parameter would be
   * forgotten by the next caller, which is exactly how this happened.
   */
  audit: EmailAuditContext,
  /**
   * Phase 6 — OPTIONAL per-organization sender.
   *
   * Omitted (every existing caller): the platform's own Deno.env secrets are
   * used, byte-for-byte as before. That backward compatibility is the point —
   * invite-staff, payroll payslips and every other existing send keeps working
   * with no change at all, and ARK is unaffected.
   *
   * Supplied: the organization's own verified Brevo account and sender.
   * Resolution lives in _shared/integrations.ts, which falls back to the
   * platform whenever a custom integration is absent, unverified or
   * incomplete — so this parameter is never half-populated.
   */
  override?: { apiKey?: string; senderEmail?: string; senderName?: string },
): Promise<BrevoSendResult> => {
  const apiKey = override?.apiKey ?? Deno.env.get("BREVO_API_KEY");
  const senderEmail = override?.senderEmail ?? Deno.env.get("SENDER_EMAIL");
  // Platform default, not a tenant. This is the FROM name on every email the
  // platform sends; defaulting it to one customer signed every other customer’s
  // mail with that customer’s name. A tenant with its own verified sender
  // overrides it; a tenant without one is now merely generic.
  const senderName = override?.senderName ?? Deno.env.get("SENDER_NAME") ?? "Smart ARK";

  const recipient = params.to[0]?.email ?? "(no recipient)";

  const finish = async (result: BrevoSendResult): Promise<BrevoSendResult> => {
    await logEmailDelivery(audit, recipient, result);
    return result;
  };

  if (!apiKey || !senderEmail) {
    return finish({
      ok: false,
      status: "skipped",
      error:
        "Email not sent — BREVO_API_KEY / SENDER_EMAIL secrets are not configured.",
    });
  }

  const payload = JSON.stringify({
    sender: { email: senderEmail, name: senderName },
    to: params.to,
    subject: params.subject,
    htmlContent: params.htmlContent,
    textContent: params.textContent,
    tags: params.tags,
    replyTo: params.replyTo,
    attachment:
      params.attachment && params.attachment.length > 0
        ? params.attachment
        : undefined,
  });

  // Up to three attempts for TRANSIENT failures only (429, 5xx, network).
  // Brevo rate-limits per second on the lower plans, and a bulk payslip or
  // fee-reminder run trips it — those sends used to be reported as permanent
  // failures when waiting a moment would have delivered them.
  const MAX_ATTEMPTS = 3;
  let last: BrevoSendResult = { ok: false, status: "failed", error: "not attempted" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let httpStatus: number | undefined;
    try {
      const res = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
      });
      httpStatus = res.status;

      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* Brevo returns JSON; plain text only on infra errors */
      }

      // Log status only — never the full body (may contain recipient PII).
      console.log(`Brevo → ${recipient}: HTTP ${res.status} (attempt ${attempt})`);

      if (res.ok) {
        return finish({
          ok: true,
          status: "sent",
          messageId: (body.messageId as string) ?? undefined,
        });
      }

      last = {
        ok: false,
        status: "failed",
        error: `Brevo error (${res.status}): ${
          (body.message as string) || res.statusText
        }`,
      };
    } catch (err) {
      httpStatus = undefined; // network-level — always transient
      last = {
        ok: false,
        status: "failed",
        error: `Brevo request failed: ${(err as Error).message}`,
      };
    }

    if (attempt === MAX_ATTEMPTS || !isTransient(httpStatus)) break;
    await sleep(attempt * 600); // 600ms, then 1.2s
  }

  return finish(last);
};
