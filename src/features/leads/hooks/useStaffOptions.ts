import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { assignmentService } from "../services/assignment.service";

/** Active staff (for counselor + faculty pickers). Cached under the staff key. */
export const useStaffOptions = () =>
  useQuery({
    queryKey: [...queryKeys.staff.all, "lead-options"],
    queryFn: () => assignmentService.listStaff(),
    staleTime: 5 * 60_000,
  });
