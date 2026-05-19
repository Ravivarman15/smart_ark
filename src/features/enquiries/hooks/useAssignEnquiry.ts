import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { enquiriesService } from "../services/enquiries.service";

interface Args {
  id: string;
  staffProfileId: string;
}

export const useAssignEnquiry = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, Args>({
    mutationFn: ({ id, staffProfileId }) => enquiriesService.assign(id, staffProfileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.enquiries.all }),
  });
};
