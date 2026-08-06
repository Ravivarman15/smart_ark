// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC ONBOARDING — self-service trial provisioning
//
// ┌── THIS IS THE FLOW PHASE 0 EXISTED TO MAKE SAFE ───────────────────────┐
// │ Before Phase 0, handle_new_user() gave every auth.users INSERT a       │
// │ `profiles` row with role 'teacher'. Combined with 102 `USING (true)`   │
// │ policies, opening public signup would have handed every visitor read   │
// │ access to the entire database on the first click.                      │
// │                                                                        │
// │ Phase 0 changed that: a signup with no role metadata now creates NO    │
// │ profile. So `supabase.auth.signUp()` from the browser produces an      │
// │ auth user with no profile, no membership, and therefore no claim and   │
// │ no data. It is inert until THIS function deliberately provisions it.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// Actions:
//   track_signup   record funnel entry (pre-verification)
//   provision      verified user → organization + admin profile
//   check_slug     availability, so the wizard fails before submission
//
// SECURITY MODEL
//   • provision requires a VERIFIED email — the single check that stops
//     scripted mass-provisioning with throwaway addresses.
//   • provision requires the caller to have NO existing membership — one
//     organization per account through the public funnel.
//   • Disposable-domain and slug-reservation checks run server-side; the
//     wizard's identical checks are UX, not security.
//   • Everything reuses provision_organization() from Phase 1D. No table is
//     created here, and the second-organization readiness guard still applies.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

/** Slugs reserved for platform surfaces, mirroring provision_organization(). */
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "login", "platform", "admin", "docs", "status", "mail",
  "support", "help", "blog", "demo", "smartark", "ark", "static", "assets",
  "cdn", "auth", "billing", "account", "dashboard", "portal",
]);

/**
 * Disposable-address domains. Deliberately a short, high-signal list rather
 * than an exhaustive one: a 50,000-entry blocklist has to be maintained and
 * still fails open, while these few cover the overwhelming majority of
 * throwaway signups without blocking a real institution's own domain.
 */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "sharklasers.com",
  "getnada.com", "dispostable.com", "maildrop.cc", "temp-mail.org",
]);

const slugValid = (s: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";

    // ── check_slug — unauthenticated, read-only ───────────────────────────
    if (action === "check_slug") {
      const slug = String(body?.slug ?? "").toLowerCase().trim();
      if (!slugValid(slug)) {
        return jsonResponse(200, {
          available: false,
          reason: "Use 3–40 characters: lowercase letters, digits and hyphens.",
        });
      }
      if (RESERVED_SLUGS.has(slug)) {
        return jsonResponse(200, { available: false, reason: "That address is reserved." });
      }
      const { data } = await db.from("organizations").select("id").eq("slug", slug).maybeSingle();
      return jsonResponse(200, {
        available: !data,
        reason: data ? "That address is already taken." : null,
      });
    }

    // ── track_signup — funnel telemetry, pre-verification ─────────────────
    if (action === "track_signup") {
      const email = String(body?.email ?? "").toLowerCase().trim();
      if (!email) return jsonResponse(400, { error: "email required" });

      // Upsert-by-open-signup so a visitor who restarts the wizard updates
      // their row rather than creating a second funnel record.
      const { data: existing } = await db
        .from("platform_trial_signups")
        .select("id")
        .eq("email", email)
        .not("stage", "in", '("provisioned","abandoned","failed")')
        .maybeSingle();

      const row = {
        email,
        name: body?.name ?? null,
        organization_name: body?.organizationName ?? null,
        institution_type: body?.institutionType ?? null,
        country: body?.country ?? "IN",
        plan_code: body?.planCode ?? "trial",
        stage: body?.stage ?? "started",
        utm: body?.utm ?? null,
        updated_at: new Date().toISOString(),
      };

      if (existing) await db.from("platform_trial_signups").update(row).eq("id", existing.id);
      else await db.from("platform_trial_signups").insert(row);

      return jsonResponse(200, { ok: true });
    }

    // ── provision — the real thing. Requires a verified session. ──────────
    if (action === "provision") {
      const header = req.headers.get("Authorization") ?? "";
      if (!header.startsWith("Bearer ")) {
        return jsonResponse(401, { error: "Sign in to continue" });
      }
      const token = header.slice(7).trim();

      // Signature-verified against GoTrue — never a local decode. See
      // _shared/auth.ts for why the difference matters.
      const authClient = createClient(url, anonKey);
      const { data: userRes, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userRes?.user) return jsonResponse(401, { error: "Invalid session" });

      const user = userRes.user;

      // THE GATE. Without a verified email, a script provisions unlimited
      // organizations with throwaway addresses and the readiness guard is the
      // only thing between us and an unusable database.
      if (!user.email_confirmed_at) {
        return jsonResponse(403, {
          error: "Verify your email address before creating your organization.",
          code: "email_unverified",
        });
      }

      const domain = (user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
      if (DISPOSABLE.has(domain)) {
        return jsonResponse(403, { error: "Please sign up with your institution's email address." });
      }

      // One organization per account through the public funnel. Additional
      // organizations are a sales-assisted action in the control plane, where
      // there is a human and an audit trail.
      const { data: existingMembership } = await db
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (existingMembership) {
        return jsonResponse(409, {
          error: "This account already belongs to an organization.",
          organizationId: existingMembership.organization_id,
        });
      }

      const slug = String(body?.slug ?? "").toLowerCase().trim();
      const legalName = String(body?.legalName ?? "").trim();
      const adminName = String(body?.adminName ?? "").trim() || user.email!;

      if (!slugValid(slug) || RESERVED_SLUGS.has(slug)) {
        return jsonResponse(400, { error: "Choose a valid, available web address." });
      }
      if (!legalName) return jsonResponse(400, { error: "Organization name is required." });

      await db.from("platform_trial_signups")
        .update({ stage: "provisioning", user_id: user.id, updated_at: new Date().toISOString() })
        .eq("email", (user.email ?? "").toLowerCase());

      // Reuses the Phase 1D engine verbatim: one transaction, idempotent by
      // slug, every communication automation seeded DISABLED.
      const { data: orgId, error: provErr } = await db.rpc("provision_organization", {
        _slug: slug,
        _legal_name: legalName,
        _display_name: String(body?.displayName ?? legalName).trim(),
        _institution_type: String(body?.institutionType ?? "coaching"),
        _country: String(body?.country ?? "IN"),
        _timezone: String(body?.timezone ?? "Asia/Kolkata"),
        _currency: String(body?.currency ?? "INR"),
      });

      if (provErr || !orgId) {
        await db.from("platform_trial_signups")
          .update({ stage: "failed", failure_reason: provErr?.message ?? "unknown",
                    updated_at: new Date().toISOString() })
          .eq("email", (user.email ?? "").toLowerCase());
        // Surfaced verbatim: when the tenancy readiness guard refuses it names
        // exactly which flag is unmet, and paraphrasing would throw that away.
        return jsonResponse(400, { error: provErr?.message ?? "Provisioning failed" });
      }

      // Attach the signer-up as the organization's management user.
      const { error: adminErr } = await db.rpc("provision_organization_admin", {
        _org: orgId, _user_id: user.id, _name: adminName, _role: "management",
      });
      if (adminErr) {
        // The organization exists but has no administrator — recoverable, but
        // it must be visible rather than looking like success.
        await db.from("platform_trial_signups")
          .update({ stage: "failed", organization_id: orgId,
                    failure_reason: `admin: ${adminErr.message}`,
                    updated_at: new Date().toISOString() })
          .eq("email", (user.email ?? "").toLowerCase());
        return jsonResponse(500, {
          error: "Organization created but the administrator could not be attached. Support has been notified.",
        });
      }

      // ── Phase 4: enqueue the enrichment job ──────────────────────────
      // The synchronous call above created everything the FIRST LOGIN needs
      // (organization, branch, year, roles, standards, subjects, settings,
      // admin profile). Templates, dashboards, report presets, theme, storage
      // folders and the welcome email are queued: their absence degrades the
      // experience, it does not break it, and progress is visible while they
      // run. Registration therefore never waits on them.
      let jobId: string | null = null;
      try {
        const { data: job } = await db.rpc("enqueue_provisioning", {
          _org: orgId, _trigger: "signup", _priority: 10,   // signups jump the queue
        });
        jobId = (job as string) ?? null;

        // Kick the worker now rather than waiting up to a minute for cron —
        // a visible delay on the very first screen is worth avoiding.
        // Fire-and-forget: a failed kick just means cron picks it up.
        void db.functions.invoke("provisioning-worker", {
          body: { internal: true, maxJobs: 1 },
          headers: { "x-cron-key": Deno.env.get("CRON_SECRET") ?? "" },
        }).catch(() => undefined);
      } catch (e) {
        // Never fail the signup over the queue. The organization is already
        // usable; an un-enqueued job is recoverable from the control plane.
        console.error("[public-onboarding] enqueue failed", e);
      }

      await db.from("platform_trial_signups")
        .update({ stage: "provisioned", organization_id: orgId,
                  updated_at: new Date().toISOString() })
        .eq("email", (user.email ?? "").toLowerCase());

      await db.from("organization_audit").insert({
        organization_id: orgId,
        actor_user_id: user.id,
        action: "self_service.provision",
        detail: `Self-service trial signup by ${user.email}`,
        payload: { slug, plan: body?.planCode ?? "trial" },
      });

      return jsonResponse(200, {
        ok: true,
        organizationId: orgId,
        slug,
        provisioningJobId: jobId,
        // The client must re-authenticate to pick up the organization claim:
        // the JWT it currently holds was issued BEFORE the membership existed,
        // so it carries no organization_id and every query would return zero
        // rows until the token is refreshed.
        requiresReauth: true,
      });
    }

    return jsonResponse(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[public-onboarding]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
