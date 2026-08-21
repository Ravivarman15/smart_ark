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

/**
 * MCQ exams one student may attempt.
 *
 * Keyed on the STUDENT, not the batch: a test can now be assigned to a named
 * student, so two children of the same batch no longer necessarily see the same
 * list — and a batch-keyed cache would serve one of them the other's.
 */
export const useStudentMcqExams = (
  studentId: string | null,
  batchId?: string,
  standardId?: string,
) =>
  useQuery({
    queryKey: queryKeys.exams.mcqStudentExams(studentId ?? ""),
    queryFn: () =>
      mcqExamService.listForStudent(studentId as string, batchId, standardId),
    enabled: !!studentId,
  });
