import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsTimelineService } from "../services";

/** Per-recipient message history (by student id and/or phone). */
export const useCommsTimeline = (target: { studentId?: string; phone?: string }, enabled = true) =>
  useQuery({
    queryKey: queryKeys.communication.timeline(target),
    queryFn: () => commsTimelineService.forRecipient(target),
    enabled: enabled && (!!target.studentId || !!target.phone),
    staleTime: 15_000,
  });
