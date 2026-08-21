import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import {
  mcqAttemptService,
  mcqExamAnalyticsService,
} from "../services";
import { onlineTestService } from "../services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// Live monitoring hooks. The monitor snapshot + attempt event log poll on an
// interval ("live" without a realtime subscription); force-submit / reopen are
// staff control mutations.
// ─────────────────────────────────────────────────────────────────────────────

/** Live monitor snapshot — polls every 8 s while the panel is open. */
export const useMcqExamMonitor = (examId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqExamMonitor(examId ?? ""),
    queryFn: () => mcqExamAnalyticsService.monitor(examId as string),
    enabled: !!examId,
    refetchInterval: 8_000,
  });

/** Anti-cheat + lifecycle events for one attempt. */
export const useAttemptEvents = (attemptId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqAttemptEvents(attemptId ?? ""),
    queryFn: () => mcqAttemptService.listEvents(attemptId as string),
    enabled: !!attemptId,
  });

/** Staff force-submits a student's attempt. */
export const useForceSubmitAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) =>
      onlineTestService.forceSubmit(attemptId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.exams.all }),
  });
};

/** Staff reopens a closed attempt. */
export const useReopenAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) => mcqAttemptService.reopen(attemptId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.exams.all }),
  });
};
