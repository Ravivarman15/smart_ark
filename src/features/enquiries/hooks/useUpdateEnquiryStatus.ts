import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { enquiriesService } from "../services/enquiries.service";
import type { Enquiry, EnquiryStatus } from "../types/enquiry.types";

interface Args {
  id: string;
  status: EnquiryStatus;
}

/**
 * Status change is optimistic — list reflects the new status instantly,
 * roll back on error. Status transitions are common and the formula is
 * simple (single field).
 */
export const useUpdateEnquiryStatus = () => {
  const qc = useQueryClient();

  return useMutation<void, Error, Args, { snapshot?: Enquiry[] }>({
    mutationFn: ({ id, status }) => enquiriesService.updateStatus(id, status),

    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: queryKeys.enquiries.list() });
      const snapshot = qc.getQueryData<Enquiry[]>(queryKeys.enquiries.list());
      if (snapshot) {
        qc.setQueryData<Enquiry[]>(
          queryKeys.enquiries.list(),
          snapshot.map((e) => (e.id === id ? { ...e, status } : e))
        );
      }
      return { snapshot };
    },

    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(queryKeys.enquiries.list(), ctx.snapshot);
    },

    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.enquiries.all }),
  });
};
