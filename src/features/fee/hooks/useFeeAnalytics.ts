import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feeAnalyticsService, feeReminderService } from "../services";

/** Institute-wide fee analytics snapshot (collection rate, aging, trend). */
export const useFeeAnalytics = () =>
  useQuery({
    queryKey: queryKeys.fees.analytics("institute"),
    queryFn: () => feeAnalyticsService.compute(),
    staleTime: 60 * 1000,
  });

/** Recently queued fee reminders — the reminder outbox view. */
export const useFeeReminderOutbox = () =>
  useQuery({
    queryKey: queryKeys.fees.analytics("reminders"),
    queryFn: () => feeReminderService.listQueued(),
    staleTime: 30 * 1000,
  });
