// ──────────────────────────────────────────────────────────────────────────────
// Automation settings service — read/upsert the per-event rules in
// `comms_automation_settings`. Modeled on settings/notificationSettings.service.
// Missing-table-safe: pre-migration it returns the registry defaults (all
// disabled) so the settings page renders and nothing fires.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { AUTOMATION_EVENTS } from "../constants/automationEvents";
import type {
  AutomationChannel,
  AutomationSetting,
  AutomationSettingUpsert,
  AutomationTiming,
} from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  event_key: string;
  enabled: boolean;
  channel: string;
  timing: string;
  template_key: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
  priority: number;
  updated_at: string | null;
  updated_by: string | null;
};

const toDomain = (r: DbRow): AutomationSetting => ({
  eventKey: r.event_key,
  enabled: !!r.enabled,
  channel: (r.channel as AutomationChannel) ?? "whatsapp",
  timing: (r.timing as AutomationTiming) ?? "immediate",
  templateKey: r.template_key ?? undefined,
  quietStart: r.quiet_start ?? undefined,
  quietEnd: r.quiet_end ?? undefined,
  priority: Number(r.priority ?? 5),
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

/**
 * Registry default for an event — the pre-migration / un-seeded fallback.
 * Enabled only when the registry explicitly opts in (`defaultEnabled`); every
 * other event stays OFF until a human turns it on.
 */
const defaultFor = (eventKey: string): AutomationSetting => {
  const meta = AUTOMATION_EVENTS.find((e) => e.key === eventKey);
  return {
    eventKey,
    enabled: meta?.defaultEnabled ?? false,
    channel: meta?.defaultChannel ?? "whatsapp",
    timing: meta?.defaultTiming ?? "immediate",
    templateKey: meta?.defaultTemplate,
    priority: 5,
  };
};

class CommsAutomationSettingsService extends BaseService {
  /** All settings, merged with registry defaults so every event has a row. */
  async list(): Promise<AutomationSetting[]> {
    const res = await this.db
      .from("comms_automation_settings" as never)
      .select("*");
    let rows: AutomationSetting[] = [];
    if (res.error) {
      if (!isMissingTable(res.error)) throw AppError.fromSupabase(res.error, "comms_automation_settings.list");
      rows = [];
    } else {
      rows = ((res.data as unknown as DbRow[]) ?? []).map(toDomain);
    }
    const byKey = new Map(rows.map((r) => [r.eventKey, r]));
    return AUTOMATION_EVENTS.map((e) => byKey.get(e.key) ?? defaultFor(e.key));
  }

  /** Single setting, falling back to the registry default. */
  async get(eventKey: string): Promise<AutomationSetting> {
    const res = await this.db
      .from("comms_automation_settings" as never)
      .select("*")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return defaultFor(eventKey);
      throw AppError.fromSupabase(res.error, "comms_automation_settings.get");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : defaultFor(eventKey);
  }

  async upsert(input: AutomationSettingUpsert, updatedBy?: string): Promise<void> {
    const payload = {
      event_key: input.eventKey,
      enabled: input.enabled,
      channel: input.channel,
      timing: input.timing,
      template_key: input.templateKey ?? null,
      quiet_start: input.quietStart ?? null,
      quiet_end: input.quietEnd ?? null,
      priority: input.priority,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    };
    const res = await this.db
      .from("comms_automation_settings" as never)
      .upsert(payload as never, { onConflict: "event_key" });
    if (res.error) {
      if (isMissingTable(res.error)) return; // pre-migration: silently no-op
      throw AppError.fromSupabase(res.error, "comms_automation_settings.upsert");
    }
  }
}

export const commsAutomationSettingsService = new CommsAutomationSettingsService();
