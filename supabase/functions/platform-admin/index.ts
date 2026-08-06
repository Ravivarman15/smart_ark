// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM ADMIN — privileged control-plane operations
//
// Actions that cannot be done from the browser with RLS alone, because they
// either create auth users or must not be self-service:
//
//   create_organization   provision a tenant (calls provision_organization)
//   set_status            suspend / activate / archive
//   start_impersonation   mint a short-lived session AS a tenant user
//   end_impersonation     close a grant early
//   refresh_metrics       recompute the aggregate rollup
//   invite_platform_user  create a Smart ARK employee account
//
// ┌── WHY IMPERSONATION LIVES HERE AND NOT IN AN RLS POLICY ───────────────┐
// │ The platform admin never gains rights. They temporarily BECOME an      │
// │ existing user of the tenant: this function mints a session for that    │
// │ user via the admin API, and every policy then applies to that user     │
// │ exactly as it always does. RLS is untouched — there is no bypass to    │
// │ misconfigure, and no policy anywhere mentions is_platform_admin().     │
// │                                                                        │
// │ The grant row is the accountability: who really acted, as whom, in     │
// │ which tenant, why, and until when.                                     │
// │                                                                        │
// │ The INSERT is done HERE rather than from the browser because           │
// │ platform_impersonation_grants deliberately has NO insert policy for    │
// │ `authenticated`. A self-service INSERT would let any platform user     │
// │ grant themselves access to any tenant, which is the whole thing we are │
// │ preventing.                                                            │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

const MAX_IMPERSONATION_MINUTES = 60;

interface PlatformActor {
  platformUserId: string;
  email: string;
  role: string;
  capabilities: Set<string>;
}

/**
 * Resolve the caller as a PLATFORM employee and load their capabilities.
 *
 * Deliberately separate from resolveCaller()'s tenant path: a platform
 * employee has no `profiles` row and no organization membership, so the tenant
 * resolution returns nothing for them. Conflating the two is how a platform
 * account would end up satisfying is_staff() inside a customer tenant.
 */
async function resolvePlatformActor(
  req: Request,
  // deno-lint-ignore no-explicit-any
  db: any,
): Promise<PlatformActor | null> {
  const caller = await resolveCaller(req, db);
  if (!caller) return null;

  const { data: pu } = await db
    .from("platform_users")
    .select("id, email, role, is_active, mfa_enrolled")
    .eq("user_id", caller.userId)
    .maybeSingle();

  if (!pu || !pu.is_active) return null;

  // MFA is a precondition, matching custom_access_token_hook. Enforcing it in
  // both places means a stolen password alone is never enough, even if the
  // hook is ever deregistered.
  if (!pu.mfa_enrolled) return null;

  const { data: caps } = await db
    .from("platform_role_capabilities")
    .select("capability")
    .eq("role", pu.role);

  return {
    platformUserId: pu.id as string,
    email: pu.email as string,
    role: pu.role as string,
    capabilities: new Set((caps ?? []).map((c: { capability: string }) => c.capability)),
  };
}

// deno-lint-ignore no-explicit-any
async function audit(db: any, actor: PlatformActor, entry: Record<string, unknown>) {
  // Best-effort: an audit write must never fail the operation it records, but
  // it must be loud in the logs if it does.
  try {
    await db.from("platform_audit_log").insert({
      platform_user_id: actor.platformUserId,
      actor_email: actor.email,
      ...entry,
    });
  } catch (e) {
    console.error("[platform-admin] AUDIT WRITE FAILED", entry, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const actor = await resolvePlatformActor(req, db);
    if (!actor) {
      // One message for "not a platform user", "inactive" and "no MFA" alike:
      // distinguishing them would confirm to an attacker which platform emails
      // exist.
      return jsonResponse(403, { error: "Platform access denied" });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";
    const need = (cap: string) => actor.capabilities.has(cap);
    const ip = req.headers.get("x-forwarded-for") ?? null;

    // ── create_organization ──────────────────────────────────────────────
    if (action === "create_organization") {
      if (!need("organizations.manage")) return jsonResponse(403, { error: "organizations.manage required" });

      const { slug, legalName, displayName, institutionType, country, timezone, currency } = body;
      if (!slug || !legalName) return jsonResponse(400, { error: "slug and legalName are required" });

      const { data, error } = await db.rpc("provision_organization", {
        _slug: String(slug).toLowerCase(),
        _legal_name: legalName,
        _display_name: displayName ?? legalName,
        _institution_type: institutionType ?? "coaching",
        _country: country ?? "IN",
        _timezone: timezone ?? "Asia/Kolkata",
        _currency: currency ?? "INR",
      });

      if (error) {
        // The readiness guard raises here when tenant isolation is incomplete.
        // Surface it verbatim: it is the most useful error in the system.
        return jsonResponse(400, { error: error.message });
      }

      await audit(db, actor, {
        action: "organization.create", target_type: "organization",
        target_id: data, organization_id: data,
        detail: `Provisioned ${slug}`, payload: { slug, legalName }, ip_address: ip,
      });
      return jsonResponse(200, { ok: true, organizationId: data });
    }

    // ── set_status ───────────────────────────────────────────────────────
    if (action === "set_status") {
      if (!need("organizations.manage")) return jsonResponse(403, { error: "organizations.manage required" });

      const { organizationId, status, reason } = body;
      const allowed = ["active", "trialing", "past_due", "suspended", "cancelled"];
      if (!organizationId || !allowed.includes(status)) {
        return jsonResponse(400, { error: `status must be one of ${allowed.join(", ")}` });
      }

      // Cancellation is a SOFT delete. Customer data is never removed by a
      // status change — every organization_id FK is ON DELETE RESTRICT, so a
      // hard delete is impossible by construction anyway.
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "suspended") patch.suspended_at = new Date().toISOString();
      if (status === "cancelled") patch.deleted_at = new Date().toISOString();
      if (status === "active") { patch.suspended_at = null; patch.deleted_at = null; }

      const { error } = await db.from("organizations").update(patch).eq("id", organizationId);
      if (error) return jsonResponse(400, { error: error.message });

      await audit(db, actor, {
        action: `organization.${status}`, target_type: "organization",
        target_id: organizationId, organization_id: organizationId,
        detail: reason ?? null, ip_address: ip,
      });
      return jsonResponse(200, { ok: true });
    }

    // ── start_impersonation ──────────────────────────────────────────────
    if (action === "start_impersonation") {
      if (!need("impersonate")) return jsonResponse(403, { error: "impersonate capability required" });

      const { organizationId, targetUserId, reason, ticketRef, minutes } = body;
      if (!organizationId || !targetUserId) {
        return jsonResponse(400, { error: "organizationId and targetUserId are required" });
      }
      if (!reason || !String(reason).trim()) {
        return jsonResponse(400, { error: "A reason is required for impersonation" });
      }

      const mins = Math.min(Number(minutes) || 30, MAX_IMPERSONATION_MINUTES);

      // The target MUST be an active member of the named organization.
      // Without this check a platform user could name any auth user at all and
      // assume their identity in whichever tenant they claimed.
      const { data: membership } = await db
        .from("organization_users")
        .select("id, principal_kind")
        .eq("organization_id", organizationId)
        .eq("user_id", targetUserId)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) {
        return jsonResponse(400, { error: "Target user is not an active member of that organization" });
      }

      // Refuse to impersonate another platform employee — that would let a
      // support account escalate to owner.
      const { data: targetIsPlatform } = await db
        .from("platform_users").select("id").eq("user_id", targetUserId).maybeSingle();
      if (targetIsPlatform) {
        return jsonResponse(403, { error: "Refusing to impersonate a platform user" });
      }

      const { data: profile } = await db
        .from("profiles").select("id")
        .eq("user_id", targetUserId).eq("organization_id", organizationId).maybeSingle();

      const expiresAt = new Date(Date.now() + mins * 60_000).toISOString();
      const { data: grant, error: grantErr } = await db
        .from("platform_impersonation_grants")
        .insert({
          platform_user_id: actor.platformUserId,
          organization_id: organizationId,
          target_user_id: targetUserId,
          target_profile_id: profile?.id ?? null,
          reason: String(reason).trim(),
          ticket_ref: ticketRef ?? null,
          customer_consent: Boolean(body?.customerConsent),
          expires_at: expiresAt,
          ip_address: ip,
        })
        .select("id")
        .single();
      if (grantErr) return jsonResponse(400, { error: grantErr.message });

      // Mint a session AS the target user. generateLink does NOT send mail —
      // it returns the verification token, which the control plane exchanges
      // for a session in a separate browser context.
      const { data: target } = await db.auth.admin.getUserById(targetUserId);
      if (!target?.user?.email) {
        return jsonResponse(400, { error: "Target user has no email; cannot mint a session" });
      }

      const { data: link, error: linkErr } = await db.auth.admin.generateLink({
        type: "magiclink",
        email: target.user.email,
      });
      if (linkErr || !link?.properties?.hashed_token) {
        return jsonResponse(500, { error: `Could not mint session: ${linkErr?.message ?? "no token"}` });
      }

      await audit(db, actor, {
        action: "impersonation.start", target_type: "impersonation",
        target_id: grant.id, organization_id: organizationId,
        detail: String(reason).trim(),
        payload: { targetUserId, minutes: mins, ticketRef: ticketRef ?? null,
                   consent: Boolean(body?.customerConsent) },
        ip_address: ip,
      });

      return jsonResponse(200, {
        ok: true,
        grantId: grant.id,
        expiresAt,
        // Exchanged client-side via supabase.auth.verifyOtp({ type: 'magiclink' }).
        // Deliberately not a session object: the control-plane tab must keep
        // its OWN platform session, so the exchange happens in a separate
        // context and the two identities never share storage.
        tokenHash: link.properties.hashed_token,
        email: target.user.email,
      });
    }

    // ── end_impersonation ────────────────────────────────────────────────
    if (action === "end_impersonation") {
      const { grantId, reason } = body;
      if (!grantId) return jsonResponse(400, { error: "grantId is required" });

      const { error } = await db
        .from("platform_impersonation_grants")
        .update({ ended_at: new Date().toISOString(), ended_reason: reason ?? "manual" })
        .eq("id", grantId)
        .eq("platform_user_id", actor.platformUserId)
        .is("ended_at", null);
      if (error) return jsonResponse(400, { error: error.message });

      await audit(db, actor, {
        action: "impersonation.end", target_type: "impersonation",
        target_id: grantId, detail: reason ?? "manual", ip_address: ip,
      });
      return jsonResponse(200, { ok: true });
    }

    // ── refresh_metrics ──────────────────────────────────────────────────
    if (action === "refresh_metrics") {
      if (!need("usage.read")) return jsonResponse(403, { error: "usage.read required" });
      const { data, error } = await db.rpc("refresh_organization_metrics", {
        _org: body?.organizationId ?? null,
      });
      if (error) return jsonResponse(400, { error: error.message });
      return jsonResponse(200, { ok: true, organizations: data });
    }

    // ── invite_platform_user ─────────────────────────────────────────────
    if (action === "invite_platform_user") {
      if (!need("platform.users.manage")) {
        return jsonResponse(403, { error: "platform.users.manage required" });
      }
      const { email, name, role } = body;
      const roles = ["owner","admin","finance","support","sales","customer_success","auditor"];
      if (!email || !name || !roles.includes(role)) {
        return jsonResponse(400, { error: `email, name and role (${roles.join("|")}) are required` });
      }

      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { name, platform: true },
      });
      if (createErr || !created?.user) {
        return jsonResponse(400, { error: createErr?.message ?? "Could not create user" });
      }

      const { error: puErr } = await db.from("platform_users").insert({
        user_id: created.user.id, email, name, role,
        created_by: actor.platformUserId,
        // mfa_enrolled stays FALSE: the account cannot obtain a platform claim
        // until the employee enrols a factor. Invitation must never be the
        // same thing as access.
        mfa_enrolled: false,
      });
      if (puErr) return jsonResponse(400, { error: puErr.message });

      await audit(db, actor, {
        action: "platform_user.invite", target_type: "platform_user",
        target_id: created.user.id, detail: `${name} <${email}> as ${role}`, ip_address: ip,
      });
      return jsonResponse(200, {
        ok: true, userId: created.user.id,
        note: "MFA enrolment is required before this account can access the platform.",
      });
    }

    return jsonResponse(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[platform-admin]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
