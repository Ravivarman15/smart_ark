import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { rolePermissionsService } from "../services/rolePermissions.service";
import type { Role } from "@/core/constants/roles";

/**
 * Read role grants. Pass undefined to fetch every role (used by the matrix
 * editor when copying permissions across roles).
 */
export const useRolePermissions = (role?: Role | string) =>
  useQuery({
    queryKey: queryKeys.rbac.rolePermissions(role),
    queryFn: () => rolePermissionsService.list(role),
    staleTime: 5 * 60_000,
  });
