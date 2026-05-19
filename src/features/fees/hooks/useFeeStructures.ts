import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feeStructuresService } from "../services/feeStructures.service";
import type {
  CreateFeeStructureInput,
  FeeStructure,
  UpdateFeeStructureInput,
} from "../types/fee.types";

const KEY = ["fees", "structures"] as const;

/** List fee structures. Used by setup pages + dropdowns in admissions. */
export const useFeeStructures = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => feeStructuresService.list(),
  });

export const useCreateFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation<FeeStructure, Error, CreateFeeStructureInput>({
    mutationFn: (input) => feeStructuresService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useUpdateFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; updates: UpdateFeeStructureInput }>({
    mutationFn: ({ id, updates }) => feeStructuresService.update(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useDeleteFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => feeStructuresService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};
