// ── Parent credential delivery ───────────────────────────────────────────────
//
// Sends portal credentials to a parent the same way staff get theirs: through
// the existing `send-email` edge function and the registered `staff-welcome`
// template. No new template, no new function, no second email pipeline.
//
// WHY REUSE `staff-welcome` RATHER THAN ADD `parent-welcome`:
// `send-email` only renders templates registered in `_shared/email-templates.ts`
// — that whitelist is what stops it becoming an arbitrary-HTML relay. Adding a
// template therefore means redeploying the function. `staff-welcome` is already
// generic ("An account has been created for you at {org}. Role: {roleLabel}")
// and carries exactly the fields a parent needs: login email, temp password,
// login URL. Passing roleLabel "Parent — access for Ram" reads correctly and
// works against the CURRENTLY DEPLOYED function.
//
// WhatsApp delivery goes through the existing renderMessage → aisensyService
// .enqueue → send-aisensy path rather than a direct provider call, on the
// registered `parent_credentials` utility template. A parent's credential
// message therefore appears in the same Communication Timeline as every other
// outbound message and inherits its validation, retry and delivery-status
// handling. See sendWhatsapp() for why the previous hand-written queue row
// could never have been delivered.

import { BaseService } from "@/shared/services";
import { loginUrl as appLoginUrl } from "@/features/staff/utils/appUrl";
import { sendCredentialWhatsapp } from "@/features/communication/services/credentialWhatsapp.service";
import type { CredentialDelivery } from "@/features/communication/services/credentialWhatsapp.service";

export type { CredentialDelivery };

export interface SendCredentialsInput {
  parentName: string;
  loginEmail: string;
  password: string;
  /** The parent's real contact email — NOT the synthesised login email. */
  contactEmail?: string;
  mobile?: string;
  /** Children the login covers, for the message body. */
  childNames?: string[];
  parentAccountId?: string;
  studentId?: string;
}

/**
 * Where the portal lives, for the "Log in" button in the email.
 *
 * REUSES the staff onboarding helper rather than reading
 * `window.location.origin` directly. That origin is wherever the STAFF member
 * happened to be browsing — provision an account from a dev server and every
 * parent receives a `http://localhost:5173/login` link they cannot open.
 *
 * `appBaseUrl()` prefers the configured `VITE_PUBLIC_APP_URL` and only falls
 * back to the current origin, so the deployed build always emits the real URL.
 */
const loginUrl = (): string => appLoginUrl();

/**
 * A synthesised login email is a placeholder, not a mailbox — sending to
 * `mani.a3f9@parents.ark.local` bounces. Only a real contact address is
 * deliverable.
 */
const isSyntheticLogin = (email?: string): boolean =>
  !!email && /@(parents|students)\.ark\.local$/i.test(email.trim());

class ParentCredentialsService extends BaseService {
  /**
   * Email the credentials. Returns a result rather than throwing: a delivery
   * failure must never be reported as a provisioning failure, because the
   * account genuinely exists and the credentials are still on screen.
   */
  async sendEmail(input: SendCredentialsInput): Promise<CredentialDelivery> {
    const to = (input.contactEmail ?? "").trim();
    if (!to || isSyntheticLogin(to)) {
      return {
        channel: "email",
        ok: false,
        skipped: true,
        message: "No real email address on record — nothing was sent.",
      };
    }

    const childLabel = input.childNames?.length
      ? `Parent — portal access for ${input.childNames.join(", ")}`
      : "Parent";

    try {
      const { data, error } = await this.db.functions.invoke("send-email", {
        body: {
          templateId: "staff-welcome",
          to: { email: to, name: input.parentName },
          params: {
            staffName: input.parentName,
            roleLabel: childLabel,
            loginEmail: input.loginEmail,
            tempPassword: input.password,
            loginUrl: loginUrl(),
          },
        },
      });

      if (error) {
        const ctx = (error as { context?: Response }).context;
        let detail = "";
        if (ctx && typeof ctx.json === "function") {
          try {
            const parsed = await ctx.clone().json();
            detail = parsed?.error ?? parsed?.message ?? "";
          } catch {
            /* non-JSON body */
          }
          if (ctx.status === 404) {
            return {
              channel: "email",
              ok: false,
              message: "The email service is not deployed. Run: supabase functions deploy send-email",
            };
          }
        }
        return { channel: "email", ok: false, message: detail || "Email could not be sent." };
      }

      const status = (data as { status?: string } | null)?.status;
      if (status === "failed") {
        return {
          channel: "email",
          ok: false,
          message: (data as { error?: string }).error ?? "The email provider rejected the message.",
        };
      }
      if (status === "skipped") {
        return { channel: "email", ok: false, skipped: true, message: "Email sending is disabled." };
      }
      return { channel: "email", ok: true };
    } catch (e) {
      return { channel: "email", ok: false, message: (e as Error).message };
    }
  }

  /**
   * WhatsApp the credentials through the `parent_credentials` utility template.
   *
   * WHAT THIS REPLACED, AND WHY IT NEVER DELIVERED
   * The previous version hand-wrote a `message_queue` row with
   * `template: "parent_portal_credentials"` and a camelCase payload. Both halves
   * were fatal, and neither was visible from the UI:
   *
   *   1. No `__body`. The drainer's very first guard is
   *      `if (!dest || !bodyText) → status 'failed', last_error 'empty body'`.
   *      Every credential row died there without one provider call being made,
   *      while the screen said "credentials queued for WhatsApp".
   *   2. `parent_portal_credentials` is not a template — not in the builtin
   *      registry, not in the positional-param table, not an AiSensy campaign.
   *      Even past the guard, AiSensy had nothing to send.
   *
   * So this now goes through the SAME path every other outbound message uses —
   * renderMessage → aisensyService.enqueue → send-aisensy — which supplies the
   * rendered body, the snake_case variable map the positional spec reads, phone
   * normalisation, validation, retry/backoff, delivery webhooks and the
   * Communication Timeline entry. Nothing here is credential-specific except the
   * variable bag.
   *
   * Credentials are transactional: the queue is drained IMMEDIATELY rather than
   * left for the next cron tick, exactly as fee receipts are. A parent waiting
   * on a password should not wait on a scheduler.
   */
  async sendWhatsapp(input: SendCredentialsInput): Promise<CredentialDelivery> {
    return sendCredentialWhatsapp({
      templateKey: "parent_credentials",
      vars: {
        parent_name: input.parentName,
        // One WhatsApp param, so multiple children join into one phrase. The
        // login is per-parent, not per-child — naming only the first would tell
        // a two-child parent their second child has no access.
        student_name: input.childNames?.length ? input.childNames.join(", ") : "your child",
        login_email: input.loginEmail,
        password: input.password,
        login_url: loginUrl(),
      },
      recipientName: input.parentName,
      mobile: input.mobile,
      recipientKind: "guardian",
      contextType: "parent_credentials",
      contextId: input.parentAccountId,
      studentId: input.studentId,
    });
  }

  /** Send on every channel the parent actually has details for. */
  async sendAll(input: SendCredentialsInput): Promise<CredentialDelivery[]> {
    const [email, whatsapp] = await Promise.all([
      this.sendEmail(input),
      this.sendWhatsapp(input),
    ]);
    return [email, whatsapp];
  }
}

export const parentCredentialsService = new ParentCredentialsService();
