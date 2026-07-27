// ── Edge function: student-parent-accounts ───────────────────────────────────
//
// The provisioning + verification engine for the Student & Parent Authentication
// platform. Student/parent logins are REAL Supabase auth.users accounts so a
// login can be genuinely PROVEN (signInWithPassword) and RLS works via auth.uid.
// When no real email exists a stable login email is synthesised from the
// username (…@students.ark.local / …@parents.ark.local).
//
// WHY SERVER-SIDE ONLY: auth.admin.* (create user / rotate password) needs the
// service-role key; the login proof uses the anon key — neither ships to the
// browser. Gated to admin/management.
//
// ACTIONS (body.action):
//   create_student | create_parent  — provision an auth account + app row, prove login
//   verify         — rotate to a known temp password, prove login, return creds
//   reset_password — rotate + prove + return creds (for "Reset Password")
//   set_status     — active | disabled | locked  (enable/disable/lock)
//   link_student   — attach a student to a parent account
//
// RESPONSE (success): { ok:true, accountId, userId, username, loginEmail,
//                       password?, loginVerified? }
// RESPONSE (failure): { ok:false, reason, message }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const STUDENT_DOMAIN = "students.ark.local";
const PARENT_DOMAIN = "parents.ark.local";

const generateTempPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  // SYMBOLS ARE NOT OPTIONAL. Supabase Auth lets a project require
  // "lowercase, uppercase, digits AND symbols"; when that is set, a password
  // drawn only from letters+digits is rejected and auth.admin.createUser fails
  // with `create_failed` for EVERY account — regardless of the email, which is
  // what makes it look like an email problem. Guaranteeing one of each class
  // satisfies the strictest policy and is harmless under the loosest.
  //
  // Restricted to characters that survive being read aloud over the phone,
  // pasted into a WhatsApp message, and embedded in an email — no quotes,
  // backslashes or angle brackets.
  const symbols = "!@#$%*-_+=?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = chars.length; i < 16; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

/**
 * Flatten a Supabase auth error into something a human can act on.
 *
 * `AuthError.message` is sometimes empty and the useful part lives in `status`
 * / `code` / `name`. Returning only `.message` is what surfaced in the UI as a
 * bare "{}" with no reason attached.
 */
const describeAuthError = (e: unknown): { message: string; detail: Record<string, unknown> } => {
  const err = (e ?? {}) as Record<string, unknown>;
  const raw = typeof err.message === "string" ? err.message.trim() : "";
  const status = err.status ?? err.statusCode;
  const code = err.code ?? err.error_code;
  const name = err.name;

  let message = raw;
  if (!message) {
    message = code
      ? `Auth rejected the request (${String(code)}).`
      : status
        ? `Auth rejected the request (HTTP ${String(status)}).`
        : "Auth rejected the request without giving a reason.";
  }

  // Turn the two most common causes into instructions rather than jargon.
  if (/password/i.test(message) && /requirement|weak|short|strength|character/i.test(message)) {
    message =
      `The generated password was rejected by this project's password policy: ${message}. ` +
      `Check Authentication → Policies in the Supabase dashboard.`;
  } else if (/already|exists|registered|duplicate/i.test(message)) {
    message = `That email address is already registered to another account: ${message}`;
  }

  return { message, detail: { name, status, code, raw } };
};

const slugUsername = (name: string, salt: string): string => {
  const base = (name || "user").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 18);
  return `${base || "user"}.${salt.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase()}`;
};

type Db = ReturnType<typeof createClient>;

const logAudit = async (db: Db, e: { subject_type: string; account_id?: string; user_id?: string; event: string; detail?: string }) => {
  try { await db.from("auth_login_audit").insert(e); } catch { /* best-effort */ }
};

/** Rotate to a fresh temp password and PROVE it logs in. */
const rotateAndProve = async (
  db: Db, url: string, anonKey: string, userId: string, loginEmail: string,
): Promise<{ ok: true; password: string } | { ok: false; reason: string; detail?: string }> => {
  const tempPassword = generateTempPassword();
  const { error: pwErr } = await db.auth.admin.updateUserById(userId, { password: tempPassword });
  if (pwErr) return { ok: false, reason: "rotate_failed", detail: pwErr.message };
  const anon = createClient(url, anonKey);
  const { data, error } = await anon.auth.signInWithPassword({ email: loginEmail, password: tempPassword });
  const ok = !!data?.session && !error;
  await anon.auth.signOut().catch(() => {});
  if (!ok) return { ok: false, reason: "login_failed", detail: error?.message };
  return { ok: true, password: tempPassword };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse(401, { error: "Unauthorized" });
    let callerUserId: string | null = null;
    try { callerUserId = JSON.parse(atob(authHeader.replace("Bearer ", "").split(".")[1])).sub || null; } catch { /* */ }
    if (!callerUserId) return jsonResponse(401, { error: "Unauthorized" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: caller } = await supabase.from("profiles").select("id, role").eq("user_id", callerUserId).maybeSingle();
    if (!caller || !["management", "admin"].includes(caller.role as string)) {
      return jsonResponse(403, { error: "Forbidden — management or admin role required" });
    }
    const createdBy = caller.id as string;
    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;

    // ── create_student ─────────────────────────────────────────────────────
    if (action === "create_student") {
      const studentId = String(body?.studentId ?? "");
      if (!studentId) return jsonResponse(400, { error: "studentId required" });

      const { data: stu } = await supabase.from("students").select("id, name").eq("id", studentId).maybeSingle();
      if (!stu) return jsonResponse(404, { ok: false, reason: "no_student", message: "Student not found" });

      const { data: existing } = await supabase.from("student_auth_accounts").select("id, user_id").eq("student_id", studentId).maybeSingle();
      if (existing?.user_id) return jsonResponse(200, { ok: false, reason: "exists", message: "Student already has an account. Use Reset Password." });

      const username = String(body?.username ?? slugUsername(stu.name as string, studentId));
      const loginEmail = String(body?.email ?? `${username}@${STUDENT_DOMAIN}`).toLowerCase();
      const password = generateTempPassword();

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: loginEmail, password, email_confirm: true,
        user_metadata: { role: "student", student_id: studentId, name: stu.name },
      });
      if (createErr || !created?.user) {
        const described = describeAuthError(createErr);
        return jsonResponse(200, {
          ok: false,
          reason: "create_failed",
          message: described.message,
          detail: { ...described.detail, attemptedLoginEmail: loginEmail },
        });
      }

      const row = {
        student_id: studentId, user_id: created.user.id, username, login_email: loginEmail,
        mobile: body?.mobile ?? null, status: "active", created_by: createdBy,
      };
      const { data: acct, error: upErr } = existing
        ? await supabase.from("student_auth_accounts").update(row).eq("id", existing.id).select("id").single()
        : await supabase.from("student_auth_accounts").insert(row).select("id").single();
      if (upErr) {
        await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
        return jsonResponse(200, { ok: false, reason: "row_failed", message: upErr.message });
      }

      const proof = await rotateAndProve(supabase, url, anonKey, created.user.id, loginEmail);
      await logAudit(supabase, { subject_type: "student", account_id: (acct as { id: string }).id, user_id: created.user.id, event: "account_created", detail: `username ${username}` });
      if (!proof.ok) return jsonResponse(200, { ok: false, reason: proof.reason, message: `Account created but login could not be proven: ${proof.detail ?? ""}` });
      return jsonResponse(200, { ok: true, accountId: (acct as { id: string }).id, userId: created.user.id, username, loginEmail, password: proof.password, loginVerified: true });
    }

    // ── create_parent ──────────────────────────────────────────────────────
    if (action === "create_parent") {
      const name = String(body?.name ?? "Parent");
      const username = String(body?.username ?? slugUsername(name, crypto.randomUUID()));
      const loginEmail = String(body?.email ?? `${username}@${PARENT_DOMAIN}`).toLowerCase();
      const password = generateTempPassword();
      const studentIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds : [];

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: loginEmail, password, email_confirm: true,
        user_metadata: { role: "parent", name },
      });
      if (createErr || !created?.user) {
        const described = describeAuthError(createErr);
        return jsonResponse(200, {
          ok: false,
          reason: "create_failed",
          message: described.message,
          // Echo what was ATTEMPTED — without this, a failure is undiagnosable
          // from the client because it cannot see the synthesised login email.
          detail: { ...described.detail, attemptedLoginEmail: loginEmail, usedProvidedEmail: !!body?.email },
        });
      }

      const { data: acct, error: upErr } = await supabase.from("parent_auth_accounts").insert({
        user_id: created.user.id, name, username, login_email: loginEmail,
        email: body?.email ?? null, mobile: body?.mobile ?? null, status: "active", created_by: createdBy,
      }).select("id").single();
      if (upErr) {
        await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
        return jsonResponse(200, { ok: false, reason: "row_failed", message: upErr.message });
      }
      const accountId = (acct as { id: string }).id;
      for (const sid of studentIds) {
        await supabase.from("parent_student_links").insert({ parent_account_id: accountId, student_id: sid }).then(() => {}, () => {});
      }

      const proof = await rotateAndProve(supabase, url, anonKey, created.user.id, loginEmail);
      await logAudit(supabase, { subject_type: "parent", account_id: accountId, user_id: created.user.id, event: "account_created", detail: `username ${username}` });
      if (!proof.ok) return jsonResponse(200, { ok: false, reason: proof.reason, message: `Account created but login could not be proven: ${proof.detail ?? ""}` });
      return jsonResponse(200, { ok: true, accountId, userId: created.user.id, username, loginEmail, password: proof.password, loginVerified: true });
    }

    // ── verify / reset_password (rotate + prove login, return creds) ───────
    if (action === "verify" || action === "reset_password") {
      const subject = String(body?.subject ?? "");
      const table = subject === "student" ? "student_auth_accounts" : subject === "parent" ? "parent_auth_accounts" : "";
      if (!table) return jsonResponse(400, { error: 'subject must be "student" or "parent"' });

      let q = supabase.from(table).select("id, user_id, username, login_email, status");
      if (body?.accountId) q = q.eq("id", String(body.accountId));
      else if (subject === "student" && body?.studentId) q = q.eq("student_id", String(body.studentId));
      else return jsonResponse(400, { error: "accountId (or studentId for students) required" });

      const { data: acct } = await q.maybeSingle();
      if (!acct) return jsonResponse(200, { ok: false, reason: "no_account", message: "No login account — create one first." });
      const a = acct as { id: string; user_id: string | null; username: string | null; login_email: string | null; status: string };
      if (!a.user_id || !a.login_email) return jsonResponse(200, { ok: false, reason: "no_auth_link", message: "Account is not linked to a login." });
      if (a.status === "disabled" || a.status === "locked") return jsonResponse(200, { ok: false, reason: a.status, message: `Account is ${a.status}.` });

      const proof = await rotateAndProve(supabase, url, anonKey, a.user_id, a.login_email);
      await logAudit(supabase, { subject_type: subject, account_id: a.id, user_id: a.user_id, event: action === "verify" ? "verify" : "password_reset" });
      if (!proof.ok) return jsonResponse(200, { ok: false, reason: proof.reason, message: `Login validation failed: ${proof.detail ?? ""}. Not sent.` });
      return jsonResponse(200, { ok: true, verified: true, accountId: a.id, userId: a.user_id, username: a.username, loginEmail: a.login_email, password: proof.password, loginVerified: true });
    }

    // ── set_status (enable / disable / lock) ───────────────────────────────
    if (action === "set_status") {
      const subject = String(body?.subject ?? "");
      const table = subject === "student" ? "student_auth_accounts" : subject === "parent" ? "parent_auth_accounts" : "";
      const status = String(body?.status ?? "");
      if (!table) return jsonResponse(400, { error: 'subject must be "student" or "parent"' });
      if (!["active", "disabled", "locked"].includes(status)) return jsonResponse(400, { error: "invalid status" });
      const accountId = String(body?.accountId ?? "");
      if (!accountId) return jsonResponse(400, { error: "accountId required" });

      const { error } = await supabase.from(table).update({ status, locked_at: status === "locked" ? new Date().toISOString() : null }).eq("id", accountId);
      if (error) return jsonResponse(200, { ok: false, reason: "update_failed", message: error.message });
      await logAudit(supabase, { subject_type: subject, account_id: accountId, event: status === "active" ? "account_enabled" : status === "locked" ? "account_locked" : "account_disabled" });
      return jsonResponse(200, { ok: true, accountId, status });
    }

    // ── link_student (attach a student to a parent) ────────────────────────
    if (action === "link_student") {
      const parentAccountId = String(body?.parentAccountId ?? "");
      const studentId = String(body?.studentId ?? "");
      if (!parentAccountId || !studentId) return jsonResponse(400, { error: "parentAccountId and studentId required" });
      const { error } = await supabase.from("parent_student_links").insert({
        parent_account_id: parentAccountId, student_id: studentId, relation: body?.relation ?? null, is_primary: !!body?.isPrimary,
      });
      if (error && !/duplicate|unique/i.test(error.message)) return jsonResponse(200, { ok: false, reason: "link_failed", message: error.message });
      return jsonResponse(200, { ok: true, parentAccountId, studentId });
    }

    return jsonResponse(400, { error: `unknown action: ${action}` });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
