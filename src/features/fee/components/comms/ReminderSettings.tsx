import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PanelHeading } from "./shared";
import { useAuth } from "@/contexts/AuthContext";
import { commsAutomationSettingsService } from "@/features/communication/services";
import { MAX_RETRIES, BACKOFF_MINUTES } from "@/features/communication/utils/retryPolicy";
import type { AutomationChannel, AutomationSetting } from "@/features/communication/types/communication.types";

// ─────────────────────────────────────────────────────────────────────────────
// Smart Reminder Engine settings — thin editor over the EXISTING
// comms_automation_settings (fee_paid receipt + fee_due reminder). No new table:
// the same rows the dispatcher / scheduler already honour. Retry policy is fixed
// in the send-aisensy engine and shown read-only.
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS: AutomationChannel[] = ["both", "whatsapp", "email"];

const EventEditor: React.FC<{ eventKey: string; title: string; desc: string; canEdit: boolean }> = ({
  eventKey,
  title,
  desc,
  canEdit,
}) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: setting } = useQuery({
    queryKey: ["fee-comms", "automation", eventKey],
    queryFn: () => commsAutomationSettingsService.get(eventKey),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<AutomationSetting>) =>
      commsAutomationSettingsService.upsert(
        {
          eventKey,
          enabled: setting?.enabled ?? false,
          channel: setting?.channel ?? "both",
          timing: setting?.timing ?? "immediate",
          templateKey: setting?.templateKey,
          quietStart: setting?.quietStart,
          quietEnd: setting?.quietEnd,
          priority: setting?.priority ?? 5,
          ...patch,
        },
        user?.profileId,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-comms", "automation", eventKey] });
      toast.success(`${title} updated.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        <Switch
          checked={!!setting?.enabled}
          disabled={!canEdit || save.isPending}
          onCheckedChange={(v) => save.mutate({ enabled: v })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <label className="text-xs text-muted-foreground">
          Channel
          <select
            value={setting?.channel ?? "both"}
            disabled={!canEdit}
            onChange={(e) => save.mutate({ channel: e.target.value as AutomationChannel })}
            className="w-full h-9 mt-0.5 bg-background border border-border rounded-md px-2 text-sm"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c === "both" ? "Email + WhatsApp" : c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Quiet hours start (defer)
          <Input
            type="time"
            value={setting?.quietStart ?? ""}
            disabled={!canEdit}
            onChange={(e) => save.mutate({ quietStart: e.target.value })}
            className="h-9 mt-0.5"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Quiet hours end (resume)
          <Input
            type="time"
            value={setting?.quietEnd ?? ""}
            disabled={!canEdit}
            onChange={(e) => save.mutate({ quietEnd: e.target.value })}
            className="h-9 mt-0.5"
          />
        </label>
      </div>
    </div>
  );
};

export const ReminderSettings: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  return (
    <div className="space-y-4">
      <PanelHeading
        title="Smart Reminder Engine"
        desc="Governs the automatic fee receipt + reminder communications. Nothing sends while a toggle is off."
      />
      {!canEdit && (
        <p className="text-sm text-amber-600">You have view-only access — ask an administrator to change these.</p>
      )}
      <EventEditor
        eventKey="fee_paid"
        title="Receipt Auto Send"
        desc="Auto-send the branded receipt (Email + WhatsApp) the moment a payment is collected."
        canEdit={canEdit}
      />
      <EventEditor
        eventKey="fee_due"
        title="Fee Due Reminder"
        desc="Daily reminder to students with a pending balance (driven by the comms scheduler)."
        canEdit={canEdit}
      />
      <div className="glass-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Retry policy (engine)</p>
        Failed messages retry automatically up to <strong>{MAX_RETRIES}</strong> times with a{" "}
        <strong>{BACKOFF_MINUTES.join(" / ")} minute</strong> backoff, then are marked failed and surfaced in the
        Delivery Dashboard. This is enforced server-side by the shared send-aisensy engine and applies to every
        channel.
      </div>
    </div>
  );
};
