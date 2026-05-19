import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsCard } from "../components/SettingsCard";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
} from "../services/notificationSettings.service";
import {
  useNotificationSettings,
  useUpsertNotificationPref,
} from "../hooks/useNotificationSettings";
import type {
  NotificationCategory,
  NotificationChannel,
} from "../types/settings.types";

/**
 * Notification preferences. Channel × category matrix; missing rows default
 * to enabled (per the migration default). Toggles save immediately — no
 * "Save" button — keeping the matrix interactive.
 */
const AutoNotificationsPage = () => {
  const { user } = useAuth();
  const { data, isLoading } = useNotificationSettings();
  const upsert = useUpsertNotificationPref();

  // Build a (channel,category) → enabled lookup; missing = true.
  const lookup = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of data ?? []) map.set(`${r.channel}.${r.category}`, r.enabled);
    return map;
  }, [data]);

  const isEnabled = (ch: NotificationChannel, cat: NotificationCategory) =>
    lookup.get(`${ch}.${cat}`) ?? true;

  const toggle = (ch: NotificationChannel, cat: NotificationCategory, next: boolean) => {
    if (!user?.profileId) return;
    upsert.mutate({
      profileId: user.profileId,
      channel: ch,
      category: cat,
      enabled: next,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <SettingsCard
        title="Auto Notification Settings"
        description="Choose which channels deliver which categories of alerts. Changes save instantly."
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Category
                </th>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <th
                    key={c.id}
                    className="text-center px-4 py-2.5 text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((cat) => (
                <tr key={cat.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-foreground">{cat.label}</td>
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <td key={ch.id} className="px-4 py-2.5 text-center">
                      <div className="inline-flex">
                        <Switch
                          checked={isEnabled(ch.id, cat.id)}
                          onCheckedChange={(v) => toggle(ch.id, cat.id, v)}
                          disabled={upsert.isPending}
                          aria-label={`${cat.label} via ${ch.label}`}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <p className="text-[11px] text-muted-foreground">
        Push notifications require a registered device token. Email delivery uses your
        verified address from the Profile page.
      </p>
    </div>
  );
};

export default AutoNotificationsPage;
