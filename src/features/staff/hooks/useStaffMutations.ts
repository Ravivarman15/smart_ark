import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { staffService } from "../services/staff.service";
import { authProvisionService } from "../services/authProvision.service";
import { emailService } from "../services/email.service";
import { staffStorageService } from "../services/storage.service";
import type {
  CreateStaffInput,
  InviteStaffInput,
  Staff,
  UpdateStaffInput,
} from "../types/staff.types";

/**
 * Profile-only create. Kept for the AppDataContext bridge (legacy
 * "addTeacher" path) — doesn't create an auth user.
 *
 * For the new Create Staff UI use `useInviteStaff` instead, which
 * provisions auth + profile + email invite together.
 */
export const useCreateStaff = () => {
  const qc = useQueryClient();
  return useMutation<Staff, Error, CreateStaffInput>({
    mutationFn: (input) => staffService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

/**
 * Full onboarding flow: edge function creates auth user → row in `profiles`
 * → sends invite email. Returns the new profile id.
 */
export const useInviteStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStaffInput) => authProvisionService.invite(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

/**
 * Resend the welcome email with a freshly generated temporary password.
 * Invalidates the staff list so the onboarding badge reflects the new
 * `invite_sent_at` / email status.
 */
export const useResendInvite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => emailService.resendWelcomeEmail(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

export const useResetStaffPassword = () =>
  useMutation({ mutationFn: (email: string) => emailService.sendPasswordReset(email) });

export const useUpdateStaff = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; updates: UpdateStaffInput }>({
    mutationFn: ({ id, updates }) => staffService.update(id, updates),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.staff.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
};

export const useDeactivateStaff = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => staffService.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

export const useActivateStaff = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => staffService.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

export const useSuspendStaff = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => staffService.suspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
  });
};

/**
 * Upload a new profile picture to Supabase Storage and return the public URL.
 * The caller still needs to persist the URL to the staff row — typically via
 * `useUpdateStaff`. Kept separate so the form can preview before saving.
 */
export const useUploadProfilePicture = () =>
  useMutation({
    mutationFn: (args: { ownerId: string; file: File | Blob }) =>
      staffStorageService.uploadProfilePicture(args),
  });
