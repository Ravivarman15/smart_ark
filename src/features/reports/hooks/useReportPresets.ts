import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { reportPresetsService } from "../services";
import type { ReportPresetInput } from "../types/reports.types";

const useOwner = () => {
  const { user } = useAuth();
  return { id: user?.profileId, name: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.reports.all });

export const useReportPresets = (reportKey?: string) =>
  useQuery({
    queryKey: queryKeys.reports.presets(reportKey),
    queryFn: () => reportPresetsService.list(reportKey),
    staleTime: 60_000,
  });

export const useCreateReportPreset = () => {
  const qc = useQueryClient();
  const owner = useOwner();
  return useMutation({
    mutationFn: (input: ReportPresetInput) =>
      reportPresetsService.create(input, owner),
    onSuccess: () => invalidate(qc),
  });
};

export const useUpdateReportPreset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: ReportPresetInput }) =>
      reportPresetsService.update(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
};

export const useDeleteReportPreset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportPresetsService.remove(id),
    onSuccess: () => invalidate(qc),
  });
};
