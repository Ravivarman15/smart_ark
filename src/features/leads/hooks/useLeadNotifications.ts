import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { leadNotificationsService } from "../services/leadNotifications.service";

export const useLeadNotifications = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.leads.notifications(user?.profileId),
    queryFn: () => leadNotificationsService.listForRecipient(user!.profileId!),
    enabled: !!user?.profileId,
  });
};

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => leadNotificationsService.markRead(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.leads.notifications(user?.profileId) }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<void, Error, void>({
    mutationFn: () => leadNotificationsService.markAllRead(user!.profileId!),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.leads.notifications(user?.profileId) }),
  });
};
