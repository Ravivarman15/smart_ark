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
    retry: 2,
    meta: { errorMessage: "Failed to load taxes" },
  });

export const useCreateTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaxInput) => taxesService.create(input),
    onSuccess: () => {
      // Invalidate all dependent namespaces (cross-module sync).
      invalidateSetupLookups(qc);
      // Also force an immediate refetch of the taxes list specifically,
      // ensuring the Manage Taxes table updates right away.
      qc.refetchQueries({ queryKey: queryKeys.setup.taxes() });
      toast.success("Tax created");
    },
    onError: (err) => {
      console.error("[useCreateTax] error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create tax");
    },
  });
};

export const useUpdateTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TaxInput> }) =>
      taxesService.update(id, input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      qc.refetchQueries({ queryKey: queryKeys.setup.taxes() });
      toast.success("Tax updated");
    },
    onError: (err) => {
      console.error("[useUpdateTax] error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update tax");
    },
  });
};

export const useDeleteTax = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taxesService.remove(id),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      qc.refetchQueries({ queryKey: queryKeys.setup.taxes() });
      toast.success("Tax deleted");
    },
    onError: (err) => {
      console.error("[useDeleteTax] error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete tax");
    },
  });
};
