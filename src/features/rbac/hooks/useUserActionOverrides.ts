import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { userActionOverridesService } from "../services/userActionOverrides.service";
import { rbacDebug } from "../utils/rbacDebug";

export const useUserActionOverrides = (userProfileId: string | undefined) =>
  useQuery({
    queryKey: userProfileId
      ? queryKeys.rbac.userActionOverrides(userProfileId)
      : ["rbac", "user-action-overrides", "noop"],
    queryFn: () => userActionOverridesService.listForUser(userProfileId as string),
    enabled: !!userProfileId,
    staleTime: 60_000,
  });

const invalidateAfterActionOverride = (
  qc: ReturnType<typeof useQueryClient>,
  userProfileId: string,
) => {
  qc.invalidateQueries({ queryKey: queryKeys.rbac.userActionOverrides(userProfileId) });
  qc.invalidateQueries({ queryKey: [...queryKeys.rbac.all, "effective-actions"] });
  qc.invalidateQueries({ queryKey: queryKeys.permissions.forUser(userProfileId) });
};

export const useUpsertUserActionOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userActionOverridesService.upsert>[0]) =>
      userActionOverridesService.upsert(args),
    onSuccess: (_v, args) => {
      invalidateAfterActionOverride(qc, args.userProfileId);
      rbacDebug("mutation", { source: "useUpsertUserActionOverride", target: args.userProfileId });
    },
  });
};

export const useRemoveUserActionOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userActionOverridesService.remove>[0]) =>
      userActionOverridesService.remove(args),
    onSuccess: (_v, args) => {
      invalidateAfterActionOverride(qc, args.userProfileId);
      rbacDebug("mutation", { source: "useRemoveUserActionOverride", target: args.userProfileId });
    },
  });
};
