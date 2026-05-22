import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { mcqQuestionService } from "../services";
import type { QuestionBankFilters } from "../types/mcq.types";

// Query hooks for the MCQ question bank. The current user's id is folded into
// the query key so the per-user `isFavorite` flag is cached correctly.

/** Search + filter the question bank. */
export const useMcqQuestions = (filters: QuestionBankFilters = {}) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.exams.mcqQuestions({
      ...filters,
      _user: user?.profileId ?? "anon",
    }),
    queryFn: () => mcqQuestionService.list(filters, user?.profileId),
  });
};

/** One bank question by id. */
export const useMcqQuestion = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.exams.mcqQuestion(id ?? ""),
    queryFn: () => mcqQuestionService.getById(id as string),
    enabled: !!id,
  });

/** Distinct chapter names — feeds the chapter filter + weightage editor. */
export const useMcqChapters = (subjectId?: string) =>
  useQuery({
    queryKey: queryKeys.exams.mcqChapters(subjectId),
    queryFn: () => mcqQuestionService.distinctChapters(subjectId),
    staleTime: 60_000,
  });
