import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { batchesService } from "../services/batches.service";
import type { BatchInput } from "../types/setup.types";

export const useBatches = (filters?: {
  standardId?: string;
  courseTypeId?: string;
  isActive?: boolean;
}) =>
  useQuery({
    queryKey: queryKeys.setup.batches(filters),
    queryFn: () => batchesService.list(filters),
    staleTime: 60_000,
  });

export const useCreateBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BatchInput) => batchesService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Batch created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BatchInput> }) =>
      batchesService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Batch updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => batchesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.all });
      toast.success("Batch deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};

export const useBatchSubjects = (batchId: string | undefined) =>
  useQuery({
    queryKey: batchId
      ? queryKeys.setup.batchSubjects(batchId)
      : ["setup", "batch-subjects", "noop"],
    queryFn: () => batchesService.listSubjects(batchId as string),
    enabled: !!batchId,
    staleTime: 60_000,
  });

export const useSetBatchSubjects = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, subjectIds }: { batchId: string; subjectIds: string[] }) =>
      batchesService.setSubjects(batchId, subjectIds),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.batchSubjects(args.batchId) });
      toast.success("Subjects updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
