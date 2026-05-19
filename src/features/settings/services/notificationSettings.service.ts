import { BaseService, AppError } from "@/shared/services";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreference,
  NotificationPreferenceUpsert,
} from "../types/settings.types";

// The matrix the UI exposes. Channels × categories = the set of toggles
// each user can flip. Stored row-per-cell in the DB.
export const NOTIFICATION_CHANNELS: { id: NotificationChannel; label: string }[] = [
  { id: "in_app", label: "In-app" },
  { id: "email",  label: "Email"  },
  { id: "push",   label: "Push"   },
];

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string }[] = [
  { id: "reminder",   label: "Reminders" },
  { id: "approval",   label: "Approvals" },
  { id: "attendance", label: "Attendance alerts" },
  { id: "exam",       label: "Exam alerts" },
  { id: "system",     label: "System messages" },
];

type DbRow = {
  id: string;
  profile_id: string;
  channel: string;
  category: string;
  enabled: boolean;
  updated_at: string | null;
};

const toDomain = (r: DbRow): NotificationPreference => ({
  id: r.id,
  profileId: r.profile_id,
  channel: r.channel as NotificationChannel,
  category: r.category as NotificationCategory,
  enabled: !!r.enabled,
  updatedAt: r.updated_at ?? undefined,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

class NotificationSettingsService extends BaseService {
  /** Read every preference row for a user. Missing rows = default-enabled. */
  async listForUser(profileId: string): Promise<NotificationPreference[]> {
    const res = await this.db
      .from("settings_notification_preferences" as never)
      .select("id, profile_id, channel, category, enabled, updated_at")
      .eq("profile_id", profileId);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "settings_notification_preferences");
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  async upsert(input: NotificationPreferenceUpsert): Promise<void> {
    const payload = {
      profile_id: input.profileId,
      channel: input.channel,
      category: input.category,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("settings_notification_preferences" as never)
      .upsert(payload as never, {
        onConflict: "profile_id,channel,category",
      });
    if (error) throw AppError.fromSupabase(error, "settings_notification_preferences.upsert");
  }
}

export const notificationSettingsService = new NotificationSettingsService();
