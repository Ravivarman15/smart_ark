import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { userOverridesService } from "../services/userOverrides.service";

export const useUserOverrides = (userProfileId: string | undefined) =>
  useQuery({
    queryKey: userProfileId
      ? queryKeys.rbac.userOverrides(userProfileId)
      : ["rbac", "user-overrides", "noop"],
    queryFn: () => userOverridesService.listForUser(userProfileId as string),
    enabled: !!userProfileId,
    staleTime: 60_000,
  });

export const useUpsertUserOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userOverridesService.upsert>[0]) =>
      userOverridesService.upsert(args),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.rbac.userOverrides(args.userProfileId) });
    },
  });
};

export const useRemoveUserOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof userOverridesService.remove>[0]) =>
      userOverridesService.remove(args),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.rbac.userOverrides(args.userProfileId) });
    },
  });
};
