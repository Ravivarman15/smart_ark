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
// WhatsApp delivery deliberately goes through the existing message_queue →
// send-aisensy path rather than a direct call, so a parent's credential message
// appears in the same Communication Timeline as every other outbound message
// and inherits its retry and delivery-status handling.

import { BaseService } from "@/shared/services";
import { loginUrl as appLoginUrl } from "@/features/staff/utils/appUrl";
import { normalizeMobile } from "../utils/parentCandidates";

export interface CredentialDelivery {
  channel: "email" | "whatsapp";
  ok: boolean;
  skipped?: boolean;
  message?: string;
}

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
   * Queue the credentials over WhatsApp.
   *
   * Writes to `message_queue` — the Communication Center's own outbound table —
   * so the message is picked up by the existing sender, retried on failure, and
   * visible in the Communication Timeline alongside every other message to this
   * family. Bypassing the queue would create an invisible second channel.
   */
  async sendWhatsapp(input: SendCredentialsInput): Promise<CredentialDelivery> {
    const mobile = normalizeMobile(input.mobile);
    if (mobile.length !== 10) {
      return {
        channel: "whatsapp",
        ok: false,
        skipped: true,
        message: "No valid mobile on record — nothing was sent.",
      };
    }

    try {
      const { error } = await this.db.from("message_queue" as never).insert({
        channel: "whatsapp",
        provider: "aisensy",
        template: "parent_portal_credentials",
        recipient_name: input.parentName,
        recipient_phone: mobile,
        recipient_student_id: input.studentId ?? null,
        context_type: "credentials",
        context_id: input.parentAccountId ?? null,
        status: "queued",
        payload: {
          parentName: input.parentName,
          loginEmail: input.loginEmail,
          password: input.password,
          loginUrl: loginUrl(),
          children: input.childNames ?? [],
        },
      } as never);

      if (error) return { channel: "whatsapp", ok: false, message: error.message };
      return { channel: "whatsapp", ok: true };
    } catch (e) {
      return { channel: "whatsapp", ok: false, message: (e as Error).message };
    }
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
