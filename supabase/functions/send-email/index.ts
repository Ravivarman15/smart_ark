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
import { isServiceRoleCaller, resolveCaller } from "../_shared/auth.ts";
import { resolveEmailCredentials, recordIntegrationUse } from "../_shared/integrations.ts";
import { sendBrevoEmail } from "../_shared/brevo.ts";
import {
  type EmailTemplateId,
  KNOWN_TEMPLATES,
  maySendTemplate,
  renderEmail,
} from "../_shared/email-templates.ts";

interface SendEmailPayload {
  templateId: EmailTemplateId;
  to: { email: string; name?: string };
  params: Record<string, unknown>;
  branch?: string;
  /** Optional file attachments (e.g. the fee receipt PDF) — url or base64. */
  attachment?: { name: string; url?: string; content?: string }[];
  /**
   * INTERNAL CALLERS ONLY (service-role key). Names the tenant the email is
   * for, because a service-role caller has no membership to derive it from.
   *
   * A user-authenticated caller cannot influence the tenant: the branch below
   * takes it from the verified membership and ignores this field entirely.
   */
  organizationId?: string;
  /** Links the delivery-log row to what the email is about. */
  contextType?: string;
  contextId?: string;
  /** Domain fields merged into the delivery-log payload (e.g. receipt_no). */
  logPayload?: Record<string, unknown>;
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

    const body = (await req.json()) as SendEmailPayload;
    if (!body?.templateId || !body?.to?.email) {
      return jsonResponse(400, { error: "templateId and to.email are required" });
    }
    if (!KNOWN_TEMPLATES.includes(body.templateId)) {
      return jsonResponse(400, {
        error: `Unknown templateId. Allowed: ${KNOWN_TEMPLATES.join(", ")}`,
      });
    }

    // ── Who is calling, and may they send THIS template? ───────────────────
    //
    // Two kinds of caller, and both used to be rejected in cases where they
    // should not have been:
    //
    //  1. OUR OWN SERVER-SIDE CODE, holding the service-role key. resolveCaller
    //     verifies against GoTrue, which does not know service tokens, so
    //     provisioning-worker and billing-lifecycle got a flat 401 — every
    //     welcome email and every billing email, since the day they shipped.
    //
    //  2. A SIGNED-IN STAFF MEMBER. The gate was a single ["management",
    //     "admin"] list for all mail, which locked out the 4 coordinators the
    //     database explicitly permits to collect fees and the 15 teachers whose
    //     actions fire the parent automations.
    //
    // Signature verification is unchanged: a user token still goes through
    // resolveCaller, and the tenant still comes from verified membership.
    const internal = isServiceRoleCaller(req);

    let organizationId: string | null;
    let callerRole: string | null = null;
    let callerProfileId: string | null = null;

    if (internal) {
      // Trusted: the service-role key never reaches a browser.
      organizationId = body.organizationId ?? null;
    } else {
      const caller = await resolveCaller(req, supabase);
      if (!caller) return jsonResponse(401, { error: "Unauthorized" });
      organizationId = caller.organizationId;
      callerRole = caller.role;
      callerProfileId = caller.profileId;
    }

    if (!maySendTemplate(body.templateId, callerRole, internal)) {
      return jsonResponse(403, {
        error:
          `Forbidden — the "${body.templateId}" email cannot be sent by ` +
          `${callerRole ? `the "${callerRole}" role` : "this caller"}.`,
      });
    }

    // ── Sender identity ────────────────────────────────────────────────────
    // For a user caller this is the VERIFIED membership organization — never
    // the request body, which would let one tenant send mail signed with
    // another tenant's name. For an internal caller it is the org that caller
    // named, which is safe because holding the service-role key already means
    // full database access.
    //
    // A failed lookup degrades to the PLATFORM default, which is generic. It
    // does not degrade to a tenant.
    let orgBranding: Record<string, string> | undefined;
    try {
      const { data: org } = organizationId
        ? await supabase
            .from("organizations")
            .select("display_name, organization_branding(app_name, support_email, support_phone, website_url, primary_color, accent_color, logo_url)")
            .eq("id", organizationId)
            .maybeSingle()
        : { data: null };
      if (org) {
        const b = (Array.isArray(org.organization_branding)
          ? org.organization_branding[0]
          : org.organization_branding) as Record<string, string> | null;
        orgBranding = {
          orgName: (b?.app_name || org.display_name || "") as string,
          supportEmail: (b?.support_email ?? "") as string,
          supportPhone: (b?.support_phone ?? "") as string,
          websiteUrl: (b?.website_url ?? "") as string,
          primaryColor: (b?.primary_color ?? "") as string,
          accentColor: (b?.accent_color ?? "") as string,
          logoUrl: (b?.logo_url ?? "") as string,
        };
      }
    } catch (e) {
      console.warn("[send-email] branding lookup failed; using platform default:", e);
    }

    const mail = renderEmail(body.templateId, body.params ?? {}, body.branch, orgBranding);

    // ── Phase 6: per-organization sender, platform by default ──────────────
    // The organization is taken from the VERIFIED caller, never from the
    // request body — a body-supplied org would let one tenant send under
    // another's verified sender identity.
    //
    // resolveEmailCredentials falls back to the platform's Brevo account
    // whenever the organization has no integration, has chosen 'platform', or
    // has a custom one that is unverified or incomplete. So this call behaves
    // exactly as it did before for every existing tenant, ARK included.
    const creds = await resolveEmailCredentials(supabase, organizationId);

    const result = await sendBrevoEmail(
      {
        to: [{ email: body.to.email.trim().toLowerCase(), name: body.to.name }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: [body.templateId],
        attachment: Array.isArray(body.attachment) ? body.attachment : undefined,
      },
      // Every send is recorded — see _shared/email-log.ts.
      {
        db: supabase,
        organizationId,
        template: body.templateId,
        recipientName: body.to.name,
        contextType: body.contextType,
        contextId: body.contextId,
        createdBy: callerProfileId ?? undefined,
        extraPayload: body.logPayload,
      },
      // Only pass an override for a genuinely custom sender; otherwise let
      // sendBrevoEmail read the platform env exactly as it always has.
      creds.mode === "custom"
        ? { apiKey: creds.apiKey, senderEmail: creds.senderEmail, senderName: creds.senderName }
        : undefined,
    );

    await recordIntegrationUse(
      supabase, organizationId, "email", result.ok, result.error,
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
