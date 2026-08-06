// ── Edge function: verify-credentials ────────────────────────────────────────
//
// THE CREDENTIAL VERIFICATION GATE. Before any "Send Staff/Student ID/Password"
// WhatsApp goes out, the client calls this function. It does NOT just check that
// an account exists — it PROVES the credentials can actually log in by performing
// a real `signInWithPassword` against Supabase Auth with the anon key. Only a
// `verified: true` response (with a login-proven username + temp password) lets
// the client enqueue the credential message. This kills the "credentials don't
// work / password mismatch" class of support tickets.
//
// WHY SERVER-SIDE ONLY:
//   • auth.admin.* (read user, rotate password) needs the service-role key.
//   • The login proof uses the anon key server-side so no secret is shipped.
//
// ACTIONS (body.subject):
//   • "staff"   — resolve profile → auth user → rotate to a fresh temp password
//                 → RE-LOGIN with it to prove it works → return credentials.
//   • "student" — BLOCKED: this system has no student authentication backend
//                 (`student_app_access` only stores feature toggles). Returns
//                 verified:false so the UI never sends a password that can't log
//                 in. Implement a student/parent auth model first.
//
// REQUEST: { subject: "staff"|"student", profileId?, email?, studentId?, loginUrl? }
// RESPONSE (staff, success):
//   { verified:true, subject:"staff", username, password, authEmail, profileId,
//     userId, loginVerified:true }
// RESPONSE (failure): { verified:false, reason, message }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireRole } from "../_shared/auth.ts";

// Readable 14-char alphanumeric temp password (no ambiguous glyphs, no special
// chars — mirrors invite-staff's generator; special chars break copy/paste from
// WhatsApp and HTML-escaped email).
const generateTempPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits)];
  for (let i = chars.length; i < 14; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

type Db = ReturnType<typeof createClient>;

const audit = async (db: Db, action: string, payload: Record<string, unknown>, actorName?: string) => {
  try {
    await db.from("comms_audit").insert({
      entity_type: "credential",
      action,
      actor_name: actorName ?? "verify-credentials",
      payload,
    });
  } catch { /* best-effort */ }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(url, serviceKey);

    // Phase 0: signature-verified caller + role gate — only admin/management
    // may provision & send credentials. See _shared/auth.ts for why the
    // previous base64 decode of the JWT payload was unsafe.
    const gate = await requireRole(req, supabase, ["management", "admin"]);
    if (!gate.ok) return jsonResponse(gate.status, { error: gate.error });
    const actorName = gate.caller.name ?? undefined;

    const body = await req.json().catch(() => ({}));
    const subject: string = body?.subject;

    // ── STUDENT: verify against the Student Authentication platform ─────────
    // Requires a provisioned student_auth_accounts row (created via the
    // student-parent-accounts function / Authentication → Account Management).
    // If none exists, we BLOCK with an actionable reason (never send a password
    // that can't log in). If it exists, rotate to a known temp password and
    // PROVE the login before returning credentials.
    if (subject === "student") {
      const studentId = String(body?.studentId ?? "");
      if (!studentId) return jsonResponse(400, { error: "studentId required for student" });

      const { data: acct, error: acctErr } = await supabase
        .from("student_auth_accounts")
        .select("id, user_id, username, login_email, status")
        .eq("student_id", studentId)
        .maybeSingle();

      // Table missing (migration not applied) or no row → no account yet.
      if (acctErr && /does not exist|schema cache|relation/i.test(acctErr.message)) {
        return jsonResponse(200, {
          verified: false, subject: "student", reason: "no_student_auth_backend",
          message: "Student Authentication platform not installed. Apply 20260615_student_parent_auth.sql.",
        });
      }
      const a = acct as { id: string; user_id: string | null; username: string | null; login_email: string | null; status: string } | null;
      if (!a || !a.user_id || !a.login_email) {
        return jsonResponse(200, {
          verified: false, subject: "student", reason: "no_student_account",
          message: "This student has no login account. Create one in Authentication → Account Management, then send credentials.",
        });
      }
      if (a.status === "disabled" || a.status === "locked") {
        return jsonResponse(200, { verified: false, subject: "student", reason: a.status, message: `Student account is ${a.status}.` });
      }

      const stuTemp = generateTempPassword();
      const { error: stuPwErr } = await supabase.auth.admin.updateUserById(a.user_id, { password: stuTemp });
      if (stuPwErr) {
        return jsonResponse(200, { verified: false, subject: "student", reason: "rotate_failed", message: stuPwErr.message });
      }
      const stuAnon = createClient(url, anonKey);
      const { data: stuLogin, error: stuLoginErr } = await stuAnon.auth.signInWithPassword({ email: a.login_email, password: stuTemp });
      const stuOk = !!stuLogin?.session && !stuLoginErr;
      await stuAnon.auth.signOut().catch(() => {});
      if (!stuOk) {
        await audit(supabase, "verify_failed", { subject: "student", studentId, reason: "login_failed" }, actorName);
        return jsonResponse(200, { verified: false, subject: "student", reason: "login_failed", message: `Login validation failed: ${stuLoginErr?.message ?? ""}. Not sent.` });
      }
      await audit(supabase, "verify_ok", { subject: "student", studentId }, actorName);
      return jsonResponse(200, {
        verified: true, subject: "student", profileId: a.id, userId: a.user_id,
        username: a.username ?? a.login_email, password: stuTemp, loginVerified: true,
        loginUrl: body?.loginUrl ?? `${new URL(req.url).origin}/parent`,
      });
    }

    if (subject !== "staff") {
      return jsonResponse(400, { error: 'subject must be "staff" or "student"' });
    }

    // ── STAFF: resolve profile → auth user ─────────────────────────────────
    let pq = supabase.from("profiles").select("id, user_id, name, role, email");
    if (body?.profileId) pq = pq.eq("id", String(body.profileId));
    else if (body?.email) pq = pq.ilike("email", String(body.email).trim().toLowerCase());
    else return jsonResponse(400, { error: "profileId or email required for staff" });

    const { data: prof } = await pq.maybeSingle();
    if (!prof) {
      return jsonResponse(404, { verified: false, reason: "no_profile", message: "No staff record found." });
    }
    const profile = prof as { id: string; user_id: string | null; name: string | null; email: string | null };

    if (!profile.user_id) {
      await audit(supabase, "verify_failed", { profileId: profile.id, reason: "no_auth_account" }, actorName);
      return jsonResponse(200, {
        verified: false,
        subject: "staff",
        profileId: profile.id,
        reason: "no_auth_account",
        message: "This staff member has no login account. Invite them first (Staff Control → Invite) to create the auth login, then send credentials.",
      });
    }

    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(profile.user_id);
    if (authErr || !authData?.user?.email) {
      await audit(supabase, "verify_failed", { profileId: profile.id, reason: "orphaned_auth" }, actorName);
      return jsonResponse(200, {
        verified: false,
        subject: "staff",
        profileId: profile.id,
        reason: "orphaned_auth",
        message: "The login account is missing in auth.users (orphaned profile). Delete and re-invite the staff member.",
      });
    }
    const authEmail = authData.user.email.toLowerCase();

    // ── Rotate to a fresh, KNOWN temp password (steps 4–5) ─────────────────
    const tempPassword = generateTempPassword();
    const { error: pwErr } = await supabase.auth.admin.updateUserById(profile.user_id, { password: tempPassword });
    if (pwErr) {
      await audit(supabase, "verify_failed", { profileId: profile.id, reason: "rotate_failed", detail: pwErr.message }, actorName);
      return jsonResponse(200, { verified: false, subject: "staff", profileId: profile.id, reason: "rotate_failed", message: `Could not set a temporary password: ${pwErr.message}` });
    }

    // Keep profiles.email in lockstep with auth (self-healing).
    if (!profile.email || profile.email.toLowerCase() !== authEmail) {
      await supabase.from("profiles").update({ email: authEmail }).eq("id", profile.id).then(() => {}, () => {});
    }

    // ── STEP 6: PROVE the credentials log in (anon client, real sign-in) ───
    const anon = createClient(url, anonKey);
    const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
      email: authEmail,
      password: tempPassword,
    });
    const loginVerified = !!loginData?.session && !loginErr;
    await anon.auth.signOut().catch(() => {});

    if (!loginVerified) {
      await audit(supabase, "verify_failed", { profileId: profile.id, reason: "login_failed", detail: loginErr?.message }, actorName);
      return jsonResponse(200, {
        verified: false,
        subject: "staff",
        profileId: profile.id,
        reason: "login_failed",
        message: `Login validation failed after setting the password${loginErr?.message ? `: ${loginErr.message}` : ""}. Credentials were NOT sent.`,
      });
    }

    // ── Verified — return login-proven credentials for the WhatsApp send ───
    await audit(supabase, "verify_ok", { profileId: profile.id, authEmail }, actorName);
    return jsonResponse(200, {
      verified: true,
      subject: "staff",
      profileId: profile.id,
      userId: profile.user_id,
      authEmail,
      username: authEmail, // staff log in with their email
      password: tempPassword,
      loginVerified: true,
      loginUrl: body?.loginUrl ?? `${new URL(req.url).origin}/login`,
    });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
