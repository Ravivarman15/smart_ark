import { BaseService, AppError } from "@/shared/services";
import { loginUrl } from "../utils/appUrl";
import type { EmailOpResult } from "../types/staff.types";

// ── Frontend transactional email gateway ────────────────────────────────────
//
// All email SENDING happens server-side — the Brevo secrets (BREVO_API_KEY,
// SENDER_EMAIL) live only in the edge functions. This service is the single
// place the app TRIGGERS transactional email; it invokes the right edge
// function and normalises the result.
//
// ROUTING
//   • Staff credential emails (welcome / reset) → `invite-staff` edge function
//     (it owns auth-user mutation, so the email + password regen stay atomic).
//   • Everything else → the generic `send-email` edge function.
//
// FUTURE EMAILS (student welcome, fee reminders, exam notifications):
//   1. Add the template to `supabase/functions/_shared/email-templates.ts`.
//   2. Add its id to `KNOWN_TEMPLATES` there.
//   3. Call `emailService.sendTemplateEmail({ templateId, to, params })`.
// No new edge function or secret handling required.
// ─────────────────────────────────────────────────────────────────────────────

/** Pull the real message out of a Supabase FunctionsHttpError response body. */
const readEdgeError = async (
  error: unknown,
  fallback: string,
): Promise<string> => {
  let message = (error as { message?: string })?.message ?? fallback;
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) message = body.error as string;
    }
  } catch {
    /* keep the generic message */
  }
  return message;
};

interface TemplateEmailResult {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
}

/**
 * True for a supabase-js `FunctionsFetchError` — the request never reached the
 * edge function at all.
 *
 * ┌── WHAT THOSE FAILED ROWS ACTUALLY WERE ────────────────────────────────┐
 * │ Every failed fee-receipt email on the live system carried exactly one  │
 * │ message: "Failed to send a request to the Edge Function". That is not  │
 * │ Brevo rejecting the mail and not a permission error — it is the        │
 * │ browser's fetch being dropped mid-flight, so nothing was ever sent and │
 * │ nothing was ever retried.                                              │
 * │                                                                        │
 * │ The dominant cause was payload size: a receipt PDF weighed ~4.8 MB and │
 * │ rode along as base64, making a ~6.5 MB upload per collection. That is  │
 * │ fixed at the source in src/lib/documentRaster.ts, which is the real    │
 * │ repair. This retry covers what remains — an ordinary flaky connection  │
 * │ on a school's network, which no payload size makes impossible.         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A 4xx/5xx FROM the function is a `FunctionsHttpError` and is NOT retried:
 * an unknown template or a forbidden role fails identically every time.
 */
export const isTransportError = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as { message?: string })?.message ?? "";
  return (
    name === "FunctionsFetchError" ||
    /failed to send a request|failed to fetch|network ?error/i.test(message)
  );
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class EmailService extends BaseService {
  /**
   * Resend the welcome email. The edge function regenerates a fresh temporary
   * password so an expired / lost credential is fully replaced.
   */
  async resendWelcomeEmail(email: string): Promise<EmailOpResult> {
    return this.invokeInvite({
      action: "resend_invite",
      email,
      login_url: loginUrl(),
    });
  }

  /** Send a branded password-reset email. */
  async sendPasswordReset(email: string): Promise<EmailOpResult> {
    return this.invokeInvite({
      action: "reset_password",
      email,
      login_url: loginUrl(),
    });
  }

  /**
   * Generic transactional email — the reusable path for non-staff emails.
   * Renders a registered template server-side and sends it via Brevo.
   */
  async sendTemplateEmail(args: {
    templateId: string;
    to: { email: string; name?: string };
    params: Record<string, unknown>;
    branch?: string;
    /** Optional file attachments (e.g. fee receipt PDF) — url or base64 content. */
    attachment?: { name: string; url?: string; content?: string }[];
    /** Links the server-side delivery-log row to what the email is about. */
    contextType?: string;
    contextId?: string;
    /** Domain fields merged into the delivery-log payload (e.g. receipt_no). */
    logPayload?: Record<string, unknown>;
  }): Promise<TemplateEmailResult> {
    // Three attempts, transport failures only. Sending is idempotent from the
    // caller's side: a dropped request means the function never ran, so a retry
    // cannot produce a duplicate email.
    const MAX_ATTEMPTS = 3;
    let data: unknown;
    let error: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      ({ data, error } = await this.db.functions.invoke("send-email", {
        body: args,
      }));
      if (!error || !isTransportError(error) || attempt === MAX_ATTEMPTS) break;
      await wait(attempt * 800); // 800ms, then 1.6s
    }

    if (error) {
      const message = await readEdgeError(error, "Email send failed");
      throw AppError.fromSupabase({ message } as never, "send-email");
    }
    const res = data as TemplateEmailResult & { error?: string };
    if (res && res.ok === undefined && res.error) {
      throw AppError.validation(res.error);
    }
    return res;
  }

  private async invokeInvite(
    body: Record<string, unknown>,
  ): Promise<EmailOpResult> {
    const { data, error } = await this.db.functions.invoke("invite-staff", {
      body,
    });
    if (error) {
      const message = await readEdgeError(error, "Email operation failed");
      throw AppError.fromSupabase({ message } as never, "invite-staff");
    }
    const res = (data ?? {}) as Record<string, unknown>;
    if (typeof res.error === "string" && !res.ok) {
      throw AppError.validation(res.error);
    }
    return {
      ok: true,
      emailStatus:
        (res.email_status as EmailOpResult["emailStatus"]) ?? "skipped",
      emailError: res.email_error as string | undefined,
      link: res.link as string | undefined,
      tempPassword: res.temp_password as string | undefined,
    };
  }
}

export const emailService = new EmailService();
