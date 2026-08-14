// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM ADMIN — privileged control-plane operations
//
// Actions that cannot be done from the browser with RLS alone, because they
// either create auth users or must not be self-service:
//
//   create_organization         provision a tenant (calls provision_organization)
//   set_status                  activate / hold / suspend / archive / cancel
//   update_organization_profile platform-owned contact metadata
//   set_module                  grant or revoke one module for one tenant
//   clear_module_override       return a module to its plan default
//   bulk_modules                the same change across many tenants, one at a time
//   set_module_governance       withdraw a module platform-wide
//   request_delete              open a reviewed delete request (deletes nothing)
//   review_delete               approve or cancel one (still deletes nothing)
//   start_impersonation         mint a short-lived session AS a tenant user
//   end_impersonation           close a grant early
//   refresh_metrics             recompute the aggregate rollup
//   invite_platform_user        create a Smart ARK employee account
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
import { refuseRevoke, type Layers } from "../_shared/moduleGraph.ts";

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

/**
 * Would revoking `moduleKey` strand a module this organization is using?
 *
 * Reads the organization's own entitlement layers and resolves them with the
 * mirrored precedence, so the answer is about THIS tenant rather than about the
 * catalog in the abstract.
 *
 * Fails OPEN on a read error, and that is deliberate. This guard exists to stop
 * an operator breaking a customer by accident; it is not a security boundary —
 * capability checks above it already decided the caller may act. Turning a
 * transient database blip into "no entitlement change can be made" would take
 * the platform's own remediation tools offline during exactly the incident an
 * operator needs them for.
 */
// deno-lint-ignore no-explicit-any
async function dependencyRefusal(db: any, orgId: string, moduleKey: string) {
  const { data, error } = await db.rpc("platform_entitlement_layers", { _org: orgId });
  if (error || !data) return null;
  return refuseRevoke(data as Layers, moduleKey);
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
    //
    // Phase 9A moved the write itself into platform_set_organization_status(),
    // a SECURITY DEFINER function only service_role may execute. Three reasons
    // it could not stay as an inline UPDATE:
    //
    //   • protected-tenant acknowledgement is a transaction-local GUC, which a
    //     PostgREST call cannot set for a separate statement;
    //   • the lifecycle timestamp rules (held_at / suspended_at / archived_at)
    //     belong next to the CHECK constraint that governs them, not in three
    //     copies across the codebase;
    //   • "already in that state" must be a no-op rather than a second audit
    //     row, and knowing that requires reading the old value in the same
    //     transaction as the write.
    if (action === "set_status") {
      const { organizationId, status, reason, acknowledgeProtected } = body;
      const allowed = ["active","trialing","past_due","suspended","hold","archived","cancelled"];
      if (!organizationId || !allowed.includes(status)) {
        return jsonResponse(400, { error: `status must be one of ${allowed.join(", ")}` });
      }

      // Each destructive lifecycle state carries its own capability, so
      // "finance may pause a non-payer" does not silently also mean "finance
      // may archive a customer".
      const capFor: Record<string, string> = {
        hold: "organizations.hold",
        archived: "organizations.archive",
        cancelled: "organizations.archive",
      };
      const cap = capFor[status] ?? "organizations.manage";
      if (!need(cap)) return jsonResponse(403, { error: `${cap} required` });

      // Restoring is always organizations.manage, whatever it is restoring from.
      if (["active", "trialing"].includes(status) && !need("organizations.manage")) {
        return jsonResponse(403, { error: "organizations.manage required" });
      }

      const isDestructive = ["suspended","hold","archived","cancelled"].includes(status);
      if (isDestructive && !String(reason ?? "").trim()) {
        return jsonResponse(400, { error: "A reason is required to suspend, hold, archive or cancel." });
      }

      const { data: result, error } = await db.rpc("platform_set_organization_status", {
        _org: organizationId,
        _status: status,
        _reason: reason ?? null,
        _actor: actor.platformUserId,
        _ack: Boolean(acknowledgeProtected),
      });
      if (error) return jsonResponse(400, { error: error.message });

      // Idempotent no-op writes no audit row: a log full of "set to active"
      // entries that changed nothing is a log nobody reads.
      if (result?.changed) {
        await audit(db, actor, {
          action: `organization.${status}`, target_type: "organization",
          target_id: organizationId, organization_id: organizationId,
          detail: reason ?? null,
          payload: { from: result.from, to: status, acknowledged: Boolean(acknowledgeProtected) },
          ip_address: ip,
        });
      }
      return jsonResponse(200, { ok: true, ...result });
    }

    // ── update_organization_profile ──────────────────────────────────────
    //
    // PLATFORM metadata only. The RPC names every writable column explicitly,
    // so no payload key can reach a tenant business table however it is
    // spelled — the boundary is enforced in SQL rather than by validating a
    // list of forbidden fields here, which would be a denylist and therefore
    // wrong the first time somebody adds a column.
    if (action === "update_organization_profile") {
      if (!need("organizations.manage")) return jsonResponse(403, { error: "organizations.manage required" });
      const { organizationId, patch, expectedUpdatedAt } = body;
      if (!organizationId || !patch) return jsonResponse(400, { error: "organizationId and patch are required" });

      const { error } = await db.rpc("platform_update_organization_profile", {
        _org: organizationId, _patch: patch,
        _expected_updated_at: expectedUpdatedAt ?? null,
      });
      if (error) {
        const stale = error.message?.includes("stale_write");
        return jsonResponse(stale ? 409 : 400, {
          error: stale
            ? "This organization was changed by someone else while you had it open. Reload to see their edit before saving yours."
            : error.message,
        });
      }

      await audit(db, actor, {
        action: "organization.profile_update", target_type: "organization",
        target_id: organizationId, organization_id: organizationId,
        detail: `Updated ${Object.keys(patch).join(", ")}`,
        payload: { fields: Object.keys(patch) }, ip_address: ip,
      });
      return jsonResponse(200, { ok: true });
    }

    // ── set_module / clear_module_override ───────────────────────────────
    if (action === "set_module" || action === "clear_module_override") {
      const { organizationId, moduleKey } = body;
      if (!organizationId || !moduleKey) {
        return jsonResponse(400, { error: "organizationId and moduleKey are required" });
      }

      if (action === "clear_module_override") {
        if (!need("modules.revoke")) return jsonResponse(403, { error: "modules.revoke required" });
        const { data, error } = await db.rpc("platform_clear_module_override", {
          _org: organizationId, _module: moduleKey, _actor: actor.platformUserId,
        });
        if (error) return jsonResponse(400, { error: error.message });
        if (data?.removed) {
          await audit(db, actor, {
            action: "module.override_cleared", target_type: "module", target_id: moduleKey,
            organization_id: organizationId,
            detail: `${moduleKey} returned to the plan default`, ip_address: ip,
          });
        }
        return jsonResponse(200, { ok: true, ...data });
      }

      const enabled = Boolean(body.enabled);
      const cap = enabled ? "modules.grant" : "modules.revoke";
      if (!need(cap)) return jsonResponse(403, { error: `${cap} required` });

      // ── Dependency guard ───────────────────────────────────────────────
      // The console previews this before asking for confirmation, but a
      // preview is not a control: this endpoint is reachable directly. Both
      // sides run the same graph, and a mirror test keeps them in step.
      if (!enabled) {
        const refusal = await dependencyRefusal(db, organizationId, moduleKey);
        if (refusal) {
          return jsonResponse(409, {
            error: refusal.reason,
            code: "dependency_block",
            modules: refusal.modules,
          });
        }
      }

      const { data, error } = await db.rpc("platform_set_module_entitlement", {
        _org: organizationId, _module: moduleKey, _enabled: enabled,
        _reason: body.reason ?? "sales_override", _actor: actor.platformUserId,
        _expires_at: body.expiresAt ?? null, _batch: null,
      });
      if (error) return jsonResponse(400, { error: error.message });

      if (data?.changed) {
        await audit(db, actor, {
          action: enabled ? "module.granted" : "module.revoked",
          target_type: "module", target_id: moduleKey, organization_id: organizationId,
          detail: body.note ?? null,
          payload: { reason: body.reason ?? "sales_override", expiresAt: body.expiresAt ?? null },
          ip_address: ip,
        });
      }
      return jsonResponse(200, { ok: true, ...data });
    }

    // ── bulk_modules ─────────────────────────────────────────────────────
    //
    // Never one statement across many organizations. Each tenant is applied
    // individually so a protected organization can be refused without aborting
    // the other 22, and so every affected customer gets its own audit row —
    // "we changed 23 schools" is not an auditable record of anything.
    if (action === "bulk_modules") {
      if (!need("modules.bulk")) return jsonResponse(403, { error: "modules.bulk required" });

      const { organizationIds, moduleKey, enabled, reason, expiresAt, note } = body;
      if (!Array.isArray(organizationIds) || organizationIds.length === 0 || !moduleKey) {
        return jsonResponse(400, { error: "organizationIds[] and moduleKey are required" });
      }
      if (organizationIds.length > 200) {
        return jsonResponse(400, { error: "Refusing a bulk change over 200 organizations in one call." });
      }
      if (!String(note ?? "").trim()) {
        return jsonResponse(400, { error: "A reason note is required for bulk entitlement changes." });
      }

      const batchId = crypto.randomUUID();
      const results: { organizationId: string; ok: boolean; skipped?: string; changed?: boolean }[] = [];

      // Protected tenants are excluded from bulk operations outright. Reaching
      // ARK requires opening ARK.
      const { data: protectedRows } = await db
        .from("organization_protections")
        .select("organization_id")
        .in("organization_id", organizationIds)
        .eq("block_bulk", true);
      const blocked = new Set((protectedRows ?? []).map((r: { organization_id: string }) => r.organization_id));

      for (const orgId of organizationIds) {
        if (blocked.has(orgId)) {
          results.push({ organizationId: orgId, ok: false, skipped: "protected organization" });
          continue;
        }
        // Dependency safety is per organization, not per operation: the same
        // bulk revoke can be harmless for one tenant and destructive for the
        // next, depending on what each has switched on. Checking once for the
        // batch would either block a safe change or wave through a breaking
        // one — so it is evaluated against each organization's own state, and
        // a refusal skips that tenant while the rest of the batch proceeds.
        if (!enabled) {
          const refusal = await dependencyRefusal(db, orgId, moduleKey);
          if (refusal) {
            results.push({ organizationId: orgId, ok: false, skipped: refusal.reason });
            continue;
          }
        }
        const { data, error } = await db.rpc("platform_set_module_entitlement", {
          _org: orgId, _module: moduleKey, _enabled: Boolean(enabled),
          _reason: reason ?? "sales_override", _actor: actor.platformUserId,
          _expires_at: expiresAt ?? null, _batch: batchId,
        });
        if (error) {
          results.push({ organizationId: orgId, ok: false, skipped: error.message });
          continue;
        }
        results.push({ organizationId: orgId, ok: true, changed: Boolean(data?.changed) });
        if (data?.changed) {
          await audit(db, actor, {
            action: enabled ? "module.granted" : "module.revoked",
            target_type: "module", target_id: moduleKey, organization_id: orgId,
            detail: note, payload: { batchId, bulk: true }, ip_address: ip,
          });
        }
      }

      await audit(db, actor, {
        action: "module.bulk", target_type: "module", target_id: moduleKey,
        detail: `${enabled ? "Granted" : "Revoked"} ${moduleKey} across ${results.filter((r) => r.ok).length}/${results.length} organizations`,
        payload: { batchId, note, results }, ip_address: ip,
      });

      return jsonResponse(200, { ok: true, batchId, results });
    }

    // ── set_module_governance ────────────────────────────────────────────
    if (action === "set_module_governance") {
      if (!need("modules.govern")) return jsonResponse(403, { error: "modules.govern required" });
      const { moduleKey, available, note } = body;
      if (!moduleKey || typeof available !== "boolean") {
        return jsonResponse(400, { error: "moduleKey and available are required" });
      }
      if (!available && !String(note ?? "").trim()) {
        return jsonResponse(400, { error: "Withdrawing a module platform-wide requires a note." });
      }

      const { data, error } = await db.rpc("platform_set_module_governance", {
        _module: moduleKey, _available: available,
        _note: note ?? null, _actor: actor.platformUserId,
      });
      if (error) return jsonResponse(400, { error: error.message });

      await audit(db, actor, {
        action: available ? "module.globally_enabled" : "module.globally_withdrawn",
        target_type: "module", target_id: moduleKey, detail: note ?? null, ip_address: ip,
      });
      return jsonResponse(200, { ok: true, ...data });
    }

    // ── request_delete / review_delete ───────────────────────────────────
    //
    // Neither action deletes anything — see the PART 5 header in the Phase 9A
    // migration. Erasure across 167 tenant tables, storage objects, billing
    // records and the audit trail is not a capability this platform has, and
    // shipping a button that pretends otherwise would be the worst possible
    // outcome for a customer who clicked it.
    if (action === "request_delete") {
      if (!need("organizations.delete_request")) {
        return jsonResponse(403, { error: "organizations.delete_request required" });
      }
      const { organizationId, reason, confirmSlug } = body;
      if (!organizationId || !String(reason ?? "").trim()) {
        return jsonResponse(400, { error: "organizationId and reason are required" });
      }

      // Typed-slug confirmation is verified SERVER-side. A client-side check is
      // a UX nicety; this is the actual control.
      const { data: org } = await db
        .from("organizations").select("slug").eq("id", organizationId).maybeSingle();
      if (!org) return jsonResponse(404, { error: "No such organization" });
      if (confirmSlug !== org.slug) {
        return jsonResponse(400, { error: `Confirmation does not match. Type the slug exactly: ${org.slug}` });
      }

      const { data, error } = await db.rpc("platform_request_organization_delete", {
        _org: organizationId, _reason: String(reason).trim(),
        _actor: actor.platformUserId, _actor_email: actor.email, _cooling_days: 7,
      });
      if (error) return jsonResponse(400, { error: error.message });

      if (data?.created) {
        await audit(db, actor, {
          action: "organization.delete_requested", target_type: "organization",
          target_id: organizationId, organization_id: organizationId,
          detail: String(reason).trim(), payload: { requestId: data.requestId }, ip_address: ip,
        });
      }
      return jsonResponse(200, { ok: true, ...data });
    }

    if (action === "review_delete") {
      if (!need("organizations.review_delete")) {
        return jsonResponse(403, { error: "organizations.review_delete required" });
      }
      const { requestId, decision, note } = body;
      if (!requestId || !["approved", "cancelled"].includes(decision)) {
        return jsonResponse(400, { error: "requestId and decision (approved|cancelled) are required" });
      }

      const { data, error } = await db.rpc("platform_review_delete_request", {
        _request: requestId, _decision: decision,
        _note: note ?? null, _actor: actor.platformUserId,
      });
      if (error) return jsonResponse(400, { error: error.message });

      if (data?.changed) {
        await audit(db, actor, {
          action: `organization.delete_${decision}`, target_type: "delete_request",
          target_id: requestId, detail: note ?? null, ip_address: ip,
        });
      }
      return jsonResponse(200, { ok: true, ...data });
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
