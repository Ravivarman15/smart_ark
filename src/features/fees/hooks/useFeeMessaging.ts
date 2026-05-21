import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feeMessagingService } from "../services/feeMessaging.service";
import type { FeeMessageTarget } from "../services/feeMessaging.service";

const MSG_KEY = [...queryKeys.fees.all, "messages"] as const;

/** Recent fee-related WhatsApp messages — delivery tracking. */
export const useFeeMessages = () =>
  useQuery({
    queryKey: MSG_KEY,
    queryFn: () => feeMessagingService.listRecent(),
  });

/** Queue bulk due / overdue reminders. */
export const useSendFeeReminders = () => {
  const qc = useQueryClient();
  return useMutation<
    { queued: number; skipped: boolean },
    Error,
    (FeeMessageTarget & { overdue?: boolean })[]
  >({
    mutationFn: (targets) => feeMessagingService.enqueueBulkReminders(targets),
    onSuccess: () => qc.invalidateQueries({ queryKey: MSG_KEY }),
  });
};

/** Re-queue a failed fee message. */
export const useRetryFeeMessage = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => feeMessagingService.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: MSG_KEY }),
  });
};
