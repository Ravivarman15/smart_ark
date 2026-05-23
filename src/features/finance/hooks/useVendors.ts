import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { financeAuditService, vendorService } from "../services";
import type { VendorInput } from "../types/finance.types";

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useVendors = (activeOnly = false) =>
  useQuery({
    queryKey: queryKeys.finance.vendors({ activeOnly }),
    queryFn: () => vendorService.list(activeOnly),
  });

export const useVendor = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.vendor(id ?? ""),
    queryFn: () => vendorService.getById(id as string),
    enabled: !!id,
  });

export const useCreateVendor = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: VendorInput) =>
      vendorService.create(input, actor.actorId),
    onSuccess: (v) => {
      financeAuditService.log("vendor", v.id, "created", `Vendor "${v.name}" added`, actor);
      invalidate(qc);
    },
  });
};

export const useUpdateVendor = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: VendorInput }) =>
      vendorService.update(args.id, args.input),
    onSuccess: (v) => {
      financeAuditService.log("vendor", v.id, "updated", "Vendor edited", actor);
      invalidate(qc);
    },
  });
};

export const useDeleteVendor = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => vendorService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log("vendor", id, "deleted", "Vendor deleted", actor);
      invalidate(qc);
    },
  });
};
