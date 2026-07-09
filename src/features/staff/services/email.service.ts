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
  }): Promise<TemplateEmailResult> {
    const { data, error } = await this.db.functions.invoke("send-email", {
      body: args,
    });
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
