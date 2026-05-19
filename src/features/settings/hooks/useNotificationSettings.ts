import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { notificationSettingsService } from "../services/notificationSettings.service";
import { settingsAuditService } from "../services/audit.service";
import type { NotificationPreferenceUpsert } from "../types/settings.types";

export const useNotificationSettings = () => {
  const { user } = useAuth();
  const profileId = user?.profileId;
  return useQuery({
    queryKey: profileId
      ? queryKeys.settings.notifications(profileId)
      : ["settings", "notifications", "noop"],
    queryFn: () => notificationSettingsService.listForUser(profileId as string),
    enabled: !!profileId,
    staleTime: 60_000,
  });
};

export const useUpsertNotificationPref = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: NotificationPreferenceUpsert) => {
      await notificationSettingsService.upsert(input);
      await settingsAuditService.record({
        actorId: user?.profileId,
        area: "notification_pref",
        changeKey: `${input.channel}.${input.category}`,
        newValue: { enabled: input.enabled },
      });
    },
    onSuccess: (_v, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.notifications(input.profileId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
