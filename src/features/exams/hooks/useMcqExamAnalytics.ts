import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { mcqExamAnalyticsService } from "../services";

// Analytics, leaderboard and student-result query hooks for the MCQ exam
// engine.

/** Full exam analytics — toppers, sections, weak chapters, question difficulty. */
export const useMcqExamAnalytics = (examId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqExamAnalytics(examId ?? ""),
    queryFn: () => mcqExamAnalyticsService.analytics(examId as string),
    enabled: !!examId,
  });

/** Live leaderboard — polls every 15 s for in-progress exams. */
export const useMcqLeaderboard = (examId: string | null, live = false) =>
  useQuery({
    queryKey: queryKeys.exams.mcqLeaderboard(examId ?? ""),
    queryFn: () => mcqExamAnalyticsService.leaderboard(examId as string),
    enabled: !!examId,
    refetchInterval: live ? 15_000 : false,
  });

/** A student's detailed result for one attempt. */
export const useStudentExamResult = (attemptId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqStudentResult(attemptId ?? ""),
    queryFn: () => mcqExamAnalyticsService.studentResult(attemptId as string),
    enabled: !!attemptId,
  });
