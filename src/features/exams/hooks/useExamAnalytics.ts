import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { examAnalyticsService, examAuditService } from "../services";

// Read-side hooks: per-exam analytics, the Manage-page overview, audit history.

/** Full analytics for one exam — stats, grade mix, toppers, ranked rows. */
export const useExamAnalytics = (examId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.analytics(examId ?? ""),
    queryFn: () => examAnalyticsService.forExam(examId as string),
    enabled: !!examId,
  });

/** Headline counts across all manual exams. */
export const useExamOverview = () =>
  useQuery({
    queryKey: queryKeys.exams.analytics("overview"),
    queryFn: () => examAnalyticsService.overview(),
    staleTime: 60 * 1000,
  });

/** Audit trail for one exam. */
export const useExamAudit = (examId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.audit(examId ?? ""),
    queryFn: () => examAuditService.listForExam(examId as string),
    enabled: !!examId,
  });
