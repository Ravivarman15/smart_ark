import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { mcqAnalyticsService, mcqAuditService } from "../services";

// Analytics + audit query hooks for the MCQ Paper module.

/** Chapter / difficulty / complexity analytics for one paper. */
export const useMcqPaperAnalytics = (paperId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqAnalytics(paperId ?? ""),
    queryFn: () => mcqAnalyticsService.forPaper(paperId as string),
    enabled: !!paperId,
  });

/** Audit trail for one paper. */
export const useMcqPaperAudit = (paperId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.audit(`mcq-paper:${paperId ?? ""}`),
    queryFn: () => mcqAuditService.listForEntity("paper", paperId as string),
    enabled: !!paperId,
  });
