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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
    const token = authHeader.replace("Bearer ", "");
    let callerUserId: string | null = null;
    try {
      callerUserId = JSON.parse(atob(token.split(".")[1])).sub || null;
    } catch {
      /* invalid jwt */
    }
    if (!callerUserId) return jsonResponse(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (
      !callerProfile ||
      !["management", "admin"].includes(callerProfile.role as string)
    ) {
      return jsonResponse(403, {
        error: "Forbidden — management or admin role required",
      });
    }

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
    const result = await sendBrevoEmail({
      to: [{ email: body.to.email.trim().toLowerCase(), name: body.to.name }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: [body.templateId],
    });

    return jsonResponse(result.ok ? 200 : 502, {
      ok: result.ok,
      status: result.status,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
