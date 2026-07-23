import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { teachingHoursService } from "../services";

/** All teachers' aggregated teaching hours for a period (coordinator/management). */
export const useTeachingHours = (from: string, to: string) =>
  useQuery({
    queryKey: queryKeys.allocation.teachingHours("all", from, to),
    queryFn: async () => {
      const map = await teachingHoursService.aggregate(from, to);
      return [...map.values()];
    },
  });

/** The signed-in teacher's own hours for a period (My Classes salary card). */
export const useMyTeachingHours = (from: string, to: string) => {
  const { user } = useAuth();
  const teacherId = user?.profileId;
  return useQuery({
    queryKey: queryKeys.allocation.teachingHours(teacherId ?? "none", from, to),
    queryFn: () => teachingHoursService.forTeacher(teacherId as string, from, to),
    enabled: !!teacherId,
  });
};
