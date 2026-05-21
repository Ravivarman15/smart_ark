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
//   • "reset_password"  — branded password-reset email
//
// GRACEFUL DEGRADATION:
//   • If the onboarding columns are absent (migration not yet applied) the
//     profile upsert retries without them.
//   • If Brevo is not configured the staff account is still created and the
//     temporary password is returned in the response so the admin can deliver
//     it manually. `email_status` reflects what happened.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { brevoConfigured, sendBrevoEmail } from "../_shared/brevo.ts";
import { renderEmail } from "../_shared/email-templates.ts";

interface InvitePayload {
  action: "invite" | "resend_invite" | "reset_password";
  email: string;
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

// Generate a readable 12-char temporary password with at least one of each
// class. Ambiguous characters (0/O, 1/l/I) are excluded on purpose.
const generateTempPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (set: string) =>
    set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = chars.length; i < 12; i++) chars.push(pick(all));
  // Fisher-Yates shuffle so the guaranteed chars are not always positions 0-3.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

// Columns added by the staff_onboarding migration. Stripped on a retry if the
// migration has not been applied yet.
const ONBOARDING_KEYS = [
  "onboarding_status",
  "invite_sent_at",
  "invite_email_status",
  "invite_email_error",
];

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
    for (const k of ONBOARDING_KEYS) delete stripped[k];
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
  let res = await apply(patch);
  if (res.error && isColumnError(res.error.message)) {
    const stripped = { ...patch };
    for (const k of ONBOARDING_KEYS) delete stripped[k];
    if (Object.keys(stripped).length > 0) await apply(stripped);
  }
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
    if (!body?.email) return jsonResponse(400, { error: "email required" });

    const email = body.email.trim().toLowerCase();
    const origin = new URL(req.url).origin;
    const loginUrl = body.login_url ?? body.redirect_to ?? `${origin}/login`;
    const branch = body.branch;

    // ── Action: resend invite ─────────────────────────────────────────────
    if (body.action === "resend_invite") {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, user_id, name, role")
        .ilike("email", email)
        .maybeSingle();
      if (!existing?.user_id) {
        return jsonResponse(404, {
          error: "No staff account found for this email",
        });
      }

      const tempPassword = generateTempPassword();
      const { error: pwErr } = await supabase.auth.admin.updateUserById(
        existing.user_id as string,
        { password: tempPassword },
      );
      if (pwErr) return jsonResponse(400, { error: pwErr.message });

      const mail = renderEmail(
        "staff-welcome",
        {
          staffName: (existing.name as string) ?? "there",
          roleLabel: roleLabel(existing.role as string),
          loginEmail: email,
          loginUrl,
          tempPassword,
        },
        branch,
      );
      const sent = await sendBrevoEmail({
        to: [{ email, name: (existing.name as string) ?? undefined }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ["staff-welcome", "resend"],
      });

      await patchProfile(
        supabase,
        { id: existing.id as string },
        {
          onboarding_status: sent.ok ? "invite_sent" : "pending",
          invite_sent_at: new Date().toISOString(),
          invite_email_status: sent.status,
          invite_email_error: sent.error ?? null,
        },
      );
      await logEvent(supabase, {
        profile_id: existing.id as string,
        event_type: sent.ok ? "invite_resent" : "invite_email_failed",
        detail: sent.ok
          ? "Welcome email re-sent with a new temporary password"
          : sent.error,
        ...actor,
      });

      return jsonResponse(200, {
        ok: true,
        action: "resend_invite",
        email_status: sent.status,
        email_error: sent.error,
        temp_password: tempPassword,
      });
    }

    // ── Action: reset password ────────────────────────────────────────────
    if (body.action === "reset_password") {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: loginUrl },
      });
      if (error) return jsonResponse(400, { error: error.message });
      const resetLink = data?.properties?.action_link ?? loginUrl;

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name")
        .ilike("email", email)
        .maybeSingle();

      const mail = renderEmail(
        "staff-password-reset",
        {
          staffName: (prof?.name as string) ?? "there",
          loginEmail: email,
          resetLink,
        },
        branch,
      );
      const sent = await sendBrevoEmail({
        to: [{ email, name: (prof?.name as string) ?? undefined }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ["staff-password-reset"],
      });

      if (prof?.id) {
        await logEvent(supabase, {
          profile_id: prof.id as string,
          event_type: "password_reset",
          detail: sent.ok
            ? "Password reset email sent"
            : `Password reset email not sent: ${sent.error}`,
          ...actor,
        });
      }

      return jsonResponse(200, {
        ok: true,
        action: "reset_password",
        email_status: sent.status,
        email_error: sent.error,
        link: resetLink,
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
    if (createErr) return jsonResponse(400, { error: createErr.message });
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
