import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { userOverridesService } from "../services/userOverrides.service";
import { rbacDebug } from "../utils/rbacDebug";

export const useUserOverrides = (userProfileId: string | undefined) =>
  useQuery({
    queryKey: userProfileId
      ? queryKeys.rbac.userOverrides(userProfileId)
      : ["rbac", "user-overrides", "noop"],
    queryFn: () => userOverridesService.listForUser(userProfileId as string),
    enabled: !!userProfileId,
    staleTime: 60_000,
  });

const invalidateAfterOverride = (qc: ReturnType<typeof useQueryClient>, userProfileId: string) => {
  qc.invalidateQueries({ queryKey: queryKeys.rbac.userOverrides(userProfileId) });
  qc.invalidateQueries({ queryKey: [...queryKeys.rbac.all, "effective"] });
  qc.invalidateQueries({ queryKey: queryKeys.permissions.forUser(userProfileId) });
};

export const useUpsertUserOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userOverridesService.upsert>[0]) =>
      userOverridesService.upsert(args),
    onSuccess: (_v, args) => {
      invalidateAfterOverride(qc, args.userProfileId);
      rbacDebug("mutation", { source: "useUpsertUserOverride", target: args.userProfileId });
    },
  });
};

export const useRemoveUserOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userOverridesService.remove>[0]) =>
      userOverridesService.remove(args),
    onSuccess: (_v, args) => {
      invalidateAfterOverride(qc, args.userProfileId);
      rbacDebug("mutation", { source: "useRemoveUserOverride", target: args.userProfileId });
    },
  });
};
