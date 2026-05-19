import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { actionRightsService } from "../services/actionRights.service";
import type { Role } from "@/core/constants/roles";

/**
 * Read action grants for a role. Pass undefined to fetch every role (used by
 * the matrix editor when copying actions across roles).
 */
export const useActionRights = (role?: Role | string) =>
  useQuery({
    queryKey: queryKeys.rbac.roleActions(role),
    queryFn: () => actionRightsService.list(role),
    staleTime: 5 * 60_000,
  });
