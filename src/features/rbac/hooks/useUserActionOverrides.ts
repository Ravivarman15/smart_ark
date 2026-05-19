import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { userActionOverridesService } from "../services/userActionOverrides.service";

export const useUserActionOverrides = (userProfileId: string | undefined) =>
  useQuery({
    queryKey: userProfileId
      ? queryKeys.rbac.userActionOverrides(userProfileId)
      : ["rbac", "user-action-overrides", "noop"],
    queryFn: () => userActionOverridesService.listForUser(userProfileId as string),
    enabled: !!userProfileId,
    staleTime: 60_000,
  });

export const useUpsertUserActionOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userActionOverridesService.upsert>[0]) =>
      userActionOverridesService.upsert(args),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({
        queryKey: queryKeys.rbac.userActionOverrides(args.userProfileId),
      });
    },
  });
};

export const useRemoveUserActionOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userActionOverridesService.remove>[0]) =>
      userActionOverridesService.remove(args),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({
        queryKey: queryKeys.rbac.userActionOverrides(args.userProfileId),
      });
    },
  });
};
