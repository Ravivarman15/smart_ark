import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { enquiriesService } from "../services/enquiries.service";

/** List all enquiries (admission_calls), newest first. */
export const useEnquiries = () =>
  useQuery({
    queryKey: queryKeys.enquiries.list(),
    queryFn: () => enquiriesService.list(),
  });
