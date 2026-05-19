import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { followupsService } from "../services/followups.service";
import type { EnquiryStatus } from "../types/enquiry.types";

const followupsKey = (enquiryId: string) =>
  [...queryKeys.enquiries.all, "followups", enquiryId] as const;

/** Read follow-up history for an enquiry. Returns [] until the history table lands. */
export const useFollowups = (enquiryId: string | undefined) =>
  useQuery({
    queryKey: enquiryId ? followupsKey(enquiryId) : ["enquiries", "followups", "noop"],
    queryFn: () => followupsService.listForEnquiry(enquiryId as string),
    enabled: !!enquiryId,
  });

interface AddArgs {
  enquiryId: string;
  note: string;
  newStatus?: EnquiryStatus;
  followUpDate?: string;
}

export const useAddFollowupNote = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<Awaited<ReturnType<typeof followupsService.addNote>>, Error, AddArgs>({
    mutationFn: (args) => followupsService.addNote({ ...args, updatedByName: user?.name }),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.enquiries.all });
      qc.invalidateQueries({ queryKey: followupsKey(args.enquiryId) });
    },
  });
};
