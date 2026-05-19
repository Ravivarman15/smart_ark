import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { staffService } from "../services/staff.service";
import type { Role } from "../types/staff.types";

interface Params {
  role?: Role | Role[];
  includeInactive?: boolean;
  campusId?: string;
}

/**
 * List staff filtered by role/campus/active. Cached per param-set so admin
 * "all teachers" and management "all admins" coexist without re-fetching.
 */
export const useStaff = (params: Params = {}) =>
  useQuery({
    queryKey: queryKeys.staff.list(params as Record<string, unknown>),
    queryFn: () => staffService.list(params),
  });
