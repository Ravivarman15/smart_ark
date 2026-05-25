import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { aisensyService } from "../services";
import type { QueueStatus } from "../types/communication.types";
import type { EnqueueInput } from "../services/aisensy.service";

export const useCommsQueue = (filter: {
  campaignId?: string;
  templateKey?: string;
  status?: QueueStatus | "all";
  limit?: number;
} = {}) =>
  useQuery({
    queryKey: queryKeys.communication.queue(filter),
    queryFn: () => aisensyService.listQueue(filter),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const useEnqueueMessages = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputs: EnqueueInput[]) => aisensyService.enqueueBulk(inputs),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      const msg =
        res.queued > 0
          ? `Queued ${res.queued} message${res.queued === 1 ? "" : "s"}`
          : "No messages queued";
      const detail =
        res.skipped > 0
          ? ` (${res.skipped} skipped — message queue not configured yet)`
          : "";
      toast.success(`${msg}${detail}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRetryQueueMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aisensyService.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Message re-queued");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useCancelQueueMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aisensyService.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Message cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDispatchQueueNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { campaignId?: string; limit?: number } = {}) =>
      aisensyService.dispatchViaEdge(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      if (res.dispatched) toast.success("Dispatch requested");
      else
        toast.info(
          `Dispatch deferred — queue will drain on schedule (${res.reason ?? "no edge runtime"})`
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
