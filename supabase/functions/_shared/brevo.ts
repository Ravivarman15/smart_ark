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
//   supabase secrets set SENDER_NAME="The Ark Tuition"
//
// GRACEFUL DEGRADATION:
//   If the secrets are not configured the client returns
//   `{ ok:false, status:"skipped" }` instead of throwing — the caller can
//   still complete its work (e.g. create the staff account) and surface the
//   credentials another way. This keeps the feature usable before Brevo is
//   wired up.
// ─────────────────────────────────────────────────────────────────────────────

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoRecipient {
  email: string;
  name?: string;
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
): Promise<BrevoSendResult> => {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("SENDER_EMAIL");
  const senderName = Deno.env.get("SENDER_NAME") ?? "The Ark Tuition";

  if (!apiKey || !senderEmail) {
    return {
      ok: false,
      status: "skipped",
      error:
        "Email not sent — BREVO_API_KEY / SENDER_EMAIL secrets are not configured.",
    };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: params.to,
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
        tags: params.tags,
        replyTo: params.replyTo,
      }),
    });

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* Brevo returns JSON; plain text only on infra errors */
    }

    // Log status only — never the full body (may contain recipient PII).
    console.log(`Brevo → ${params.to[0]?.email}: HTTP ${res.status}`);

    if (res.ok) {
      return {
        ok: true,
        status: "sent",
        messageId: (body.messageId as string) ?? undefined,
      };
    }

    return {
      ok: false,
      status: "failed",
      error: `Brevo error (${res.status}): ${
        (body.message as string) || res.statusText
      }`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      error: `Brevo request failed: ${(err as Error).message}`,
    };
  }
};
