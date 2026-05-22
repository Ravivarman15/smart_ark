import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { feeLookupsService, feeStructureService } from "../services";
import type { FeeStructureInput } from "../types/fee.types";

// React Query hooks for fee structures + the structure-form lookups.

/** All fee structures, newest first. */
export const useFeeStructures = () =>
  useQuery({
    queryKey: queryKeys.fees.structures(),
    queryFn: () => feeStructureService.list(),
  });

/** Reference data for the structure form (course types, taxes, …). */
export const useFeeLookups = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("structure-form"),
    queryFn: () => feeLookupsService.all(),
    staleTime: 5 * 60 * 1000,
  });

/** Revision history for one structure. Disabled until an id is supplied. */
export const useFeeStructureRevisions = (structureId: string | null) =>
  useQuery({
    queryKey: queryKeys.fees.structureRevisions(structureId ?? ""),
    queryFn: () => feeStructureService.listRevisions(structureId as string),
    enabled: !!structureId,
  });

export const useCreateFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FeeStructureInput) => feeStructureService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};

export const useUpdateFeeStructure = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: {
      id: string;
      input: Partial<FeeStructureInput>;
      note?: string;
    }) =>
      feeStructureService.update(args.id, args.input, {
        revisionNote: args.note,
        revisedBy: user?.profileId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};

export const useDeleteFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => feeStructureService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.fees.all }),
  });
};
