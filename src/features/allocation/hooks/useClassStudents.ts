import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { classStudentsService } from "../services/classStudents.service";

/**
 * The students eligible for a class — everyone active in the selected
 * standards, optionally narrowed to one batch. Feeds the select/deselect
 * picker, where they start fully selected.
 */
export const useClassStudentCandidates = (
  standardIds: string[],
  batchId?: string,
  batchByStandard?: Record<string, string | undefined>,
) =>
  useQuery({
    queryKey: queryKeys.allocation.studentCandidates(standardIds, batchId, batchByStandard),
    queryFn: () => classStudentsService.candidates({ standardIds, batchId, batchByStandard }),
    enabled: standardIds.length > 0,
  });

/** The students actually assigned to an existing class. */
export const useAssignedStudents = (classScheduleId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.assignedStudents(classScheduleId ?? ""),
    queryFn: () => classStudentsService.listAssigned(classScheduleId as string),
    enabled: !!classScheduleId,
  });

/** Assigned-student counts for a list of classes, keyed by class id. */
export const useClassStudentCounts = (classScheduleIds: string[]) => {
  const key = [...classScheduleIds].sort().join(",");
  return useQuery({
    queryKey: [...queryKeys.allocation.all, "student-counts", key] as const,
    queryFn: () => classStudentsService.countsFor(classScheduleIds),
    enabled: classScheduleIds.length > 0,
  });
};

/** Replace a class's roster (coordinator/management only — enforced by RLS). */
export const useSetClassRoster = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (v: { classScheduleIds: string[]; studentIds: string[] }) =>
      classStudentsService.setRoster(v.classScheduleIds, v.studentIds, user?.profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.allocation.all }),
  });
};
