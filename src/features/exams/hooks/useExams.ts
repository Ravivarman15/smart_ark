import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { examService } from "../services";
import type { ExamMode, ExamStatus } from "../types/exam.types";

// Query hooks for exam definitions.

export interface ExamListParams {
  mode?: ExamMode;
  status?: ExamStatus;
  academicYearId?: string;
  term?: string;
  month?: string;
  standardId?: string;
  batchId?: string;
  subjectId?: string;
}

/** List exams. The Manual pages pass `{ mode: "manual" }`. */
export const useExams = (params?: ExamListParams) =>
  useQuery({
    queryKey: queryKeys.exams.list(params as Record<string, unknown> | undefined),
    queryFn: () => examService.list(params),
  });

/** A single exam. Disabled until an id is supplied. */
export const useExam = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.detail(id ?? ""),
    queryFn: () => examService.getById(id as string),
    enabled: !!id,
  });
