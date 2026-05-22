import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { examLookupsService, examResultsService } from "../services";

// Query hooks for exam results, the marks-entry roster and form lookups.

/** Recorded results for one exam. */
export const useExamResults = (examId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.examResults(examId ?? ""),
    queryFn: () => examResultsService.listForExam(examId as string),
    enabled: !!examId,
  });

/** Standards / batches / subjects for the exam form. */
export const useExamLookups = () =>
  useQuery({
    queryKey: queryKeys.exams.lookups("form"),
    queryFn: () => examLookupsService.all(),
    staleTime: 5 * 60 * 1000,
  });

/** Active students of a batch — the marks-entry roster. */
export const useBatchRoster = (batchId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.lookups(`roster:${batchId ?? ""}`),
    queryFn: () => examLookupsService.studentsByBatch(batchId as string),
    enabled: !!batchId,
  });
