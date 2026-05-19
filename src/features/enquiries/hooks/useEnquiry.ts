import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { enquiriesService } from "../services/enquiries.service";

export const useEnquiry = (id: string | undefined) =>
  useQuery({
    queryKey: id ? queryKeys.enquiries.detail(id) : ["enquiries", "detail", "noop"],
    queryFn: () => enquiriesService.getById(id as string),
    enabled: !!id,
  });
