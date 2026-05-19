import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { settingsProfileService } from "../services/profile.service";
import { settingsAuditService } from "../services/audit.service";
import { staffStorageService } from "@/features/staff";
import type { ProfileUpdateInput } from "../types/settings.types";

export const useProfile = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: user?.id ? queryKeys.settings.profile(user.id) : ["settings", "profile", "noop"],
    queryFn: () => settingsProfileService.getForUser(user!.id, user!.email),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
};

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      if (!user?.profileId) throw new Error("No profile id in session");
      await settingsProfileService.update(user.profileId, input);
      await settingsAuditService.record({
        actorId: user.profileId,
        area: "profile",
        newValue: input,
      });
    },
    onSuccess: () => {
      if (user?.id) {
        qc.invalidateQueries({ queryKey: queryKeys.settings.profile(user.id) });
      }
      toast.success("Profile updated");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Update failed");
    },
  });
};

/**
 * Upload a profile picture and persist the URL onto the user's profile in a
 * single mutation so the UI only has to await once.
 */
export const useUploadProfileAvatar = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!user?.profileId) throw new Error("No profile id in session");
      const url = await staffStorageService.uploadProfilePicture({
        ownerId: user.profileId,
        file,
      });
      await settingsProfileService.update(user.profileId, { profilePictureUrl: url });
      await settingsAuditService.record({
        actorId: user.profileId,
        area: "profile",
        changeKey: "profile_picture_url",
        newValue: url,
      });
      return url;
    },
    onSuccess: () => {
      if (user?.id) {
        qc.invalidateQueries({ queryKey: queryKeys.settings.profile(user.id) });
      }
      toast.success("Profile picture updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
};
