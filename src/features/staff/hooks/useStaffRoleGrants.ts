import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { CURRENT_PROFILE_QUERY_KEY, useAuth } from "@/contexts/AuthContext";
import { staffRolesService } from "../services/staffRoles.service";
import type { Role } from "@/core/constants/roles";

/** The extra portals one staff member may switch into. */
export const useStaffRoleGrants = (profileId?: string) =>
  useQuery({
    queryKey: queryKeys.staff.roleGrants(profileId ?? ""),
    queryFn: () => staffRolesService.grantsFor(profileId as string),
    enabled: !!profileId,
  });

export const useSetStaffRoleGrants = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (v: { profileId: string; primaryRole: Role; roles: Role[] }) =>
      staffRolesService.setGrants({ ...v, grantedBy: user?.profileId }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.staff.roleGrants(v.profileId) });
      qc.invalidateQueries({ queryKey: queryKeys.staff.all });
      // Granting a role to YOURSELF must make the switcher appear without a
      // reload — the portal list in AuthContext is a cached query like any
      // other, and nothing else invalidates it.
      qc.invalidateQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY });
    },
  });
};
