import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { gradeSchemeService } from "../services";
import type { GradingSchemeInput } from "../types/exam.types";

// Query + mutation hooks for reusable grading schemes.

/** All grading schemes (defaults first). */
export const useGradeSchemes = () =>
  useQuery({
    queryKey: queryKeys.exams.gradeSchemes(),
    queryFn: () => gradeSchemeService.list(),
  });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.exams.gradeSchemes() });
};

export const useCreateGradeScheme = () => {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: GradingSchemeInput) =>
      gradeSchemeService.create(input, user?.profileId),
    onSuccess: invalidate,
  });
};

export const useUpdateGradeScheme = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { id: string; input: GradingSchemeInput }) =>
      gradeSchemeService.update(args.id, args.input),
    onSuccess: invalidate,
  });
};

export const useDeleteGradeScheme = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => gradeSchemeService.remove(id),
    onSuccess: invalidate,
  });
};
