import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { assignmentService } from "../services/assignment.service";

export const useCounselorMappings = () =>
  useQuery({
    queryKey: queryKeys.leads.config(),
    queryFn: () => assignmentService.listMappings(),
  });

export const useUpsertCounselorMapping = () => {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id?: string; counselorId: string; course?: string; standard?: string; campus?: string; priority?: number; isActive?: boolean }
  >({
    mutationFn: (input) => assignmentService.upsertMapping(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.config() }),
  });
};

export const useRemoveCounselorMapping = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => assignmentService.removeMapping(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.config() }),
  });
};
