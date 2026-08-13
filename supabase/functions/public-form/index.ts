// ─────────────────────────────────────────────────────────────────────────────
// public-form — ONE intake + notification pipeline for every public form.
//
// ┌── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────┐
// │ Storage was never the problem. Since Phase 3A the marketing site has   │
// │ inserted straight into platform_demo_requests / platform_enquiries     │
// │ from the browser under an anon INSERT policy, and those rows are still │
// │ there. NOBODY WAS EVER TOLD. No email, no WhatsApp, no console alert — │
// │ a demo request could sit unread indefinitely and the visitor got a     │
// │ "Request received" screen promising a reply.                           │
// │                                                                        │
// │ The browser also could not fix this itself: BREVO_API_KEY must never   │
// │ ship in a bundle, so the notification has to happen behind a server.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// THE ORDER MATTERS AND IS NOT NEGOTIABLE:
//
//   validate → PERSIST → respond-worthy success → notify → record each outcome
//
// The submission is committed before a single provider is contacted, and no
// provider failure can turn a stored submission into an error for the visitor.
// A Brevo outage means "saved, notification failed and recorded", never "please
// try again" — because trying again would store the enquiry twice.
//
//   POST { formType, data: {...} }
//     → { ok, submissionId, notified: { email, whatsapp }, ... }
//
// Auth: NONE. This is a public form. Which is exactly why the request body may
// name a form type and its own fields, and NOTHING else — no recipient, no
// admin id, no organization, no template, no sender.
//
// Deploy: supabase functions deploy public-form
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendBrevoEmail } from "../_shared/brevo.ts";
import { renderEmail } from "../_shared/email-templates.ts";
import {
  FORM_TYPE_DEFS, FIELD_LIMITS, MAX_PAYLOAD_BYTES,
  WHATSAPP_TEMPLATES, SENDABLE_STATUS,
  collectedFields, isValidEmail, normalizePhone, present, sanitizeText,
  type FormType,
} from "../_shared/publicForms.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

interface Recipient {
  platform_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}

/**
 * WhatsApp approval state lives in the shared contract
 * (_shared/publicForms.ts), alongside the positional parameter order it has to
 * agree with. Keeping the status here and the order there is exactly how the
 * two drifted apart the first time.
 *
 * Both campaigns are currently READY_FOR_SUBMISSION: Meta has not seen either,
 * so neither may send — and a template awaiting approval must never take a
 * form submission down with it.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const supabase: Db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── 1. Bound the input before parsing it ───────────────────────────────
    // An unauthenticated endpoint that JSON.parses an unbounded body is a
    // memory-exhaustion primitive. Read the text first, measure, then parse.
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return jsonResponse(413, { error: "Submission too large." });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return jsonResponse(400, { error: "Malformed request." });
    }

    // ── 2. Validate ────────────────────────────────────────────────────────
    const formType = String(body.formType ?? "") as FormType;
    const def = FORM_TYPE_DEFS[formType];
    if (!def) {
      return jsonResponse(400, { error: "Unknown form type." });
    }

    const input = (body.data ?? {}) as Record<string, unknown>;

    // Only registry-declared fields survive. Anything else the caller invented
    // — `organization_id`, `recipient`, `status`, `assigned_to` — is dropped
    // here rather than defended against downstream.
    const clean: Record<string, string> = {};
    for (const field of def.fields) {
      const v = sanitizeText(input[field], FIELD_LIMITS[field] ?? 200);
      if (v) clean[field] = v;
    }

    if (!clean.name) return jsonResponse(422, { error: "Please enter your name." });
    if (!isValidEmail(clean.email ?? "")) {
      return jsonResponse(422, { error: "Please enter a valid email address." });
    }
    clean.email = clean.email.toLowerCase();
    if (def.table === "platform_enquiries" && !clean.message) {
      return jsonResponse(422, { error: "Please enter a message." });
    }

    const submitterPhone = normalizePhone(clean.phone);

    // ── 3. Rate limit ──────────────────────────────────────────────────────
    // Per email address, on the submission table itself — no extra
    // infrastructure, and it survives a function restart because the evidence
    // is the data. Deliberately generous: a real person correcting a typo and
    // resubmitting must not be blocked, a script must not get thousands.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: recent } = await supabase
      .from(def.table)
      .select("id", { count: "exact", head: true })
      .eq("email", clean.email)
      .gte("created_at", since);
    if ((recent ?? 0) >= 5) {
      return jsonResponse(429, {
        error: "We already have your recent submission. Please give us a little time to reply.",
      });
    }

    // ── 4. PERSIST — before any provider is touched ────────────────────────
    const utm = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
    const source = sanitizeText(body.source ?? "website", 40) || "website";

    const row: Record<string, unknown> =
      def.table === "platform_demo_requests"
        ? {
            name: clean.name, email: clean.email, phone: clean.phone ?? null,
            organization_name: clean.organization_name ?? null,
            institution_type: clean.institution_type ?? null,
            student_count: clean.student_count ?? null,
            // An invalid date must not fail the insert; the enquiry matters
            // more than the preference.
            preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(clean.preferred_date ?? "")
              ? clean.preferred_date : null,
            preferred_time: clean.preferred_time ?? null,
            message: clean.message ?? null,
            source, utm,
          }
        : {
            kind: def.kind, name: clean.name, email: clean.email,
            phone: clean.phone ?? null, subject: clean.subject ?? null,
            message: clean.message, metadata: { ...utm, source, form_type: formType },
          };

    const { data: saved, error: saveErr } = await supabase
      .from(def.table).insert(row).select("id, created_at").single();

    // The ONLY condition under which the visitor sees a failure.
    if (saveErr || !saved) {
      console.error("[public-form] persist failed:", saveErr?.message);
      return jsonResponse(500, {
        error: "We could not save your submission. Please try again.",
      });
    }

    const submissionId = String(saved.id);
    const submittedAt = new Date(String(saved.created_at ?? Date.now())).toISOString();

    // ── 5. Everything below is BEST EFFORT ─────────────────────────────────
    // The submission is committed. From here a thrown error would turn a
    // saved enquiry into a visitor-facing failure and a duplicate on retry,
    // so the whole notification pass is wrapped and its outcome is data.
    const notified = { adminEmail: 0, adminWhatsapp: 0, submitterEmail: 0, submitterWhatsapp: 0 };
    try {
      await notify(supabase, {
        formType, submissionId, submittedAt, source, clean, submitterPhone, notified,
      });
    } catch (e) {
      // Recorded, never swallowed — and never shown to the visitor.
      console.error("[public-form] notification pass failed:", (e as Error).message);
      await ledger(supabase, {
        formType, submissionId, table: FORM_TYPE_DEFS[formType].table,
        audience: "platform_super_admin", recipientRef: "pipeline",
        recipientName: null, channel: "email", template: "platform-lead-alert",
        provider: "internal", status: "failed", error: (e as Error).message,
      });
    }

    return jsonResponse(200, {
      ok: true,
      submissionId,
      formType,
      // Counts only. The visitor learns nothing about who was alerted, and a
      // zero here is not an error they can act on.
      notified,
    });
  } catch (e) {
    console.error("[public-form] unhandled:", (e as Error).message);
    return jsonResponse(500, { error: "Something went wrong. Please try again." });
  }
});

// ── The notification pass ───────────────────────────────────────────────────

async function notify(
  supabase: Db,
  ctx: {
    formType: FormType; submissionId: string; submittedAt: string; source: string;
    clean: Record<string, string>; submitterPhone: string | null;
    notified: { adminEmail: number; adminWhatsapp: number; submitterEmail: number; submitterWhatsapp: number };
  },
): Promise<void> {
  const def = FORM_TYPE_DEFS[ctx.formType];
  const brand = await platformBranding(supabase);

  // ── RECIPIENTS ARE RESOLVED SERVER-SIDE, ALWAYS AS A SET ────────────────
  // Not one admin. Not the first. Every active holder of the capability, from
  // the authoritative platform_users table. Adding a twentieth super admin is
  // an INSERT, not a deploy.
  const { data: recipientRows, error: recErr } = await supabase.rpc("platform_form_recipients");
  if (recErr) throw new Error(`recipient resolution failed: ${recErr.message}`);
  const recipients = (recipientRows ?? []) as Recipient[];

  const fields = collectedFields(ctx.formType, ctx.clean);
  const consoleUrl = `${Deno.env.get("PLATFORM_CONSOLE_URL") ?? ""}`.replace(/\/+$/, "");
  const reviewUrl = consoleUrl ? `${consoleUrl}/platform/leads` : undefined;

  // ── 5a. Admin email — INDIVIDUALLY, never a shared To or Cc ─────────────
  // One send per admin. A combined recipient list would disclose every
  // platform administrator's personal address to all the others, and to
  // anyone who later forwards the mail.
  for (const r of recipients) {
    if (!r.email || !isValidEmail(r.email)) {
      await ledger(supabase, {
        formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
        audience: "platform_super_admin", recipientRef: r.platform_user_id,
        recipientName: r.name, channel: "email", template: "platform-lead-alert",
        provider: "brevo", status: "skipped", error: "no usable email address",
      });
      continue;
    }

    // Claim the idempotency slot FIRST. If this row already exists the admin
    // has been told and a retry must not tell them twice.
    const claimed = await ledger(supabase, {
      formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
      audience: "platform_super_admin", recipientRef: r.platform_user_id,
      recipientName: r.name, channel: "email", template: "platform-lead-alert",
      provider: "brevo", status: "pending", error: null,
    });
    if (!claimed) continue; // already notified

    const mail = renderEmail(
      "platform-lead-alert",
      { formLabel: def.label, fields, submittedAt: ctx.submittedAt, source: ctx.source, reviewUrl },
      undefined,
      brand,
    );
    const res = await sendBrevoEmail({
      to: [{ email: r.email, name: r.name ?? undefined }],
      subject: `${mail.subject} — ${present(ctx.clean.name)}${
        ctx.clean.organization_name ? ` — ${ctx.clean.organization_name}` : ""
      }`,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: ["platform-lead-alert", ctx.formType],
      // So an admin can reply straight to the enquirer. Safe: the address was
      // validated and stripped of control characters, so it cannot inject a
      // header.
      replyTo: { email: ctx.clean.email, name: ctx.clean.name },
    });
    await settle(supabase, ctx.submissionId, r.platform_user_id, "email", res);
    if (res.ok) ctx.notified.adminEmail += 1;
  }

  // ── 5b. Admin WhatsApp — one message per admin who has a number ─────────
  // A missing number for one admin cannot suppress the others; the loop
  // records a skip and continues.
  for (const r of recipients) {
    const phone = normalizePhone(r.phone);
    if (!phone) {
      await ledger(supabase, {
        formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
        audience: "platform_super_admin", recipientRef: r.platform_user_id,
        recipientName: r.name, channel: "whatsapp", template: def.adminCampaign,
        provider: "aisensy", status: "skipped", error: "no WhatsApp number on file",
      });
      continue;
    }
    const claimed = await ledger(supabase, {
      formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
      audience: "platform_super_admin", recipientRef: r.platform_user_id,
      recipientName: r.name, channel: "whatsapp", template: def.adminCampaign,
      provider: "aisensy", status: "pending", error: null,
    });
    if (!claimed) continue;

    const delivered = await sendWhatsapp(supabase, {
      submissionId: ctx.submissionId, recipientRef: r.platform_user_id,
      campaign: def.adminCampaign, phone, userName: r.name ?? "Team",
      // {{1}} form_type {{2}} name {{3}} phone {{4}} email {{5}} organization
      // {{6}} platform_name — ascending, each used once, none empty.
      params: [
        def.label,
        present(ctx.clean.name),
        present(ctx.clean.phone),
        present(ctx.clean.email),
        present(ctx.clean.organization_name),
        brand.orgName,
      ],
    });
    if (delivered) ctx.notified.adminWhatsapp += 1;
  }

  // ── 5c. The visitor's confirmation ─────────────────────────────────────
  // Only the demo form collects scheduling preferences, so only the demo
  // acknowledgement mentions them.
  const details =
    ctx.formType === "demo"
      ? [
          ...(ctx.clean.preferred_date ? [{ label: "Preferred date", value: ctx.clean.preferred_date }] : []),
          ...(ctx.clean.preferred_time ? [{ label: "Preferred time", value: ctx.clean.preferred_time }] : []),
        ]
      : [];

  const ackClaimed = await ledger(supabase, {
    formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
    audience: "form_submitter", recipientRef: ctx.clean.email,
    recipientName: ctx.clean.name, channel: "email", template: "public-form-ack",
    provider: "brevo", status: "pending", error: null,
  });
  if (ackClaimed) {
    const ack = renderEmail(
      "public-form-ack",
      {
        name: ctx.clean.name, formLabel: def.label, confirmation: def.confirmation,
        message: ctx.clean.message, details,
      },
      undefined,
      brand,
    );
    const res = await sendBrevoEmail({
      to: [{ email: ctx.clean.email, name: ctx.clean.name }],
      subject: ack.subject,
      htmlContent: ack.html,
      textContent: ack.text,
      tags: ["public-form-ack", ctx.formType],
    });
    await settle(supabase, ctx.submissionId, ctx.clean.email, "email", res);
    if (res.ok) ctx.notified.submitterEmail += 1;
  }

  // ── 5d. The visitor's WhatsApp ─────────────────────────────────────────
  if (ctx.submitterPhone) {
    const claimed = await ledger(supabase, {
      formType: ctx.formType, submissionId: ctx.submissionId, table: def.table,
      audience: "form_submitter", recipientRef: ctx.clean.email,
      recipientName: ctx.clean.name, channel: "whatsapp", template: def.submitterCampaign,
      provider: "aisensy", status: "pending", error: null,
    });
    if (claimed) {
      const delivered = await sendWhatsapp(supabase, {
        submissionId: ctx.submissionId, recipientRef: ctx.clean.email,
        campaign: def.submitterCampaign, phone: ctx.submitterPhone,
        userName: ctx.clean.name,
        // {{1}} name {{2}} platform_name {{3}} form_type {{4}} platform_name
        // The brand appears twice by design — greeting and sign-off. Meta
        // forbids reusing a PLACEHOLDER, not passing one value to two of them.
        params: [ctx.clean.name, brand.orgName, def.label, brand.orgName],
      });
      if (delivered) ctx.notified.submitterWhatsapp += 1;
    }
  }
}

// ── WhatsApp, through the EXISTING engine ───────────────────────────────────
//
// send-aisensy's `direct` mode is reused rather than message_queue, because
// message_queue.organization_id is NOT NULL by design and a platform marketing
// enquiry belongs to no organization. `direct` documents that it "touches
// NOTHING in the database — the caller owns its ledger row"; the ledger row is
// ours. No second WhatsApp engine is introduced.
async function sendWhatsapp(
  supabase: Db,
  a: {
    submissionId: string; recipientRef: string; campaign: string;
    phone: string; userName: string; params: string[];
  },
): Promise<boolean> {
  const def = WHATSAPP_TEMPLATES[a.campaign];
  const status = def?.status ?? "UNKNOWN";
  if (status !== SENDABLE_STATUS) {
    // An unapproved template is a known, expected state — not an outage, and
    // emphatically not a reason to fail the submission.
    await settleRaw(supabase, a.submissionId, a.recipientRef, "whatsapp", {
      status: "skipped",
      error: `template ${a.campaign} is ${status}, not ${SENDABLE_STATUS} — awaiting Meta approval`,
      providerMessageId: null,
    });
    return false;
  }

  // ── The parameter count must match what Meta approved ──────────────────
  // A count mismatch is not a provider outage, it is our bug, and it surfaces
  // only on the first real send AFTER approval — the most expensive moment to
  // find it. Checked here against the declared contract so the ledger names
  // the actual cause instead of relaying a generic provider rejection.
  if (a.params.length !== def.params.length) {
    await settleRaw(supabase, a.submissionId, a.recipientRef, "whatsapp", {
      status: "failed",
      error:
        `parameter count mismatch: built ${a.params.length}, ` +
        `${a.campaign} declares ${def.params.length} (${def.params.join(", ")})`,
      providerMessageId: null,
    });
    return false;
  }

  // Never let a blank reach the provider: Meta rejects an empty positional
  // parameter, and a rejected send looks like a provider fault.
  if (a.params.some((p) => !String(p ?? "").trim())) {
    await settleRaw(supabase, a.submissionId, a.recipientRef, "whatsapp", {
      status: "failed", error: "refused to send with an empty template parameter",
      providerMessageId: null,
    });
    return false;
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-aisensy", {
      body: {
        direct: {
          campaignName: a.campaign, destination: a.phone,
          userName: a.userName, templateParams: a.params,
          source: "Smart ARK Public Form",
        },
      },
    });
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { ok?: boolean; error?: string; providerMessageId?: string };
    await settleRaw(supabase, a.submissionId, a.recipientRef, "whatsapp", {
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : (r.error ?? "provider rejected the message"),
      providerMessageId: r.providerMessageId ?? null,
    });
    return Boolean(r.ok);
  } catch (e) {
    await settleRaw(supabase, a.submissionId, a.recipientRef, "whatsapp", {
      status: "failed", error: (e as Error).message, providerMessageId: null,
    });
    return false;
  }
}

// ── Ledger ──────────────────────────────────────────────────────────────────

/**
 * Claim the (submission, recipient, channel) slot.
 *
 * Returns false when the unique index rejects the insert — meaning this
 * recipient has already been notified on this channel for this submission, and
 * the caller must not send again. The database decides, not a prior SELECT,
 * because two concurrent retries would both pass a read-then-write check.
 */
async function ledger(
  supabase: Db,
  e: {
    formType: string; submissionId: string; table: string;
    audience: "platform_super_admin" | "form_submitter";
    recipientRef: string; recipientName: string | null;
    channel: "email" | "whatsapp"; template: string; provider: string;
    status: "pending" | "sent" | "failed" | "skipped"; error: string | null;
  },
): Promise<boolean> {
  const { error } = await supabase.from("platform_form_notifications").insert({
    form_type: e.formType,
    submission_id: e.submissionId,
    submission_table: e.table,
    audience: e.audience,
    recipient_ref: e.recipientRef,
    recipient_name: e.recipientName,
    channel: e.channel,
    template: e.template,
    provider: e.provider,
    status: e.status,
    error: e.error,
    sent_at: e.status === "sent" ? new Date().toISOString() : null,
  });
  if (!error) return true;
  // 23505 = unique_violation: already claimed. Anything else is a real fault
  // and is logged rather than mistaken for a duplicate.
  if (!String(error.code ?? "").includes("23505")) {
    console.error("[public-form] ledger insert failed:", error.message);
  }
  return false;
}

async function settle(
  supabase: Db,
  submissionId: string,
  recipientRef: string,
  channel: "email" | "whatsapp",
  res: { ok: boolean; status: string; messageId?: string | null; error?: string | null },
): Promise<void> {
  await settleRaw(supabase, submissionId, recipientRef, channel, {
    // Brevo's own "skipped" (secrets not configured) is preserved as skipped
    // rather than reported as a failure — an unconfigured provider and a
    // broken one need different responses from an operator.
    status: res.ok ? "sent" : res.status === "skipped" ? "skipped" : "failed",
    error: res.error ?? (res.status === "skipped" ? "email provider not configured" : null),
    providerMessageId: res.messageId ?? null,
  });
}

async function settleRaw(
  supabase: Db,
  submissionId: string,
  recipientRef: string,
  channel: "email" | "whatsapp",
  outcome: { status: string; error: string | null; providerMessageId: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("platform_form_notifications")
    .update({
      status: outcome.status,
      error: outcome.error,
      provider_message_id: outcome.providerMessageId,
      sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("submission_id", submissionId)
    .eq("recipient_ref", recipientRef)
    .eq("channel", channel);
  if (error) console.error("[public-form] ledger settle failed:", error.message);
}

// ── Branding ────────────────────────────────────────────────────────────────

/**
 * The PLATFORM's brand, from platform_settings.
 *
 * These forms are on the Smart ARK marketing site and belong to no tenant, so
 * no organization's branding is loaded — which is the guarantee that a visitor
 * to the platform site is never signed off in a customer institute's name, and
 * that one tenant's identity can never appear on another's mail.
 */
async function platformBranding(supabase: Db): Promise<Record<string, string>> {
  const fallback = { orgName: "Smart ARK", productName: "Smart ARK" };
  try {
    const { data } = await supabase
      .from("platform_settings").select("value").eq("key", "platform_branding").maybeSingle();
    const v = (data?.value ?? {}) as Record<string, unknown>;
    const name = String(v.name ?? "").trim();
    return {
      ...fallback,
      ...(name ? { orgName: name, productName: name } : {}),
      ...(v.support_email ? { supportEmail: String(v.support_email) } : {}),
      ...(v.website_url ? { websiteUrl: String(v.website_url) } : {}),
      ...(v.logo_url ? { logoUrl: String(v.logo_url) } : {}),
    };
  } catch {
    return fallback;
  }
}
