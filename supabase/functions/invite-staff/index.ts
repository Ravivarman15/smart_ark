// Edge function: invite-staff
//
// Provisions a staff member end-to-end:
//   1. Verifies the caller is an authenticated management or admin user.
//   2. Sends a Supabase Auth invite (or password reset) email — no
//      plaintext passwords ever leave the server.
//   3. Inserts/updates the matching `profiles` row with the new fields
//      (first/last/gender/mobile/email/address/picture/department/...).
//
// Why server-side only:
//   - `supabase.auth.admin.*` needs the service-role key. Calling this from
//     the browser would leak the key.
//   - We need to atomically (best-effort) create the auth user AND the
//     profile row. If the profile insert fails, the auth user is rolled back.
//
// Operations supported (action field in the body):
//   - "invite"          — create auth user via invite, then profile
//   - "resend_invite"   — re-trigger Supabase invite for an existing email
//   - "reset_password"  — send a password reset email
//
// All requests require `Authorization: Bearer <jwt>` from a logged-in user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  action: "invite" | "resend_invite" | "reset_password";
  email: string;
  // Only required when action === "invite"
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
    joining_date?: string | null; // YYYY-MM-DD
    campus_id?: string | null;
    subject?: string | null;
    status?: string | null;
  };
  /** Override the default redirect after the invitee sets their password. */
  redirect_to?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const token = authHeader.replace("Bearer ", "");
    let callerUserId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      callerUserId = payload.sub || null;
    } catch {
      // invalid jwt shape
    }
    if (!callerUserId) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Role gate: only management or admin may invite/manage staff accounts.
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (!callerProfile || !["management", "admin"].includes(callerProfile.role)) {
      return json(403, { error: "Forbidden — management or admin role required" });
    }

    const body = (await req.json()) as InvitePayload;
    if (!body?.email) return json(400, { error: "email required" });

    const email = body.email.trim().toLowerCase();
    const redirectTo =
      body.redirect_to ?? `${new URL(req.url).origin.replace(/^https?:\/\/[^/]+/, "")}/login`;

    // ── Action: resend invite ─────────────────────────────────────────────
    if (body.action === "resend_invite") {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, action: "resend_invite" });
    }

    // ── Action: reset password ────────────────────────────────────────────
    if (body.action === "reset_password") {
      // Generate a recovery link; Supabase sends the email automatically when
      // SMTP is configured. Returns the link so the caller can surface it for
      // copy-paste in dev environments without SMTP.
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, action: "reset_password", link: data?.properties?.action_link });
    }

    // ── Action: invite (default) ──────────────────────────────────────────
    if (!body.profile) return json(400, { error: "profile required for invite" });

    const profile = body.profile;
    if (!profile.first_name || !profile.last_name || !profile.role) {
      return json(400, { error: "first_name, last_name and role are required" });
    }

    // Duplicate-email guard. The profiles table has a unique index but
    // catching here gives the UI a clearer message than a 23505.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfile) {
      return json(409, { error: "A staff member with this email already exists" });
    }

    // 1) Create the auth user via the invite flow. This sends the email and
    //    returns a user record we can attach to a profile row.
    const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          role: profile.role,
        },
      }
    );
    if (inviteErr) return json(400, { error: inviteErr.message });
    const newUser = invite.user;
    if (!newUser) return json(500, { error: "Auth invite did not return a user" });

    // 2) Insert/update the profile. The DB has a trigger that auto-creates a
    //    bare profile row when an auth user is created; we upsert by user_id
    //    so it always lands as a single row regardless of trigger timing.
    const profileRow = {
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
      // name is filled by the profiles_compose_name trigger
      name: `${profile.first_name} ${profile.last_name}`.trim(),
    };

    const { data: upsertedProfile, error: upsertErr } = await supabase
      .from("profiles")
      .upsert(profileRow, { onConflict: "user_id" })
      .select("id")
      .single();

    if (upsertErr) {
      // Roll back the auth user if profile insert failed — leaves a clean
      // slate so the caller can retry with corrected data.
      await supabase.auth.admin.deleteUser(newUser.id).catch(() => {});
      return json(400, { error: upsertErr.message });
    }

    return json(200, {
      ok: true,
      action: "invite",
      user_id: newUser.id,
      profile_id: upsertedProfile?.id,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
