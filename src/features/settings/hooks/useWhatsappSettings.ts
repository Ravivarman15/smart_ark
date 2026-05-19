import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { whatsappSettingsService } from "../services/whatsappSettings.service";
import { settingsAuditService } from "../services/audit.service";
import type { WhatsappConfigUpsert } from "../types/settings.types";

export const useWhatsappSettings = () =>
  useQuery({
    queryKey: queryKeys.settings.whatsapp(),
    queryFn: () => whatsappSettingsService.get(),
    staleTime: 60_000,
  });

export const useUpsertWhatsappConfig = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: WhatsappConfigUpsert) => {
      await whatsappSettingsService.upsert(input, user?.profileId);
      await settingsAuditService.record({
        actorId: user?.profileId,
        area: "whatsapp_config",
        newValue: { enabled: input.enabled, templateCount: input.templates.length },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.whatsapp() });
      toast.success("WhatsApp settings saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
