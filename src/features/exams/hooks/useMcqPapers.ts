import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { mcqPaperService } from "../services";
import type { McqPaperStatus } from "../types/mcq.types";

// Query hooks for MCQ papers, their question sets, overview tiles and version
// history.

interface PaperListParams {
  status?: McqPaperStatus;
  subjectId?: string;
  search?: string;
}

/** List MCQ papers, newest first. */
export const useMcqPapers = (params: PaperListParams = {}) =>
  useQuery({
    queryKey: queryKeys.exams.mcqPapers(params),
    queryFn: () => mcqPaperService.list(params),
  });

/** One paper by id. */
export const useMcqPaper = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqPaper(id ?? ""),
    queryFn: () => mcqPaperService.getById(id as string),
    enabled: !!id,
  });

/** A paper's question set, joined with the bank records and ordered. */
export const useMcqPaperQuestions = (paperId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqPaperQuestions(paperId ?? ""),
    queryFn: () => mcqPaperService.getQuestions(paperId as string),
    enabled: !!paperId,
  });

/** Paper-count tiles for the Manage hub. */
export const useMcqPaperOverview = () =>
  useQuery({
    queryKey: queryKeys.exams.mcqOverview(),
    queryFn: () => mcqPaperService.overview(),
  });

/** Version history of a paper. */
export const useMcqPaperVersions = (paperId: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqPaperVersions(paperId ?? ""),
    queryFn: () => mcqPaperService.listVersions(paperId as string),
    enabled: !!paperId,
  });
