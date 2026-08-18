// ──────────────────────────────────────────────────────────────────────────────
// BILLING LIFECYCLE (cron)
//
// Runs run_billing_lifecycle() — trial expiry, renewal due, grace expiry →
// suspension, reminders — then sends the emails those transitions imply.
//
// The state machine lives in SQL and is idempotent; this function is the
// scheduler plus the outbound email that Postgres cannot send. Splitting it
// that way means every transition is testable without a mail server, and a
// mail outage cannot corrupt subscription state.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Origin for links in billing emails. Matches provisioning-worker's default so
 * both functions point at the deployment that actually answers.
 */
const SITE_ORIGIN = (
  Deno.env.get("PUBLIC_SITE_URL") ?? "https://smart-ark-main.vercel.app"
).replace(/\/+$/, "");

/** Billing events that should reach the customer, and their email template. */
const EMAIL_FOR: Record<string, string> = {
  "trial.ending_soon":      "trial-ending",
  "trial.expired":          "trial-expired",
  "renewal.reminder":       "renewal-reminder",
  "payment.failed":         "payment-failed",
  "subscription.activated": "subscription-activated",
  "subscription.suspended": "subscription-suspended",
  "subscription.restored":  "subscription-restored",
  "invoice.issued":         "invoice",
};

async function billingAdminEmail(
  db: Db, org: string,
): Promise<{ email: string; name: string } | null> {
  const { data: profile } = await db
    .from("billing_profiles")
    .select("billing_email, legal_name")
    .eq("organization_id", org)
    .maybeSingle();
  if (profile?.billing_email) {
    return { email: profile.billing_email, name: profile.legal_name ?? "there" };
  }
  // Fall back to the organization's first staff member — its admin.
  const { data: admin } = await db
    .from("profiles")
    .select("email, name")
    .eq("organization_id", org)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return admin?.email ? { email: admin.email, name: admin.name ?? "there" } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db: Db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Cron secret OR an active platform user. Not an open endpoint: running the
  // sweep on demand can suspend organizations.
  const cronKey = req.headers.get("x-cron-key");
  if (!cronKey || cronKey !== Deno.env.get("CRON_SECRET")) {
    const caller = await resolveCaller(req, db);
    if (!caller) return jsonResponse(401, { error: "Unauthorized" });
    const { data: pu } = await db
      .from("platform_users").select("is_active")
      .eq("user_id", caller.userId).maybeSingle();
    if (!pu?.is_active) return jsonResponse(403, { error: "Platform access required" });
  }

  try {
    const { data: result, error } = await db.rpc("run_billing_lifecycle");
    if (error) throw new Error(error.message);

    // Mail is driven off the AUDIT LOG rather than the sweep's return value,
    // so an email is never lost when the sweep and the mailer are separate
    // invocations — and a re-run mails only what is genuinely new.
    const { data: events } = await db
      .from("billing_events")
      .select("id, organization_id, event, detail")
      .in("event", Object.keys(EMAIL_FOR))
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    let sent = 0;
    let skipped = 0;
    for (const e of events ?? []) {
      const template = EMAIL_FOR[e.event];
      if (!template) continue;

      const recipient = await billingAdminEmail(db, e.organization_id);
      if (!recipient) { skipped++; continue; }

      const { error: mailErr } = await db.functions.invoke("send-email", {
        body: {
          templateId: template,
          to: recipient,
          // Service-role caller: name the tenant, since there is no membership
          // to derive it from.
          organizationId: e.organization_id,
          contextType: "billing",
          contextId: e.id,
          params: {
            detail: e.detail ?? "",
            // ABSOLUTE. This was "/admin/billing" — a relative href in an email
            // resolves against the mail client's own origin, so the button led
            // nowhere from every inbox. The template now drops a non-absolute
            // CTA rather than rendering a broken button.
            billingUrl: `${SITE_ORIGIN}/admin/billing`,
          },
        },
      });
      // Best-effort: a mail failure must never roll back a state transition
      // that has already happened in the database.
      if (mailErr) skipped++;
      else sent++;
    }

    return jsonResponse(200, { ok: true, lifecycle: result, emails: { sent, skipped } });
  } catch (e) {
    console.error("[billing-lifecycle]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
