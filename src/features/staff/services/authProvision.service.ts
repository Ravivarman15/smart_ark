import { BaseService, AppError } from "@/shared/services";
import { loginUrl } from "../utils/appUrl";
import type { InviteStaffInput, InviteStaffResult } from "../types/staff.types";

// Auth provisioning service.
//
// This is the *only* code path that should create a staff account end-to-end
// (auth user + profile row + welcome email). It delegates the privileged work
// to the `invite-staff` edge function so the service-role key and the Brevo
// secrets never live in the browser.
//
// Why an edge function (and not direct `supabase.auth.admin.*`):
//   - `auth.admin.*` requires the service-role key — must stay server-side.
//   - The edge function gates by role (management or admin) — defence in
//     depth against a stolen JWT.
//   - It generates the temporary password, sends the welcome email and writes
//     the onboarding audit trail in one server-side transaction.

/**
 * Pull the real error message out of a Supabase FunctionsHttpError. The SDK's
 * `error.message` is generic ("non-2xx status code"); the useful message is in
 * the response body exposed via `error.context`.
 */
const readEdgeError = async (error: unknown, fallback: string): Promise<string> => {
  let message = (error as { message?: string })?.message ?? fallback;
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) message = body.error as string;
    }
  } catch {
    /* body not JSON / already consumed — keep the generic message */
  }
  return message;
};

class AuthProvisionService extends BaseService {
  /**
   * Create a staff account: auth user + profile + welcome email.
   * Throws `AppError.conflict` if the email is already in use.
   */
  async invite(input: InviteStaffInput): Promise<InviteStaffResult> {
    const payload = {
      action: "invite" as const,
      email: input.email,
      profile: {
        first_name: input.firstName,
        middle_name: input.middleName ?? null,
        last_name: input.lastName,
        gender: input.gender ?? null,
        mobile: input.mobile ?? null,
        address: input.address ?? null,
        profile_picture_url: input.profilePictureUrl ?? null,
        role: input.role,
        department: input.department ?? null,
        designation: input.designation ?? null,
        joining_date: input.joiningDate ?? null,
        campus_id: input.campusId ?? null,
        subject: input.subject ?? null,
        status: input.status ?? "invited",
      },
      login_url: loginUrl(),
    };

    const { data, error } = await this.db.functions.invoke("invite-staff", {
      body: payload,
    });

    if (error) {
      const message = await readEdgeError(error, "Invite failed");
      if (/already exists/i.test(message)) throw AppError.conflict(message);
      throw AppError.fromSupabase({ message } as never, "invite-staff");
    }

    const res = (data ?? {}) as Record<string, unknown>;
    if (typeof res.error === "string" && !res.ok) {
      const msg = res.error;
      if (/already exists/i.test(msg)) throw AppError.conflict(msg);
      throw AppError.validation(msg);
    }

    return {
      ok: true,
      userId: res.user_id as string,
      profileId: res.profile_id as string,
      emailStatus:
        (res.email_status as InviteStaffResult["emailStatus"]) ?? "skipped",
      emailError: res.email_error as string | undefined,
      tempPassword: res.temp_password as string | undefined,
      brevoConfigured: res.brevo_configured as boolean | undefined,
    };
  }

  /**
   * Permanently delete a staff member — both the `profiles` row and the
   * Supabase Auth login. Routed through the edge function because deleting
   * the Auth user needs the service-role key, and the function re-checks the
   * caller is admin/management (defence in depth).
   *
   * Throws `AppError.conflict` if the staff member has linked history
   * (attendance, class logs, results) that blocks a hard delete — the caller
   * should suggest deactivation instead. Returns an optional `warning` when
   * the profile was removed but the Auth login could not be.
   */
  async remove(profileId: string): Promise<{ warning?: string }> {
    const { data, error } = await this.db.functions.invoke("invite-staff", {
      body: { action: "delete", profile_id: profileId },
    });

    if (error) {
      const message = await readEdgeError(error, "Delete failed");
      if (/linked records|cannot be permanently deleted/i.test(message)) {
        throw AppError.conflict(message);
      }
      throw AppError.fromSupabase({ message } as never, "invite-staff");
    }

    const res = (data ?? {}) as Record<string, unknown>;
    if (typeof res.error === "string" && !res.ok) {
      const msg = res.error;
      if (/linked records|cannot be permanently deleted/i.test(msg)) {
        throw AppError.conflict(msg);
      }
      throw AppError.validation(msg);
    }

    return { warning: res.warning as string | undefined };
  }
}

export const authProvisionService = new AuthProvisionService();
