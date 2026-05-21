import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { liveClassMessagingService } from "../services/liveClassMessaging.service";

/** WhatsApp / SMS delivery log for a live class. */
export const useLiveClassMessages = (liveClassId?: string) =>
  useQuery({
    queryKey: queryKeys.liveClasses.messages(liveClassId ?? ""),
    queryFn: () => liveClassMessagingService.listForClass(liveClassId as string),
    enabled: !!liveClassId,
  });

/** Re-queue a failed outbound message. */
export const useRetryMessage = (liveClassId?: string) => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (messageId) => liveClassMessagingService.retry(messageId),
    onSuccess: () => {
      if (liveClassId)
        qc.invalidateQueries({ queryKey: queryKeys.liveClasses.messages(liveClassId) });
    },
  });
};
