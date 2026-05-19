import { BaseService, AppError } from "@/shared/services";
import type { InviteStaffInput } from "../types/staff.types";

// Auth provisioning service.
//
// This is the *only* code path that should create a staff account end-to-end
// (auth user + profile row + invite email). It delegates the privileged work
// to the `invite-staff` edge function so the service-role key never lives in
// the browser.
//
// Why an edge function (and not direct `supabase.auth.admin.*`):
//   - `auth.admin.*` requires the service-role key. We must keep that on the
//     server.
//   - The edge function gates by role (management or admin) — defence in
//     depth against a stolen JWT.

interface InviteResult {
  ok: true;
  action: "invite";
  user_id: string;
  profile_id: string;
}

class AuthProvisionService extends BaseService {
  /**
   * Create a staff account: auth user + profile + invite email.
   * Throws `AppError.conflict` if the email is already in use.
   */
  async invite(input: InviteStaffInput): Promise<InviteResult> {
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
      redirect_to: `${window.location.origin}/login`,
    };

    const { data, error } = await this.db.functions.invoke("invite-staff", {
      body: payload,
    });

    if (error) {
      // FunctionsHttpError exposes `.context` with the response body in some
      // versions of supabase-js; fall back to message if not available.
      const message =
        (error as unknown as { message?: string }).message ?? "Invite failed";
      // 409 = duplicate email; surface as a Conflict so the UI shows the
      // proper error chip on the email field.
      if (message.toLowerCase().includes("already exists")) {
        throw AppError.conflict(message);
      }
      throw AppError.fromSupabase({ message } as never, "invite-staff");
    }

    const res = data as InviteResult | { error: string };
    if (res && "error" in res) {
      const msg = res.error;
      if (msg.toLowerCase().includes("already exists")) throw AppError.conflict(msg);
      throw AppError.validation(msg);
    }
    return res as InviteResult;
  }
}

export const authProvisionService = new AuthProvisionService();
