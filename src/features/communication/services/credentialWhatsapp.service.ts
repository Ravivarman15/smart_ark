// ── Credential delivery over WhatsApp — ONE path for every account type ──────
//
// Parent logins and staff logins are provisioned by completely different
// systems (student-parent-accounts vs invite-staff), but "WhatsApp the new
// credentials to the person who just got an account" is the same job in both
// cases. It lives here once so it cannot drift into two half-correct copies.
//
// Everything below is the EXISTING communication backbone — nothing here is a
// second engine:
//   renderMessage (template registry) → aisensyService.enqueue (validation,
//   phone normalisation, message_queue row with `__body`) → send-aisensy
//   (positional params, provider POST, retry/backoff, delivery webhooks,
//   comms_audit) → Communication Timeline.
//
// WHY IT DRAINS IMMEDIATELY
// A credential is transactional: someone is sitting at a screen waiting to log
// in. Leaving the row for the next cron tick makes a new account look broken.
// Fee receipts made the same call for the same reason.
//
// WHY IT NEVER THROWS
// A delivery failure must never be reported as a provisioning failure — the
// account genuinely exists and the password is on screen either way. Every
// outcome comes back as a `CredentialDelivery` the UI can render honestly.

import type { RecipientKind } from "../types/communication.types";
import {
  asCommsTemplate,
  BUILTIN_TEMPLATES_BY_KEY,
  renderMessage,
} from "../utils/whatsappTemplates";
import { aisensyService } from "./aisensy.service";

export interface CredentialDelivery {
  channel: "email" | "whatsapp";
  ok: boolean;
  /** Nothing was attempted (no number on file) — not a failure to retry. */
  skipped?: boolean;
  message?: string;
}

export interface CredentialWhatsappInput {
  /** Registered template key — `parent_credentials` / `staff_credentials`. */
  templateKey: string;
  /** Resolved template variables, snake_case, matching the positional spec. */
  vars: Record<string, string | undefined>;
  recipientName: string;
  mobile?: string;
  recipientKind?: RecipientKind;
  /** Groups the message in the timeline (e.g. "parent_credentials"). */
  contextType: string;
  contextId?: string;
  studentId?: string;
  createdBy?: string;
}

/** Last 10 digits — the same normalisation the parent/staff forms accept. */
const tenDigits = (v?: string): string => {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/**
 * A credential message with no working portal address hands someone a password
 * and nowhere to use it. `VITE_PUBLIC_APP_URL` unset on a dev machine produces
 * exactly that, so the link is checked for shape before anything is queued.
 */
const isUsableUrl = (url?: string): boolean => /^https?:\/\/[^\s/]+/i.test(url ?? "");

export const sendCredentialWhatsapp = async (
  input: CredentialWhatsappInput,
): Promise<CredentialDelivery> => {
  const mobile = tenDigits(input.mobile);
  if (mobile.length !== 10) {
    return {
      channel: "whatsapp",
      ok: false,
      skipped: true,
      message: "No valid mobile on record — nothing was sent.",
    };
  }

  if (!isUsableUrl(input.vars.login_url)) {
    return {
      channel: "whatsapp",
      ok: false,
      message: "No portal URL is configured — set VITE_PUBLIC_APP_URL and redeploy.",
    };
  }

  const builtin = BUILTIN_TEMPLATES_BY_KEY[input.templateKey];
  if (!builtin) {
    // A template key that isn't registered has no body and no positional param
    // spec: the queue row would be failed by the drainer as "empty body" and
    // nobody would ever see why. Refuse loudly instead.
    return {
      channel: "whatsapp",
      ok: false,
      message: `Unknown WhatsApp template "${input.templateKey}".`,
    };
  }

  try {
    const rendered = renderMessage(asCommsTemplate(builtin), input.vars);

    const enq = await aisensyService.enqueue({
      channel: "whatsapp",
      rendered,
      contextType: input.contextType,
      contextId: input.contextId,
      recipient: {
        kind: input.recipientKind ?? "guardian",
        name: input.recipientName,
        phone: mobile,
        studentId: input.studentId,
      },
      createdBy: input.createdBy,
    });

    if (enq.queued === 0) {
      return {
        channel: "whatsapp",
        ok: false,
        message:
          enq.invalid[0]?.reason ??
          "WhatsApp message rejected before sending (invalid number or unresolved field).",
      };
    }

    const disp = await aisensyService.dispatchViaEdge({ limit: 1 });
    if (!disp.dispatched) {
      // Queued is not sent. Which one happened decides whether staff still have
      // to read the password out over the phone.
      return {
        channel: "whatsapp",
        ok: false,
        message: `Queued, but the WhatsApp sender did not run (${disp.reason ?? "send-aisensy unreachable"}). It will go out on the next drain.`,
      };
    }
    return { channel: "whatsapp", ok: true };
  } catch (e) {
    return { channel: "whatsapp", ok: false, message: (e as Error).message };
  }
};
