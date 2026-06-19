import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leadWhatsappAnalyticsService, type WhatsappLogsQuery } from "../services/leadWhatsappAnalytics.service";

/** Raw enriched WhatsApp delivery log rows for the delivery dashboard. */
export const useWhatsappDelivery = (params: WhatsappLogsQuery = {}) =>
  useQuery({
    queryKey: queryKeys.leads.whatsappDelivery(params as Record<string, unknown>),
    queryFn: () => leadWhatsappAnalyticsService.fetchLogs(params),
  });
