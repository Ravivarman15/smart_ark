import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { examService } from "../services";
import type { ExamMode, ExamStatus } from "../types/exam.types";

// Query hooks for exam definitions.

/** List exams. The Manual pages pass `{ mode: "manual" }`. */
export const useExams = (params?: { mode?: ExamMode; status?: ExamStatus }) =>
  useQuery({
    queryKey: queryKeys.exams.list(params),
    queryFn: () => examService.list(params),
  });

/** A single exam. Disabled until an id is supplied. */
export const useExam = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.detail(id ?? ""),
    queryFn: () => examService.getById(id as string),
    enabled: !!id,
  });
