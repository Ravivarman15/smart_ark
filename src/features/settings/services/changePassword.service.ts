import { BaseService, AppError } from "@/shared/services";

// Change-password flow.
//
//   1. Re-authenticate with the current password via `signInWithPassword`
//      to verify the user actually knows it. Supabase Auth has no first-class
//      "verify current password" endpoint, so a fresh sign-in is the safe
//      proxy. Failure → throw with PermissionDenied.
//   2. Call `updateUser({ password })` for the new password.
//   3. Caller is responsible for forcing a sign-out (handled in the hook so
//      the React Query cache + AuthContext both reset).
//
// NEVER stores the raw password locally. The verification sign-in result is
// not persisted — only its error/success flag.

class ChangePasswordService extends BaseService {
  async verifyAndChange(args: {
    email: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    // Step 1: verify current password by re-auth. This is the canonical
    // technique against Supabase Auth.
    const verify = await this.db.auth.signInWithPassword({
      email: args.email,
      password: args.currentPassword,
    });
    if (verify.error) {
      // Map auth errors into our AppError taxonomy.
      throw AppError.permission(
        verify.error.message?.toLowerCase().includes("invalid")
          ? "Current password is incorrect"
          : verify.error.message || "Unable to verify current password"
      );
    }

    // Step 2: perform the update. Supabase rotates the access token on
    // success — the AuthContext listener picks it up.
    const upd = await this.db.auth.updateUser({ password: args.newPassword });
    if (upd.error) {
      throw AppError.validation(upd.error.message || "Password update failed");
    }
  }
}

export const changePasswordService = new ChangePasswordService();
