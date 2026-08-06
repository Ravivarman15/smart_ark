// ── Edge function: send-email ───────────────────────────────────────────────
//
// Generic, role-gated transactional email sender. This is the reusable email
// endpoint the rest of the platform builds on — staff provisioning has its own
// dedicated `invite-staff` function, but every OTHER transactional email
// (future student welcome, fee reminders, exam notifications) goes through here.
//
// WHY A SINGLE FUNCTION:
//   • One audited choke-point for all outbound email.
//   • BREVO_API_KEY / SENDER_EMAIL stay server-side.
//   • It only renders REGISTERED templates from `_shared/email-templates.ts`
//     — callers cannot send arbitrary HTML, so it is not a spam/injection
//     vector beyond what an admin could already do.
//
// AUTH: requires a valid JWT (verify_jwt=true) AND an admin/management role
// checked inside the function — defence-in-depth.
//
// REQUEST BODY:
//   { templateId, to: { email, name? }, params: {...}, branch? }
//
// RESPONSE:
//   { ok, status: "sent"|"failed"|"skipped", messageId?, error? }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireRole } from "../_shared/auth.ts";
import { resolveEmailCredentials, recordIntegrationUse } from "../_shared/integrations.ts";
import { sendBrevoEmail } from "../_shared/brevo.ts";
import {
  type EmailTemplateId,
  KNOWN_TEMPLATES,
  renderEmail,
} from "../_shared/email-templates.ts";

interface SendEmailPayload {
  templateId: EmailTemplateId;
  to: { email: string; name?: string };
  params: Record<string, unknown>;
  branch?: string;
  /** Optional file attachments (e.g. the fee receipt PDF) — url or base64. */
  attachment?: { name: string; url?: string; content?: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Phase 0: signature-verified caller + role gate. Previously the JWT
    // payload was base64-decoded and trusted — see _shared/auth.ts.
    const gate = await requireRole(req, supabase, ["management", "admin"]);
    if (!gate.ok) return jsonResponse(gate.status, { error: gate.error });

    const body = (await req.json()) as SendEmailPayload;
    if (!body?.templateId || !body?.to?.email) {
      return jsonResponse(400, { error: "templateId and to.email are required" });
    }
    if (!KNOWN_TEMPLATES.includes(body.templateId)) {
      return jsonResponse(400, {
        error: `Unknown templateId. Allowed: ${KNOWN_TEMPLATES.join(", ")}`,
      });
    }

    const mail = renderEmail(body.templateId, body.params ?? {}, body.branch);

    // ── Phase 6: per-organization sender, platform by default ──────────────
    // The organization is taken from the VERIFIED caller, never from the
    // request body — a body-supplied org would let one tenant send under
    // another's verified sender identity.
    //
    // resolveEmailCredentials falls back to the platform's Brevo account
    // whenever the organization has no integration, has chosen 'platform', or
    // has a custom one that is unverified or incomplete. So this call behaves
    // exactly as it did before for every existing tenant, ARK included.
    const creds = await resolveEmailCredentials(supabase, gate.caller.organizationId);

    const result = await sendBrevoEmail(
      {
        to: [{ email: body.to.email.trim().toLowerCase(), name: body.to.name }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: [body.templateId],
        attachment: Array.isArray(body.attachment) ? body.attachment : undefined,
      },
      // Only pass an override for a genuinely custom sender; otherwise let
      // sendBrevoEmail read the platform env exactly as it always has.
      creds.mode === "custom"
        ? { apiKey: creds.apiKey, senderEmail: creds.senderEmail, senderName: creds.senderName }
        : undefined,
    );

    await recordIntegrationUse(
      supabase, gate.caller.organizationId, "email", result.ok, result.error,
    );

    return jsonResponse(result.ok ? 200 : 502, {
      ok: result.ok,
      status: result.status,
      messageId: result.messageId,
      error: result.error,
      // Surfaced so support can tell "their SMTP bounced" from "our Brevo is
      // down" without reading logs.
      sender: creds.mode,
    });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
