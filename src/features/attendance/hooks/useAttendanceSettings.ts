import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceSettingsService } from "../services";
import { useMarker } from "./useMarker";
import type { AttendanceSettingsForm } from "../schemas/attendance.schema";

export const useAttendanceSettings = () =>
  useQuery({
    queryKey: queryKeys.attendance.settings(),
    queryFn: () => attendanceSettingsService.get(),
    staleTime: 5 * 60 * 1000,
  });

export const useUpdateAttendanceSettings = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  return useMutation({
    mutationFn: (form: AttendanceSettingsForm) => attendanceSettingsService.update(form, marker),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.settings() });
      // Settings drive the work-hours engine — bust work-hours / dashboard too.
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      toast.success("Attendance settings saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
