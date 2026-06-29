import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { commsAutomationSettingsService, commsDispatcherService } from "../services";
import type { AutomationDispatchResult, AutomationSettingUpsert } from "../types/communication.types";

/** All event automation settings, merged with registry defaults. */
export const useAutomationSettings = () =>
  useQuery({
    queryKey: queryKeys.communication.automationSettings(),
    queryFn: () => commsAutomationSettingsService.list(),
    staleTime: 30_000,
  });

/** Persist one event's rule. */
export const useUpsertAutomationSetting = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: AutomationSettingUpsert) =>
      commsAutomationSettingsService.upsert(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.automationSettings() });
      toast.success("Automation setting saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Run the client-side scheduled jobs now (birthday + fee-due). */
export const useRunScheduler = () => {
  const qc = useQueryClient();
  return useMutation<AutomationDispatchResult[], Error, string | undefined>({
    mutationFn: (date) => commsDispatcherService.runScheduledJobs(date),
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      const queued = results.reduce((n, r) => n + r.queued, 0);
      const dupes = results.reduce((n, r) => n + r.duplicates, 0);
      toast.success(
        queued > 0
          ? `Scheduler queued ${queued} message${queued === 1 ? "" : "s"}${dupes ? ` · ${dupes} duplicate(s) skipped` : ""}`
          : "Scheduler ran — nothing due (or events disabled / queue not configured)",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
