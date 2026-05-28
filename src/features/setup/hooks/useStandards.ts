import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { standardsService } from "../services/standards.service";
import { LOOKUP_STALE_TIME, invalidateSetupLookups } from "../lib/setupSync";
import type { StandardInput } from "../types/setup.types";

export const useStandards = () =>
  useQuery({
    queryKey: queryKeys.setup.standards(),
    queryFn: () => standardsService.list(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCreateStandard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StandardInput) => standardsService.create(input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Standard created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateStandard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<StandardInput> }) =>
      standardsService.update(id, input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Standard updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteStandard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => standardsService.remove(id),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Standard deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};

// ── standard ↔ course type assignments ──────────────────────────────────────
export const useStandardCourseTypes = (standardId: string | undefined) =>
  useQuery({
    queryKey: standardId
      ? queryKeys.setup.standardCourseTypes(standardId)
      : ["setup", "standard-course-types", "noop"],
    queryFn: () => standardsService.listAssignedCourseTypes(standardId as string),
    enabled: !!standardId,
    staleTime: 60_000,
  });

export const useSetStandardCourseTypes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ standardId, courseTypeIds }: { standardId: string; courseTypeIds: string[] }) =>
      standardsService.setAssignedCourseTypes(standardId, courseTypeIds),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.standardCourseTypes(args.standardId) });
      invalidateSetupLookups(qc);
      toast.success("Streams updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
