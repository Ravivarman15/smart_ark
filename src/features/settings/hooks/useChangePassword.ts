import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { changePasswordService } from "../services/changePassword.service";
import { settingsAuditService } from "../services/audit.service";

interface Args {
  currentPassword: string;
  newPassword: string;
}

/**
 * Change-password mutation. On success the hook *forces a logout* — the
 * Supabase session is technically still valid after `updateUser`, but
 * forcing a fresh login is the safer UX for a credential change. Callers
 * should redirect to /login on success.
 */
export const useChangePassword = () => {
  const { user, logout } = useAuth();
  return useMutation({
    mutationFn: async (args: Args) => {
      if (!user?.email) throw new Error("No email in session");
      await changePasswordService.verifyAndChange({
        email: user.email,
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      });
      // Audit BEFORE signing out — once we logout the session is gone.
      await settingsAuditService.record({
        actorId: user.profileId,
        area: "password",
        // Never record the password itself, only the fact that it changed.
        newValue: { changedAt: new Date().toISOString() },
      });
    },
    onSuccess: () => {
      toast.success("Password updated — please log in again");
      // Force sign-out so the next session uses the new credentials.
      logout();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    },
  });
};
