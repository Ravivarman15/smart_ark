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
import { requireRole, scoped, stampOrg } from "../_shared/auth.ts";

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

// `org` is REQUIRED, not optional-with-a-default. auth_login_audit is a tenant
// table, and this insert is deliberately best-effort — so an unstamped row here
// would be swallowed by the catch and the audit trail would just silently stop.
const logAudit = async (
  db: Db,
  org: string,
  e: { subject_type: string; account_id?: string; user_id?: string; event: string; detail?: string },
) => {
  try { await db.from("auth_login_audit").insert(stampOrg(e, org, "audit entry")); } catch { /* best-effort */ }
};

/**
 * Give the new principal a MEMBERSHIP row in its organization.
 *
 * ┌── WITHOUT THIS THE LOGIN WORKS AND THE PORTAL DOES NOT ────────────────┐
 * │ custom_access_token_hook builds the JWT's organization_id claim from   │
 * │ organization_users. No membership row → no claim → jwt_org_id() NULL.  │
 * │                                                                        │
 * │ current_org_id() then falls through to fallback_org_id(), which is     │
 * │ NULL once a second organization exists. Every tenant RLS policy denies │
 * │ — including `owner_read parent_auth_accounts`, whose USING clause is   │
 * │ `organization_id = current_org_id() AND user_id = auth.uid()`.         │
 * │                                                                        │
 * │ So the parent signs in successfully, the browser cannot read the       │
 * │ parent's OWN account row, AuthContext sees no parent identity, and     │
 * │ AuthRedirect sends them to /signup — the "Tell us about your           │
 * │ institution" wizard. The credentials were never the problem.           │
 * │                                                                        │
 * │ This worked while ARK was the only tenant, because fallback_org_id()   │
 * │ resolved to ARK for a claimless session. invite-staff already creates  │
 * │ this row for staff (see the block comment there); students and parents │
 * │ were simply never given the same treatment.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Reported, never swallowed: an account that cannot reach its portal is not a
 * successful provision, and saying otherwise is how this went unnoticed.
 */
const grantMembership = async (
  db: Db, org: string, userId: string, kind: "parent" | "student",
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { error } = await db.from("organization_users").upsert(
    {
      organization_id: org,
      user_id: userId,
      principal_kind: kind,
      is_default: true,
      status: "active",
    },
    { onConflict: "organization_id,user_id,principal_kind" },
  );
  return error ? { ok: false, message: error.message } : { ok: true };
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Phase 0: the caller's JWT is now SIGNATURE-VERIFIED against GoTrue
    // instead of base64-decoded and trusted. This function provisions real
    // logins with the service role, so a forged `sub` was the highest-value
    // impersonation target in the codebase. See _shared/auth.ts.
    const gate = await requireRole(req, supabase, ["management", "admin"]);
    if (!gate.ok) return jsonResponse(gate.status, { error: gate.error });
    const createdBy = gate.caller.profileId as string;

    // The tenant every row written below belongs to. Derived from the verified
    // caller's membership — never from the request body, which a client could
    // set to another tenant's id (the service role would happily obey).
    //
    // Checked ONCE, here, so a missing org fails as a clean 403 before any auth
    // user is created — rather than as a NOT NULL violation halfway through,
    // which is what left orphaned auth.users behind.
    const orgId = gate.caller.organizationId;
    if (!orgId) {
      return jsonResponse(403, {
        ok: false,
        reason: "no_organization",
        message:
          "Your account is not an active member of any organization, so there is " +
          "no tenant to create this login in. Ask an administrator to check your " +
          "organization membership.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;

    // ── create_student ─────────────────────────────────────────────────────
    if (action === "create_student") {
      const studentId = String(body?.studentId ?? "");
      if (!studentId) return jsonResponse(400, { error: "studentId required" });

      // Phase 1: scoped to the CALLER'S organization, resolved from membership
      // rather than from the request. Without this, an admin of tenant B could
      // provision a login for tenant A's student simply by passing their id —
      // the service-role client bypasses RLS, so nothing else would stop it.
      // A foreign studentId now simply resolves to no row → 404.
      const { data: stu } = await scoped(
        supabase.from("students").select("id, name"), gate.caller,
      ).eq("id", studentId).maybeSingle();
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

      const row = stampOrg({
        student_id: studentId, user_id: created.user.id, username, login_email: loginEmail,
        mobile: body?.mobile ?? null, status: "active", created_by: createdBy,
      }, orgId, "student login");
      const { data: acct, error: upErr } = existing
        ? await supabase.from("student_auth_accounts").update(row).eq("id", existing.id).select("id").single()
        : await supabase.from("student_auth_accounts").insert(row).select("id").single();
      if (upErr) {
        await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
        return jsonResponse(200, { ok: false, reason: "row_failed", message: upErr.message });
      }

      const stuMember = await grantMembership(supabase, orgId, created.user.id, "student");
      if (!stuMember.ok) {
        return jsonResponse(200, {
          ok: false,
          reason: "membership_failed",
          message:
            `The login was created but could not be attached to this organization, so the student ` +
            `would sign in and land on the setup wizard instead of their portal. ` +
            `Delete the account and try again. (${stuMember.message})`,
        });
      }

      const proof = await rotateAndProve(supabase, url, anonKey, created.user.id, loginEmail);
      await logAudit(supabase, orgId, { subject_type: "student", account_id: (acct as { id: string }).id, user_id: created.user.id, event: "account_created", detail: `username ${username}` });
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

      const { data: acct, error: upErr } = await supabase.from("parent_auth_accounts").insert(
        stampOrg({
          user_id: created.user.id, name, username, login_email: loginEmail,
          email: body?.email ?? null, mobile: body?.mobile ?? null, status: "active", created_by: createdBy,
        }, orgId, "parent login"),
      ).select("id").single();
      if (upErr) {
        await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
        return jsonResponse(200, { ok: false, reason: "row_failed", message: upErr.message });
      }
      const accountId = (acct as { id: string }).id;

      // Before linking children or proving the login: without membership the
      // parent can sign in but cannot read their own row, and the portal is
      // unreachable. Fail here rather than reporting a success they cannot use.
      const member = await grantMembership(supabase, orgId, created.user.id, "parent");
      if (!member.ok) {
        return jsonResponse(200, {
          ok: false,
          reason: "membership_failed",
          message:
            `The login was created but could not be attached to this organization, so the parent ` +
            `would sign in and land on the setup wizard instead of the Parent Portal. ` +
            `Delete the account and try again. (${member.message})`,
        });
      }

      // LINKING IS PART OF PROVISIONING, NOT A SIDE EFFECT.
      // This loop previously ended in `.then(() => {}, () => {})`, discarding
      // every error — so an account could be reported as fully created while
      // linked to nobody, and the parent signed in to an empty portal with
      // nothing anywhere explaining why. Report what actually happened.
      // The student ids arrive from the REQUEST. Under the service role nothing
      // else would stop an admin of tenant B linking tenant A's student to a
      // parent login they control — which would hand them A's attendance, fees
      // and results in the parent portal. Resolve the ids against the caller's
      // own organization first and link only what survives.
      const { data: ownStudents } = await scoped(
        supabase.from("students").select("id"), gate.caller,
      ).in("id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]);
      const ownIds = new Set(((ownStudents ?? []) as { id: string }[]).map((s) => s.id));

      const linkedStudentIds: string[] = [];
      const linkFailures: { studentId: string; message: string }[] = [];
      for (const [i, sid] of studentIds.entries()) {
        if (!ownIds.has(sid)) {
          linkFailures.push({ studentId: sid, message: "Student is not in your organization." });
          continue;
        }
        const { error: linkErr } = await supabase.from("parent_student_links").insert(stampOrg({
          parent_account_id: accountId,
          student_id: sid,
          relation: body?.relation ?? null,
          is_primary: i === 0,
        }, orgId, "parent-student link"));
        // The row already existing is the outcome we wanted.
        if (linkErr && !/duplicate|unique/i.test(linkErr.message)) {
          linkFailures.push({ studentId: sid, message: linkErr.message });
        } else {
          linkedStudentIds.push(sid);
        }
      }

      const proof = await rotateAndProve(supabase, url, anonKey, created.user.id, loginEmail);
      await logAudit(supabase, orgId, { subject_type: "parent", account_id: accountId, user_id: created.user.id, event: "account_created", detail: `username ${username}` });
      if (!proof.ok) return jsonResponse(200, { ok: false, reason: proof.reason, message: `Account created but login could not be proven: ${proof.detail ?? ""}` });
      return jsonResponse(200, {
        ok: true, accountId, userId: created.user.id, username, loginEmail,
        password: proof.password, loginVerified: true,
        linkedStudentIds, linkFailures,
      });
    }

    // ── verify / reset_password (rotate + prove login, return creds) ───────
    if (action === "verify" || action === "reset_password") {
      const subject = String(body?.subject ?? "");
      const table = subject === "student" ? "student_auth_accounts" : subject === "parent" ? "parent_auth_accounts" : "";
      if (!table) return jsonResponse(400, { error: 'subject must be "student" or "parent"' });

      // Scoped: accountId comes from the request, and rotating a password is
      // an account TAKEOVER primitive — it returns the new credentials to the
      // caller. Unscoped, a foreign accountId would hand another tenant's
      // parent login to whoever asked. Out-of-tenant now resolves to no row.
      let q = scoped(
        supabase.from(table).select("id, user_id, username, login_email, status"),
        gate.caller,
      );
      if (body?.accountId) q = q.eq("id", String(body.accountId));
      else if (subject === "student" && body?.studentId) q = q.eq("student_id", String(body.studentId));
      else return jsonResponse(400, { error: "accountId (or studentId for students) required" });

      const { data: acct } = await q.maybeSingle();
      if (!acct) return jsonResponse(200, { ok: false, reason: "no_account", message: "No login account — create one first." });
      const a = acct as { id: string; user_id: string | null; username: string | null; login_email: string | null; status: string };
      if (!a.user_id || !a.login_email) return jsonResponse(200, { ok: false, reason: "no_auth_link", message: "Account is not linked to a login." });
      if (a.status === "disabled" || a.status === "locked") return jsonResponse(200, { ok: false, reason: a.status, message: `Account is ${a.status}.` });

      const proof = await rotateAndProve(supabase, url, anonKey, a.user_id, a.login_email);
      await logAudit(supabase, orgId, { subject_type: subject, account_id: a.id, user_id: a.user_id, event: action === "verify" ? "verify" : "password_reset" });
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

      // `.select("id")` is not decoration: an UPDATE filtered to zero rows
      // returns 204 with error === null, so without it disabling a foreign
      // account would report success while changing nothing.
      const { data: updated, error } = await scoped(
        supabase.from(table).update({ status, locked_at: status === "locked" ? new Date().toISOString() : null }),
        gate.caller,
      ).eq("id", accountId).select("id");
      if (error) return jsonResponse(200, { ok: false, reason: "update_failed", message: error.message });
      if (!updated || updated.length === 0) {
        return jsonResponse(404, { ok: false, reason: "no_account", message: "No such account in your organization." });
      }
      await logAudit(supabase, orgId, { subject_type: subject, account_id: accountId, event: status === "active" ? "account_enabled" : status === "locked" ? "account_locked" : "account_disabled" });
      return jsonResponse(200, { ok: true, accountId, status });
    }

    // ── link_student (attach a student to a parent) ────────────────────────
    if (action === "link_student") {
      const parentAccountId = String(body?.parentAccountId ?? "");
      const studentId = String(body?.studentId ?? "");
      if (!parentAccountId || !studentId) return jsonResponse(400, { error: "parentAccountId and studentId required" });

      // BOTH ends must belong to the caller's tenant. Checking only one would
      // still allow stitching a foreign student onto a local parent login (or
      // a local student onto a foreign parent's), either of which exposes a
      // child's record across tenants.
      const [{ data: pa }, { data: st }] = await Promise.all([
        scoped(supabase.from("parent_auth_accounts").select("id"), gate.caller).eq("id", parentAccountId).maybeSingle(),
        scoped(supabase.from("students").select("id"), gate.caller).eq("id", studentId).maybeSingle(),
      ]);
      if (!pa) return jsonResponse(404, { ok: false, reason: "no_parent", message: "No such parent account in your organization." });
      if (!st) return jsonResponse(404, { ok: false, reason: "no_student", message: "No such student in your organization." });

      const { error } = await supabase.from("parent_student_links").insert(stampOrg({
        parent_account_id: parentAccountId, student_id: studentId, relation: body?.relation ?? null, is_primary: !!body?.isPrimary,
      }, orgId, "parent-student link"));
      if (error && !/duplicate|unique/i.test(error.message)) return jsonResponse(200, { ok: false, reason: "link_failed", message: error.message });
      return jsonResponse(200, { ok: true, parentAccountId, studentId });
    }

    return jsonResponse(400, { error: `unknown action: ${action}` });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
