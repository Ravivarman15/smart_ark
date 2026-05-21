import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { liveClassesService } from "../services/liveClasses.service";
import type { LiveClass } from "../types/liveClass.types";

/** Roster + saved attendance for a live class. */
export const useLiveClassAttendance = (liveClass?: LiveClass) =>
  useQuery({
    queryKey: queryKeys.liveClasses.attendance(liveClass?.id ?? ""),
    queryFn: () => liveClassesService.getAttendance(liveClass as LiveClass),
    enabled: !!liveClass,
  });

export const useSaveLiveAttendance = () => {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { liveClassId: string; rows: { studentId: string; status: string }[] }
  >({
    mutationFn: ({ liveClassId, rows }) =>
      liveClassesService.saveAttendance(liveClassId, rows),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.liveClasses.attendance(vars.liveClassId) });
    },
  });
};
