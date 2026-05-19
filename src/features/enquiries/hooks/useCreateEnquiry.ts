import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { enquiriesService } from "../services/enquiries.service";
import type { CreateEnquiryInput, Enquiry } from "../types/enquiry.types";

export const useCreateEnquiry = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<Enquiry, Error, CreateEnquiryInput>({
    mutationFn: (input) => enquiriesService.create(input, user?.profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.enquiries.all }),
  });
};
