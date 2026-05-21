import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { courseTypesService } from "../services/courseTypes.service";
import type { CourseTypeInput } from "../types/setup.types";

export const useCourseTypes = () =>
  useQuery({
    queryKey: queryKeys.setup.courseTypes(),
    queryFn: () => courseTypesService.list(),
    staleTime: 5 * 60_000,
  });

export const useCreateCourseType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CourseTypeInput) => courseTypesService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.courseTypes() });
      toast.success("Course type created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateCourseType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CourseTypeInput> }) =>
      courseTypesService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.courseTypes() });
      toast.success("Course type updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteCourseType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => courseTypesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.courseTypes() });
      toast.success("Course type deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
