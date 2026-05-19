import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { staffService } from "../services/staff.service";

export const useStaffMember = (id: string | undefined) =>
  useQuery({
    queryKey: id ? queryKeys.staff.detail(id) : ["staff", "detail", "noop"],
    queryFn: () => staffService.getById(id as string),
    enabled: !!id,
  });
