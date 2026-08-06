// ──────────────────────────────────────────────────────────────────────────────
// VERIFIED CALLER RESOLUTION FOR EDGE FUNCTIONS
//
// Six functions previously identified their caller like this:
//
//     callerUserId = JSON.parse(atob(token.split(".")[1])).sub
//
// That reads the JWT payload WITHOUT VERIFYING THE SIGNATURE. A JWT is three
// base64 segments and only the third proves authenticity; decoding the second
// in isolation trusts whatever the caller typed. Anyone could forge
// `{"sub":"<any-uuid>"}`, base64 it, and impersonate that user.
//
// Why it has not been exploited yet: `config.toml` sets `verify_jwt = true`
// for these functions, so the Supabase platform validates the signature at the
// edge before the function runs. The atob decode is therefore reading an
// already-verified token today.
//
// It is still wrong, for three reasons:
//   1. The safety lives in a config file, not in the code. One `verify_jwt =
//      false` — added for an unrelated reason, by someone who did not know
//      this — silently converts it into full impersonation.
//   2. It gives no defence in depth. Nothing in the function itself checks.
//   3. Phase 1 makes it far worse: these functions run with the SERVICE ROLE,
//      which bypasses RLS. A forged `sub` there is cross-tenant write access.
//
// `resolveCaller()` verifies the token against GoTrue and returns the caller's
// profile. It replaces both the decode AND the follow-up profiles lookup that
// each function was doing separately, so call sites get shorter, not longer.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Caller {
  /** auth.users.id — verified, not decoded. */
  userId: string;
  /** profiles.id, or null for a principal with no staff profile. */
  profileId: string | null;
  /** profiles.role, or null when there is no staff profile. */
  role: string | null;
  /** profiles.name — several functions stamp this into audit rows. */
  name: string | null;
  email: string | null;
  /**
   * The caller's organization, derived SERVER-SIDE from organization_users.
   *
   * ┌── PHASE 1, STEP 8: NEVER TRUST organization_id FROM THE FRONTEND ───┐
   * │ Every function here runs with the SERVICE ROLE, which bypasses RLS  │
   * │ entirely. If a function took the org from the request body, any     │
   * │ authenticated user of tenant A could pass tenant B's id and read or │
   * │ write B's data with full privileges — RLS would never see it.       │
   * │                                                                     │
   * │ So the org is resolved from the verified user id against the        │
   * │ membership table. A caller cannot influence it.                     │
   * └─────────────────────────────────────────────────────────────────────┘
   */
  organizationId: string | null;
}

/**
 * Verify the Authorization bearer token and resolve the caller.
 *
 * Returns null when the header is missing/malformed or the token fails
 * verification. Callers must treat null as 401 — never as "anonymous, carry on".
 *
 * @param db a service-role client, used only for the profile lookup.
 */
export async function resolveCaller(
  req: Request,
  db: SupabaseClient,
): Promise<Caller | null> {
  const header =
    req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    console.error("[auth] SUPABASE_URL / SUPABASE_ANON_KEY not configured");
    return null;
  }

  // THE VERIFICATION. getUser(token) round-trips to GoTrue, which checks the
  // signature, the expiry and that the user still exists. A forged or expired
  // token yields an error here — which the old atob decode could never detect.
  const authClient = createClient(url, anonKey);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;

  const userId = data.user.id;
  const email = data.user.email ?? null;

  // Staff profile, if any. Absence is not an error: student and parent
  // principals authenticate successfully and hold no profiles row by design.
  // Resolve the tenant from MEMBERSHIP, never from the request. A user with
  // several memberships resolves to their default — matching exactly what
  // custom_access_token_hook puts in the JWT, so the edge function and the
  // database can never disagree about which tenant the caller is in.
  const { data: membership } = await db
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const organizationId = (membership?.organization_id as string) ?? null;

  // Scope the profile lookup to that organization. Without this, a user who is
  // staff in one org and a parent in another could resolve the wrong profile.
  let q = db.from("profiles").select("id, role, name").eq("user_id", userId);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: profile } = await q.maybeSingle();

  return {
    userId,
    profileId: (profile?.id as string) ?? null,
    role: (profile?.role as string) ?? null,
    name: (profile?.name as string) ?? null,
    email,
    organizationId,
  };
}

/**
 * Scope a PostgREST query builder to the caller's organization.
 *
 * Service-role clients bypass RLS, so every query in every edge function needs
 * this. It is a function rather than a convention because a convention is a
 * thing people forget, and forgetting it here is a cross-tenant read.
 *
 * Usage:
 *   const { data } = await scoped(db.from("students").select("*"), ctx)
 *                      .eq("id", studentId).maybeSingle();
 */
// deno-lint-ignore no-explicit-any
export function scoped<T extends { eq: (c: string, v: unknown) => any }>(
  query: T,
  caller: Caller,
): T {
  if (!caller.organizationId) {
    throw new Error(
      "[auth] Caller has no organization — refusing to run an unscoped " +
        "service-role query. This would read across every tenant.",
    );
  }
  return query.eq("organization_id", caller.organizationId) as T;
}

/**
 * Resolve the caller and assert one of `roles`.
 *
 * Returns a discriminated result rather than throwing so call sites keep their
 * existing `return jsonResponse(...)` shape and their own error copy.
 */
export async function requireRole(
  req: Request,
  db: SupabaseClient,
  roles: string[],
): Promise<
  | { ok: true; caller: Caller }
  | { ok: false; status: 401 | 403; error: string }
> {
  const caller = await resolveCaller(req, db);
  if (!caller) return { ok: false, status: 401, error: "Unauthorized" };
  if (!caller.role || !roles.includes(caller.role)) {
    return {
      ok: false,
      status: 403,
      error: `Forbidden — ${roles.join(" or ")} role required`,
    };
  }
  return { ok: true, caller };
}
