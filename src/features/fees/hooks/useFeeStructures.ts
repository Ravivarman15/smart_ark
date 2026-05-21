import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feeStructuresService } from "../services/feeStructures.service";
import type {
  CreateFeeStructureInput,
  FeeStructure,
  FeeType,
  UpdateFeeStructureInput,
} from "../types/fee.types";

interface StructureFilters {
  search?: string;
  isActive?: boolean;
  feeType?: FeeType;
}

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.fees.all });
};

/** List fee structures. Used by setup pages + dropdowns in admissions. */
export const useFeeStructures = (filters: StructureFilters = {}) =>
  useQuery({
    queryKey: queryKeys.fees.structures(filters as Record<string, unknown>),
    queryFn: () => feeStructuresService.list(filters),
  });

export const useFeeStructure = (id?: string) =>
  useQuery({
    queryKey: queryKeys.fees.detail(id ?? ""),
    queryFn: () => feeStructuresService.getById(id as string),
    enabled: !!id,
  });

export const useFeeStructureRevisions = (id?: string) =>
  useQuery({
    queryKey: queryKeys.fees.structureRevisions(id ?? ""),
    queryFn: () => feeStructuresService.listRevisions(id as string),
    enabled: !!id,
  });

export const useCreateFeeStructure = () => {
  const invalidate = useInvalidate();
  return useMutation<FeeStructure, Error, CreateFeeStructureInput>({
    mutationFn: (input) => feeStructuresService.create(input),
    onSuccess: invalidate,
  });
};

export const useUpdateFeeStructure = () => {
  const invalidate = useInvalidate();
  return useMutation<void, Error, { id: string; updates: UpdateFeeStructureInput }>({
    mutationFn: ({ id, updates }) => feeStructuresService.update(id, updates),
    onSuccess: invalidate,
  });
};

export const useDeleteFeeStructure = () => {
  const invalidate = useInvalidate();
  return useMutation<void, Error, string>({
    mutationFn: (id) => feeStructuresService.remove(id),
    onSuccess: invalidate,
  });
};

export const useSetFeeStructureActive = () => {
  const invalidate = useInvalidate();
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => feeStructuresService.setActive(id, isActive),
    onSuccess: invalidate,
  });
};

export const useDuplicateFeeStructure = () => {
  const invalidate = useInvalidate();
  return useMutation<FeeStructure, Error, string>({
    mutationFn: (id) => feeStructuresService.duplicate(id),
    onSuccess: invalidate,
  });
};
