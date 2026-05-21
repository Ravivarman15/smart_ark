import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { subjectsService } from "../services/subjects.service";
import type { SubjectInput } from "../types/setup.types";

export const useSubjects = (filters?: { standardId?: string }) =>
  useQuery({
    queryKey: queryKeys.setup.subjects(filters),
    queryFn: () => subjectsService.list(filters),
    staleTime: 60_000,
  });

export const useCreateSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectInput) => subjectsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Subject created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SubjectInput> }) =>
      subjectsService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Subject updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subjectsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Subject deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
