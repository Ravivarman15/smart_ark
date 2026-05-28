import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { taxesService } from "../services/taxes.service";
import { LOOKUP_STALE_TIME, invalidateSetupLookups } from "../lib/setupSync";
import type { TaxInput } from "../types/setup.types";

export const useTaxes = () =>
  useQuery({
    queryKey: queryKeys.setup.taxes(),
    queryFn: () => taxesService.list(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCreateTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaxInput) => taxesService.create(input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Tax created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TaxInput> }) =>
      taxesService.update(id, input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Tax updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taxesService.remove(id),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Tax deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
