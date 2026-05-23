import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { mcqExamService } from "../services";

// Query hooks for MCQ exams (staff side) and the student-visible exam list.

/** All MCQ exams, newest first. */
export const useMcqExams = () =>
  useQuery({
    queryKey: queryKeys.exams.mcqExams(),
    queryFn: () => mcqExamService.list(),
  });

/** One MCQ exam (exams row + config + assignments), or null when no id. */
export const useMcqExam = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqExam(id ?? ""),
    queryFn: () => mcqExamService.getById(id as string),
    enabled: !!id,
  });

/** Overview tiles for the Manage MCQ Exam hub. */
export const useMcqExamOverview = () =>
  useQuery({
    queryKey: queryKeys.exams.mcqExamOverview(),
    queryFn: () => mcqExamService.overview(),
  });

/** MCQ exams a student of `batchId` (and its standard) may attempt. */
export const useStudentMcqExams = (
  batchId: string | null,
  standardId?: string,
) =>
  useQuery({
    queryKey: queryKeys.exams.mcqStudentExams(batchId ?? ""),
    queryFn: () =>
      mcqExamService.listForStudent(batchId as string, standardId),
    enabled: !!batchId,
  });
