import { BaseService, AppError } from "@/shared/services";

// Invite/reset helpers that piggy-back on the same `invite-staff` edge
// function used by `authProvisionService`. Kept in a separate service so
// the invite/reset surface is independent of the create flow — useful when
// onboarding tracking gets its own UI.

interface InviteOpResult {
  ok: true;
  action: "resend_invite" | "reset_password";
  /** Recovery link returned by the edge function (dev/no-SMTP convenience). */
  link?: string;
}

class InviteService extends BaseService {
  /**
   * Re-send the Supabase auth invite email. Useful when the original invite
   * expired or the user lost it.
   */
  async resendInvite(email: string): Promise<InviteOpResult> {
    return this.callEdge({ action: "resend_invite", email });
  }

  /**
   * Send a password reset email. Used both for staff who forgot their
   * password and for management who wants to force a reset.
   */
  async sendPasswordReset(email: string): Promise<InviteOpResult> {
    return this.callEdge({ action: "reset_password", email });
  }

  private async callEdge(body: Record<string, unknown>): Promise<InviteOpResult> {
    const { data, error } = await this.db.functions.invoke("invite-staff", { body });
    if (error) {
      throw AppError.fromSupabase({ message: error.message } as never, "invite-staff");
    }
    const res = data as InviteOpResult | { error: string };
    if (res && "error" in res) throw AppError.validation(res.error);
    return res as InviteOpResult;
  }
}

export const inviteService = new InviteService();
