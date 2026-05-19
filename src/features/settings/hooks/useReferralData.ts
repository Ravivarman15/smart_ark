import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { referralService } from "../services/referral.service";

export const useReferralData = () => {
  const { user } = useAuth();
  const profileId = user?.profileId;

  const summary = useQuery({
    queryKey: profileId
      ? queryKeys.settings.referral(profileId)
      : ["settings", "referral", "noop"],
    queryFn: () => referralService.ensureForProfile(profileId as string, user?.name),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  const events = useQuery({
    queryKey: profileId
      ? queryKeys.settings.referralEvents(profileId)
      : ["settings", "referral-events", "noop"],
    queryFn: () => referralService.listEvents(profileId as string, 25),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  return { summary, events };
};
