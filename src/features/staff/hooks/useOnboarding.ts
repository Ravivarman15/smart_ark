import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { onboardingService } from "../services/onboarding.service";

/**
 * Onboarding audit timeline for a staff member (newest first).
 * Returns an empty list when the onboarding migration is not yet applied —
 * the service degrades gracefully, so the profile drawer never errors.
 */
export const useOnboardingEvents = (profileId: string | undefined) =>
  useQuery({
    queryKey: profileId
      ? queryKeys.staff.onboarding(profileId)
      : ["staff", "onboarding", "noop"],
    queryFn: () => onboardingService.listEvents(profileId as string),
    enabled: !!profileId,
  });
