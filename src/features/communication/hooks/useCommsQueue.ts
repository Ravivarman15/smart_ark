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
    mutationFn: async (inputs: EnqueueInput[]) => {
      const res = await aisensyService.enqueueBulk(inputs);
      // Nudge the edge drainer to send now (best-effort; queue also drains on
      // its own schedule). Only when something was actually queued.
      if (res.queued > 0) await aisensyService.dispatchViaEdge({ limit: res.queued });
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });

      // Surface rejected recipients — never report a clean success when some
      // messages could not be queued (bad/missing phone, unresolved variables).
      if (res.invalid.length > 0) {
        const first = res.invalid[0]?.reason ?? "validation failed";
        const more = res.invalid.length > 1 ? ` +${res.invalid.length - 1} more` : "";
        toast.warning(`${res.invalid.length} not sent — ${first}${more}`);
      }

      if (res.queued > 0) {
        toast.success(`Queued ${res.queued} message${res.queued === 1 ? "" : "s"} for delivery`);
      } else if (res.invalid.length === 0) {
        toast.info(
          res.skipped > 0
            ? "Nothing queued (duplicates skipped or message queue not configured)"
            : "No messages queued"
        );
      }
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
