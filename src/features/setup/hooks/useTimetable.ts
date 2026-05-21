import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { timetableService } from "../services/timetable.service";
import type { TimetablePeriodUpsert } from "../types/setup.types";

export const useTimetable = (batchId: string | undefined) =>
  useQuery({
    queryKey: batchId ? queryKeys.setup.timetable(batchId) : ["setup", "timetable", "noop"],
    queryFn: () => timetableService.listForBatch(batchId as string),
    enabled: !!batchId,
    staleTime: 60_000,
  });

export const useUpsertTimetableCell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TimetablePeriodUpsert) => timetableService.upsertCell(input),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.timetable(args.batchId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};

export const useClearTimetableCell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, dayOfWeek, periodNo }: { batchId: string; dayOfWeek: number; periodNo: number }) =>
      timetableService.clearCell(batchId, dayOfWeek, periodNo),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.setup.timetable(args.batchId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Clear failed"),
  });
};
