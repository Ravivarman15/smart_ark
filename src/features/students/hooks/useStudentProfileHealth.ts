import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentProfileHealthService } from "../services/studentProfileHealth.service";

/** DB-wide profile completeness metrics + transport/hostel assignment queues. */
export const useStudentProfileHealth = () =>
  useQuery({
    queryKey: [...queryKeys.students.all, "profile-health"] as const,
    queryFn: () => studentProfileHealthService.metrics(),
    staleTime: 60_000,
  });
