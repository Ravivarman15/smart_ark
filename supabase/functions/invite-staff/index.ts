// ── Edge function: invite-staff ─────────────────────────────────────────────
//
// Provisions a staff member end-to-end and delivers their credentials:
//   1. Verifies the caller is an authenticated management or admin user.
//   2. Creates the Supabase Auth user with a generated temporary password
//      (email pre-confirmed so they can log in immediately).
//   3. Inserts/updates the matching `profiles` row, including onboarding
//      lifecycle columns.
//   4. Sends a professional, branded welcome email via Brevo containing the
//      login email + temporary password + login URL + security guidance.
//   5. Records onboarding audit events (account_created, invite_email_*).
//
// WHY SERVER-SIDE ONLY:
//   • `supabase.auth.admin.*` needs the service-role key — never ship it.
//   • BREVO_API_KEY / SENDER_EMAIL are secrets — kept off the client.
//   • Role-gated here (management/admin) — defence-in-depth vs a stolen JWT.
//
// ACTIONS (the `action` field in the body):
//   • "invite"          — create auth user + profile + welcome email
//   • "resend_invite"   — regenerate temp password + resend welcome email
//   • "reset_password"  — regenerate temp password + branded reset email
//   • "delete"          — permanently remove the profile row + Auth login
//
// IDEMPOTENCY:
//   • A duplicate-email pre-check runs before account creation.
//   • Supabase Auth's unique-email constraint is the hard lock — a racing
//     second invite fails at `createUser` and returns 409 BEFORE the email
//     step, so a double-submit never creates two users or two emails.
//
// GRACEFUL DEGRADATION:
//   • If profile detail / onboarding columns are absent (schema migrations
//     not yet applied) the profile upsert retries with only the core columns.
//   • If Brevo is not configured the staff account is still created and the
//     temporary password is returned in the response so the admin can deliver
//     it manually. `email_status` reflects what happened.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { brevoConfigured, sendBrevoEmail } from "../_shared/brevo.ts";
import { renderEmail } from "../_shared/email-templates.ts";

interface InvitePayload {
  action:
    | "invite"
    | "resend_invite"
    | "reset_password"
    | "delete"
    | "verify"
    | "update_email";
  /** Required for invite / resend_invite / reset_password / update_email. */
  email?: string;
  /** Required for delete / verify / update_email — a staff row may have no email on file. */
  profile_id?: string;
  /** Required for update_email — the new login email to set on auth.users. */
  new_email?: string;
  profile?: {
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    gender?: string | null;
    mobile?: string | null;
    address?: string | null;
    profile_picture_url?: string | null;
    role: string;
    department?: string | null;
    designation?: string | null;
    joining_date?: string | null;
    campus_id?: string | null;
    subject?: string | null;
    status?: string | null;
  };
  /** Login URL embedded in the welcome email + auth redirect. */
  login_url?: string;
  redirect_to?: string;
  /** Branch key for multi-branch email branding. */
  branch?: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  management: "Management",
  coordinator: "Coordinator",
  teacher: "Teacher",
};
const roleLabel = (r: string): string =>
  ROLE_LABELS[r] ?? r.charAt(0).toUpperCase() + r.slice(1);

// Generate a readable 14-char password. Deliberately ALPHANUMERIC ONLY — no
// special characters. Special chars are a recurring cause of failed first
// logins: "&" is HTML-escaped inside the email (the recipient copies "&amp;"),
// "@" and "#" get auto-linked by some mail clients, and all of them are
// awkward to copy accurately on a phone — so the password the staff member
// pastes no longer matches the one stored in Auth. A 14-char mixed-case
// alphanumeric password is ~80 bits of entropy, far beyond what a login form
// needs. Ambiguous glyphs (0/O, 1/l/I) are excluded so it is unambiguous when
// read or typed by hand. At least one upper/lower/digit is guaranteed.
const generateTempPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) =>
    set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits)];
  for (let i = chars.length; i < 14; i++) chars.push(pick(all));
  // Fisher-Yates shuffle so the guaranteed chars are not always positions 0-2.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

// Profile columns that may be absent if the staff schema migrations have not
// been applied. Stripped on a retry so a partial schema degrades to a minimal
// (but still valid) profile row instead of failing the whole onboarding.
// The kept core — user_id, name, role, subject, campus_id, is_active — exists
// on every deployment.
const OPTIONAL_PROFILE_KEYS = [
  "first_name",
  "middle_name",
  "last_name",
  "gender",
  "mobile",
  "email",
  "address",
  "profile_picture_url",
  "department",
  "designation",
  "joining_date",
  "status",
  "onboarding_status",
  "invite_sent_at",
  "invite_email_status",
  "invite_email_error",
];

// Matches the various ways an auth/DB layer reports a duplicate email.
const isDuplicateError = (msg?: string): boolean =>
  !!msg &&
  /already.*regist|already.*exist|email.*exist|duplicate|23505/i.test(msg);

const isColumnError = (msg?: string): boolean =>
  !!msg && /column|schema cache|does not exist/i.test(msg);

type Db = ReturnType<typeof createClient>;

/** Upsert a profile row; retries without onboarding columns on a column error. */
const upsertProfile = async (
  db: Db,
  row: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> => {
  const attempt = async (payload: Record<string, unknown>) =>
    db.from("profiles").upsert(payload, { onConflict: "user_id" })
      .select("id").single();

  let res = await attempt(row);
  if (res.error && isColumnError(res.error.message)) {
    const stripped = { ...row };
    for (const k of OPTIONAL_PROFILE_KEYS) delete stripped[k];
    res = await attempt(stripped);
  }
  if (res.error) return { error: res.error.message };
  return { id: (res.data as { id: string } | null)?.id };
};

/** Patch a profile row; silently skips onboarding columns if absent. */
const patchProfile = async (
  db: Db,
  match: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<void> => {
  const apply = async (payload: Record<string, unknown>) => {
    let q = db.from("profiles").update(payload);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    return await q;
  };
  const res = await apply(patch);
  if (res.error && isColumnError(res.error.message)) {
    const stripped = { ...patch };
    for (const k of OPTIONAL_PROFILE_KEYS) delete stripped[k];
    if (Object.keys(stripped).length > 0) await apply(stripped);
  }
};

// ── Auth-truth resolver ─────────────────────────────────────────────────────
//
// EVERY credential-sending action goes through this helper, so the recipient
// email and the loginEmail printed inside the email body are ALWAYS read from
// auth.users — never from profiles.email. That eliminates the long-standing
// "welcome email shows credentials that don't match auth" bug, which was
// triggered whenever an admin edited profile.email after invite (profile.email
// drifted away from auth.users.email; password worked, login email did not).
//
// As a side-effect, the helper also repairs profile.email when it diverges —
// auth.users is authoritative, and every visit through here brings profiles
// back into lockstep automatically.
//
// Returns null when the auth user cannot be resolved (orphan profile / deleted
// auth user) so the caller can short-circuit BEFORE rotating any password.
interface ResolvedAuth {
  profileId: string;
  userId: string;
  authEmail: string;
  profileEmail: string | null;
  name: string;
  role: string;
}

const resolveAuthTruth = async (
  db: Db,
  lookup: { profileId?: string; email?: string },
): Promise<ResolvedAuth | { error: string; status: number }> => {
  // Find the profile first so we can locate the auth user_id.
  let q = db.from("profiles").select("id, user_id, name, role, email");
  if (lookup.profileId) q = q.eq("id", lookup.profileId);
  else if (lookup.email) q = q.ilike("email", lookup.email.trim().toLowerCase());
  else return { error: "profile_id or email required", status: 400 };

  const { data: prof } = await q.maybeSingle();
  if (!prof) {
    return { error: "No staff record found", status: 404 };
  }
  const profile = prof as {
    id: string;
    user_id: string | null;
    name: string | null;
    role: string | null;
    email: string | null;
  };
  if (!profile.user_id) {
    return {
      error:
        "Staff profile is not linked to an Auth login. Re-invite to (re-)create one.",
      status: 409,
    };
  }

  // Read the canonical auth record. This is the SINGLE SOURCE OF TRUTH for
  // the login email — never trust profile.email below this line.
  const { data: authData, error: authErr } = await db.auth.admin.getUserById(
    profile.user_id,
  );
  if (authErr || !authData?.user?.email) {
    return {
      error:
        "Auth login exists in profiles but is missing in auth.users. " +
        "The account is orphaned — delete and re-invite.",
      status: 409,
    };
  }
  const authEmail = authData.user.email.toLowerCase();

  // Self-healing: keep profile.email in lockstep with auth.users.email.
  // No error handling needed — if the column is absent the patch is silently
  // dropped by patchProfile's fallback.
  if (
    profile.email == null ||
    profile.email.toLowerCase() !== authEmail
  ) {
    await patchProfile(db, { id: profile.id }, { email: authEmail });
  }

  return {
    profileId: profile.id,
    userId: profile.user_id,
    authEmail,
    profileEmail: profile.email,
    name: profile.name ?? "there",
    role: profile.role ?? "staff",
  };
};

/** Append an onboarding audit event — best-effort (table may not exist yet). */
const logEvent = async (
  db: Db,
  ev: {
    profile_id: string;
    event_type: string;
    detail?: string;
    metadata?: Record<string, unknown>;
    actor_profile_id?: string | null;
    actor_name?: string | null;
  },
): Promise<void> => {
  try {
    await db.from("staff_onboarding_events").insert({
      profile_id: ev.profile_id,
      event_type: ev.event_type,
      detail: ev.detail ?? null,
      metadata: ev.metadata ?? {},
      actor_profile_id: ev.actor_profile_id ?? null,
      actor_name: ev.actor_name ?? null,
    });
  } catch {
    /* audit is best-effort — never block the invite on it */
  }
};

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
      /* invalid jwt shape */
    }
    if (!callerUserId) return jsonResponse(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Role gate — only management or admin may provision staff accounts.
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("id, role, name")
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
    const actor = {
      actor_profile_id: callerProfile.id as string,
      actor_name: (callerProfile.name as string) ?? null,
    };

    const body = (await req.json()) as InvitePayload;

    // ── Action: delete ────────────────────────────────────────────────────
    // Permanently removes the staff member. Keyed by profile_id because a
    // staff row may have no email on file. The service-role delete bypasses
    // RLS; the role gate above already restricts this to admin/management.
    if (body.action === "delete") {
      const profileId = (body.profile_id ?? "").trim();
      if (!profileId) {
        return jsonResponse(400, { error: "profile_id required for delete" });
      }

      const { data: target } = await supabase
        .from("profiles")
        .select("id, user_id, name")
        .eq("id", profileId)
        .maybeSingle();
      if (!target) {
        return jsonResponse(404, { error: "Staff record not found" });
      }

      // Guard against self-deletion — an admin removing their own account
      // would be locked out mid-session.
      if (target.user_id && target.user_id === callerUserId) {
        return jsonResponse(400, {
          error: "You cannot delete your own account.",
        });
      }

      // Remove the profile row. Linked history (attendance, class logs,
      // results, KPI, audit columns…) is handled at the DB level: migration
      // 20260607_profiles_delete_cascade retrofits ON DELETE SET NULL / CASCADE
      // onto every profiles(id) foreign key, so this single delete cascades
      // cleanly. The 23503 branch below is only a safety net for a deployment
      // where that migration has not been applied yet.
      const { error: delProfErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", profileId);
      if (delProfErr) {
        const fkBlocked =
          (delProfErr as { code?: string }).code === "23503" ||
          /foreign key|still referenced|violates/i.test(delProfErr.message);
        return jsonResponse(fkBlocked ? 409 : 400, {
          error: fkBlocked
            ? "This staff member has linked records that block deletion. " +
              "Apply the latest database migrations (profiles delete-cascade) " +
              "and try again."
            : delProfErr.message,
        });
      }

      // Remove the Auth login too, so the email can be reused later. The
      // profile is already gone — treat an auth-delete failure as a warning,
      // not a hard error.
      let warning: string | undefined;
      if (target.user_id) {
        const { error: delUserErr } = await supabase.auth.admin.deleteUser(
          target.user_id as string,
        );
        if (delUserErr) {
          warning =
            "Staff profile removed, but the login account could not be " +
            `deleted: ${delUserErr.message}`;
        }
      }

      return jsonResponse(200, { ok: true, action: "delete", warning });
    }

    if (!body?.email) return jsonResponse(400, { error: "email required" });

    const email = body.email.trim().toLowerCase();
    const origin = new URL(req.url).origin;
    const loginUrl = body.login_url ?? body.redirect_to ?? `${origin}/login`;
    const branch = body.branch;

    // ── Action: resend invite ─────────────────────────────────────────────
    // Auth-truth-first flow (see resolveAuthTruth):
    //   1. Resolve auth user → get canonical email + repair profile.email.
    //   2. Rotate password via auth.admin.updateUserById.
    //   3. Re-read auth.users to verify the update applied.
    //   4. ONLY then send the email — using the canonical auth.users.email.
    // Result: the password and the email-to-show ALWAYS match what's in auth.
    if (body.action === "resend_invite") {
      const resolved = await resolveAuthTruth(supabase, { email });
      if ("error" in resolved) {
        return jsonResponse(resolved.status, { error: resolved.error });
      }

      const tempPassword = generateTempPassword();
      const { error: pwErr } = await supabase.auth.admin.updateUserById(
        resolved.userId,
        { password: tempPassword },
      );
      if (pwErr) {
        await logEvent(supabase, {
          profile_id: resolved.profileId,
          event_type: "invite_email_failed",
          detail: `Password rotation failed: ${pwErr.message}`,
          ...actor,
        });
        return jsonResponse(400, { error: pwErr.message });
      }

      // Verify the rotation actually applied by re-reading the auth user.
      // updateUserById has been known to silently no-op when the user id is
      // wrong; we'd rather catch that here than ship a mismatched email.
      const { data: verify } = await supabase.auth.admin.getUserById(
        resolved.userId,
      );
      if (!verify?.user?.id) {
        await logEvent(supabase, {
          profile_id: resolved.profileId,
          event_type: "invite_email_failed",
          detail: "Auth user disappeared after password update — refusing send.",
          ...actor,
        });
        return jsonResponse(500, {
          error: "Auth verification failed after password rotation.",
        });
      }

      const mail = renderEmail(
        "staff-welcome",
        {
          staffName: resolved.name,
          roleLabel: roleLabel(resolved.role),
          loginEmail: resolved.authEmail,
          loginUrl,
          tempPassword,
        },
        branch,
      );
      const sent = await sendBrevoEmail({
        to: [{ email: resolved.authEmail, name: resolved.name }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ["staff-welcome", "resend"],
      });

      await patchProfile(
        supabase,
        { id: resolved.profileId },
        {
          onboarding_status: sent.ok ? "invite_sent" : "pending",
          invite_sent_at: new Date().toISOString(),
          invite_email_status: sent.status,
          invite_email_error: sent.error ?? null,
        },
      );
      await logEvent(supabase, {
        profile_id: resolved.profileId,
        event_type: sent.ok ? "invite_resent" : "invite_email_failed",
        detail: sent.ok
          ? `Welcome email re-sent to ${resolved.authEmail} with a new temporary password`
          : sent.error,
        ...actor,
      });

      return jsonResponse(200, {
        ok: true,
        action: "resend_invite",
        email_status: sent.status,
        email_error: sent.error,
        auth_email: resolved.authEmail,
        temp_password: tempPassword,
      });
    }

    // ── Action: reset password ────────────────────────────────────────────
    // Same auth-truth-first contract as resend_invite — credentials sent in
    // the email are guaranteed to match what's in auth.users because we read
    // the email back from auth before rendering.
    if (body.action === "reset_password") {
      const resolved = await resolveAuthTruth(supabase, { email });
      if ("error" in resolved) {
        return jsonResponse(resolved.status, { error: resolved.error });
      }

      const tempPassword = generateTempPassword();
      const { error: pwErr } = await supabase.auth.admin.updateUserById(
        resolved.userId,
        { password: tempPassword },
      );
      if (pwErr) {
        await logEvent(supabase, {
          profile_id: resolved.profileId,
          event_type: "password_reset_failed",
          detail: `Password rotation failed: ${pwErr.message}`,
          ...actor,
        });
        return jsonResponse(400, { error: pwErr.message });
      }

      const { data: verify } = await supabase.auth.admin.getUserById(
        resolved.userId,
      );
      if (!verify?.user?.id) {
        return jsonResponse(500, {
          error: "Auth verification failed after password rotation.",
        });
      }

      const mail = renderEmail(
        "staff-password-reset",
        {
          staffName: resolved.name,
          loginEmail: resolved.authEmail,
          loginUrl,
          tempPassword,
        },
        branch,
      );
      const sent = await sendBrevoEmail({
        to: [{ email: resolved.authEmail, name: resolved.name }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ["staff-password-reset"],
      });

      await logEvent(supabase, {
        profile_id: resolved.profileId,
        event_type: "password_reset",
        detail: sent.ok
          ? `Password reset — new temporary password emailed to ${resolved.authEmail}`
          : `Password reset — email not sent: ${sent.error}`,
        ...actor,
      });

      return jsonResponse(200, {
        ok: true,
        action: "reset_password",
        email_status: sent.status,
        email_error: sent.error,
        auth_email: resolved.authEmail,
        temp_password: tempPassword,
      });
    }

    // ── Action: verify (diagnostic, never mutates) ────────────────────────
    // Returns whether the profile is in sync with auth.users — used by the
    // admin UI to surface "auth sync OK" / "drift detected" badges without
    // rotating anything.
    if (body.action === "verify") {
      const lookup: { profileId?: string; email?: string } = {};
      if (body.profile_id) lookup.profileId = body.profile_id.trim();
      else if (body.email) lookup.email = body.email.trim();
      else
        return jsonResponse(400, {
          error: "profile_id or email required for verify",
        });

      // Re-fetch raw so we can report the divergence; resolveAuthTruth would
      // silently repair profile.email which is fine for production paths but
      // for a diagnostic we want to SEE the drift before repair.
      let q = supabase.from("profiles").select("id, user_id, name, role, email");
      if (lookup.profileId) q = q.eq("id", lookup.profileId);
      else q = q.ilike("email", lookup.email!.toLowerCase());
      const { data: prof } = await q.maybeSingle();
      if (!prof) return jsonResponse(404, { error: "No staff record found" });

      const profile = prof as {
        id: string;
        user_id: string | null;
        name: string | null;
        email: string | null;
      };

      if (!profile.user_id) {
        return jsonResponse(200, {
          ok: true,
          action: "verify",
          profile_id: profile.id,
          auth_linked: false,
          auth_email: null,
          profile_email: profile.email,
          in_sync: false,
          issue: "Profile has no linked auth user",
        });
      }
      const { data: authData } = await supabase.auth.admin.getUserById(
        profile.user_id,
      );
      const authEmail = authData?.user?.email?.toLowerCase() ?? null;
      const profileEmail = profile.email?.toLowerCase() ?? null;
      const inSync = !!authEmail && authEmail === profileEmail;

      return jsonResponse(200, {
        ok: true,
        action: "verify",
        profile_id: profile.id,
        user_id: profile.user_id,
        auth_linked: !!authEmail,
        auth_email: authEmail,
        profile_email: profile.email,
        in_sync: inSync,
        issue: !authEmail
          ? "Auth user no longer exists — profile is orphaned"
          : !inSync
          ? "profile.email differs from auth.users.email — login email shown in past welcome emails was wrong"
          : null,
      });
    }

    // ── Action: update_email ──────────────────────────────────────────────
    // Atomically change a staff member's LOGIN email (auth.users.email AND
    // profiles.email). The previous flow updated only profiles.email through
    // a normal UPDATE, which silently drifted the two apart — past welcome
    // emails then quoted profile.email but Supabase Auth only knew the old
    // auth.users.email, so login failed even though the password matched.
    //
    // The auth update happens first; if it fails we don't touch profiles.
    // If profiles fails afterwards we log it but don't roll auth back —
    // auth.users is authoritative, the profile row will self-heal on the
    // next resend/reset via resolveAuthTruth.
    if (body.action === "update_email") {
      const profileId = (body.profile_id ?? "").trim();
      const newEmailRaw = (body.new_email ?? "").trim().toLowerCase();
      if (!profileId || !newEmailRaw) {
        return jsonResponse(400, {
          error: "profile_id and new_email required",
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw)) {
        return jsonResponse(400, { error: "new_email is not a valid email" });
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, user_id, name, email")
        .eq("id", profileId)
        .maybeSingle();
      if (!prof?.user_id) {
        return jsonResponse(404, {
          error: "Staff record not found or has no linked auth login",
        });
      }
      const profile = prof as {
        id: string;
        user_id: string;
        name: string | null;
        email: string | null;
      };

      // Reject if another auth user already owns this email — surfaces a
      // clear conflict instead of a raw 409.
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, user_id")
        .ilike("email", newEmailRaw)
        .maybeSingle();
      if (existing && (existing as { id: string }).id !== profile.id) {
        return jsonResponse(409, {
          error: "Another staff member already uses this email",
        });
      }

      // 1) Auth first — this is the source of truth for login.
      const { error: authUpdErr } = await supabase.auth.admin.updateUserById(
        profile.user_id,
        { email: newEmailRaw, email_confirm: true },
      );
      if (authUpdErr) {
        await logEvent(supabase, {
          profile_id: profile.id,
          event_type: "email_change_failed",
          detail: `Auth email update failed: ${authUpdErr.message}`,
          ...actor,
        });
        return jsonResponse(400, { error: authUpdErr.message });
      }

      // 2) Profile second — keep the DB row in lockstep. Best-effort: if it
      //    fails the next credential-sending action repairs it automatically.
      await patchProfile(
        supabase,
        { id: profile.id },
        { email: newEmailRaw },
      );

      await logEvent(supabase, {
        profile_id: profile.id,
        event_type: "email_changed",
        detail: `Login email changed from ${profile.email ?? "(empty)"} to ${newEmailRaw}`,
        metadata: { from: profile.email, to: newEmailRaw },
        ...actor,
      });

      return jsonResponse(200, {
        ok: true,
        action: "update_email",
        profile_id: profile.id,
        user_id: profile.user_id,
        auth_email: newEmailRaw,
      });
    }

    // ── Action: invite (default) ──────────────────────────────────────────
    if (!body.profile) {
      return jsonResponse(400, { error: "profile required for invite" });
    }
    const profile = body.profile;
    if (!profile.first_name || !profile.last_name || !profile.role) {
      return jsonResponse(400, {
        error: "first_name, last_name and role are required",
      });
    }

    // Duplicate-email guard — clearer message than a raw 23505.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse(409, {
        error: "A staff member with this email already exists",
      });
    }

    const fullName = `${profile.first_name} ${profile.last_name}`.trim();
    const tempPassword = generateTempPassword();

    // 1) Create the auth user with the temp password. email_confirm:true lets
    //    them log in immediately — the welcome email carries the credentials.
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: fullName, role: profile.role },
      });
    if (createErr) {
      // A concurrent invite for the same email already created the auth user —
      // Supabase Auth's unique-email constraint is the idempotency lock. We
      // return here, BEFORE the email step, so no duplicate welcome email is
      // ever sent for a racing double-submit.
      const dup = isDuplicateError(createErr.message);
      return jsonResponse(dup ? 409 : 400, {
        error: dup
          ? "A staff member with this email already exists"
          : createErr.message,
      });
    }
    const newUser = created.user;
    if (!newUser) {
      return jsonResponse(500, { error: "Auth user creation returned no user" });
    }

    // 2) Upsert the profile (the auth trigger may have created a bare row).
    const nowIso = new Date().toISOString();
    const profileRow: Record<string, unknown> = {
      user_id: newUser.id,
      first_name: profile.first_name,
      middle_name: profile.middle_name ?? null,
      last_name: profile.last_name,
      gender: profile.gender ?? null,
      mobile: profile.mobile ?? null,
      email,
      address: profile.address ?? null,
      profile_picture_url: profile.profile_picture_url ?? null,
      role: profile.role,
      department: profile.department ?? null,
      designation: profile.designation ?? null,
      joining_date: profile.joining_date ?? null,
      campus_id: profile.campus_id ?? null,
      subject: profile.subject ?? null,
      status: profile.status ?? "invited",
      is_active: true,
      name: fullName,
      onboarding_status: "pending",
      invite_sent_at: nowIso,
      invite_email_status: "pending",
    };

    const upserted = await upsertProfile(supabase, profileRow);
    if (upserted.error || !upserted.id) {
      // Roll back the auth user so the caller can retry cleanly.
      await supabase.auth.admin.deleteUser(newUser.id).catch(() => {});
      return jsonResponse(400, {
        error: upserted.error ?? "Profile creation failed",
      });
    }
    const profileId = upserted.id;

    await logEvent(supabase, {
      profile_id: profileId,
      event_type: "account_created",
      detail: `Staff account created with role "${roleLabel(profile.role)}"`,
      metadata: { role: profile.role },
      ...actor,
    });

    // 3) Send the branded welcome email.
    const mail = renderEmail(
      "staff-welcome",
      {
        staffName: fullName,
        roleLabel: roleLabel(profile.role),
        loginEmail: email,
        loginUrl,
        tempPassword,
        departmentLabel: profile.department
          ? `Department: ${profile.department}`
          : undefined,
      },
      branch,
    );
    const sent = await sendBrevoEmail({
      to: [{ email, name: fullName }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: ["staff-welcome", "invite"],
    });

    // 4) Persist the email outcome on the profile + audit log.
    await patchProfile(
      supabase,
      { id: profileId },
      {
        onboarding_status: sent.ok ? "invite_sent" : "pending",
        invite_email_status: sent.status,
        invite_email_error: sent.error ?? null,
      },
    );
    await logEvent(supabase, {
      profile_id: profileId,
      event_type: sent.ok ? "invite_email_sent" : "invite_email_failed",
      detail: sent.ok
        ? `Welcome email delivered to ${email}`
        : `Welcome email not sent: ${sent.error}`,
      ...actor,
    });

    return jsonResponse(200, {
      ok: true,
      action: "invite",
      user_id: newUser.id,
      profile_id: profileId,
      email_status: sent.status,
      email_error: sent.error,
      brevo_configured: brevoConfigured(),
      // Returned so the admin can deliver credentials manually when the email
      // could not be sent (Brevo not configured / send failed).
      temp_password: tempPassword,
    });
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }
});
