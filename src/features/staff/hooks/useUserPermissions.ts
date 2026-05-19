import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { permissionsService } from "../services/permissions.service";
import type {
  ActionRight,
  ModuleRight,
  UserPermissions,
} from "../types/staff.types";

const userPermsKey = (staffId: string) => queryKeys.permissions.forUser(staffId);

/**
 * Read the full permissions object for a specific staff member.
 * For the CURRENT user, use the existing `StaffRightsContext` / `usePermissions`
 * — that one is reactive across the whole app and shouldn't be duplicated.
 */
export const useUserPermissions = (staffId: string | undefined) =>
  useQuery({
    queryKey: staffId ? userPermsKey(staffId) : ["permissions", "noop"],
    queryFn: () => permissionsService.getForStaff(staffId as string),
    enabled: !!staffId,
  });

/**
 * Bulk save (matrix submit). Invalidates the user's permission row so
 * any open editors re-read. The current user's own rights live in
 * StaffRightsContext and must be refreshed manually after save.
 */
export const useSaveUserPermissions = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, UserPermissions>({
    mutationFn: (input) => permissionsService.save(input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: userPermsKey(vars.staffId) });
    },
  });
};

export const useSetModuleRight = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, ModuleRight>({
    mutationFn: (right) => permissionsService.setModuleRight(right),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: userPermsKey(vars.staffId) }),
  });
};

export const useSetActionRight = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, ActionRight>({
    mutationFn: (right) => permissionsService.setActionRight(right),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: userPermsKey(vars.staffId) }),
  });
};

export const useResetUserPermissions = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (staffId) => permissionsService.resetForStaff(staffId),
    onSuccess: (_d, staffId) => qc.invalidateQueries({ queryKey: userPermsKey(staffId) }),
  });
};
