import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feeAnalyticsService } from "../services/feeAnalytics.service";
import { refundsService } from "../services/refunds.service";

/** Headline collection / pending / refund analytics. */
export const useFeeAnalytics = () =>
  useQuery({
    queryKey: queryKeys.fees.analytics("summary"),
    queryFn: () => feeAnalyticsService.summary(),
  });

/** Records with an outstanding balance (pending-fee report feed). */
export const usePendingFees = () =>
  useQuery({
    queryKey: queryKeys.fees.analytics("pending"),
    queryFn: () => feeAnalyticsService.pendingRecords(),
  });

/** Refund audit log. */
export const useFeeRefunds = () =>
  useQuery({
    queryKey: queryKeys.fees.refunds(),
    queryFn: () => refundsService.list(),
  });
