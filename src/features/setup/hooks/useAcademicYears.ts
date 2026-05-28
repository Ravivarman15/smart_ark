import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { academicYearsService } from "../services/academicYears.service";
import { LOOKUP_STALE_TIME, invalidateSetupLookups } from "../lib/setupSync";
import type { AcademicYearInput } from "../types/setup.types";

export const useAcademicYears = () =>
  useQuery({
    queryKey: queryKeys.setup.years(),
    queryFn: () => academicYearsService.list(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCreateAcademicYear = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AcademicYearInput) => academicYearsService.create(input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Academic year created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
};

export const useUpdateAcademicYear = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AcademicYearInput> }) =>
      academicYearsService.update(id, input),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Academic year updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteAcademicYear = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicYearsService.remove(id),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Academic year deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};

export const useSetDefaultAcademicYear = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicYearsService.setDefault(id),
    onSuccess: () => {
      invalidateSetupLookups(qc);
      toast.success("Default year updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not set default"),
  });
};
