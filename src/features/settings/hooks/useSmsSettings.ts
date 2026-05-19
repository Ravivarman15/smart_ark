import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { smsSettingsService } from "../services/smsSettings.service";
import { settingsAuditService } from "../services/audit.service";
import type { SmsAutomationUpsert } from "../types/settings.types";

export const useSmsSettings = () =>
  useQuery({
    queryKey: queryKeys.settings.sms(),
    queryFn: () => smsSettingsService.list(),
    staleTime: 60_000,
  });

export const useUpsertSmsAutomation = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SmsAutomationUpsert) => {
      await smsSettingsService.upsert(input, user?.profileId);
      await settingsAuditService.record({
        actorId: user?.profileId,
        area: "sms_automation",
        changeKey: input.automationKey,
        newValue: { enabled: input.enabled, templateLength: input.template.length },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.sms() });
      toast.success("SMS automation saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
