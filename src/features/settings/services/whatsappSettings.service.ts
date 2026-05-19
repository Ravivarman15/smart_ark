import { BaseService, AppError } from "@/shared/services";
import type {
  WhatsappConfig,
  WhatsappConfigUpsert,
  WhatsappTemplate,
} from "../types/settings.types";

// Default templates seeded into the editor when no config row exists yet.
// Each template uses {placeholder} tokens that the runtime sender (a future
// edge function) substitutes.
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  { key: "fee_reminder", label: "Fee reminder", enabled: true,
    body: "Hi {parent_name}, fee of ₹{amount} for {student_name} is due on {due_date}." },
  { key: "enquiry_followup", label: "Enquiry follow-up", enabled: true,
    body: "Hi {name}, thanks for your enquiry at ARK. Reply YES to schedule a visit." },
  { key: "attendance_alert", label: "Attendance alert", enabled: false,
    body: "Hi {parent_name}, {student_name} was marked absent on {date}." },
  { key: "birthday", label: "Birthday wishes", enabled: false,
    body: "Wishing {student_name} a very happy birthday! — Team ARK" },
];

type DbRow = {
  id: string;
  enabled: boolean;
  provider: string;
  api_token_hint: string | null;
  webhook_secret_hint: string | null;
  templates: unknown;
  updated_at: string | null;
};

const toDomain = (r: DbRow): WhatsappConfig => {
  const tpl = Array.isArray(r.templates)
    ? (r.templates as WhatsappTemplate[])
    : DEFAULT_WHATSAPP_TEMPLATES;
  return {
    id: r.id,
    enabled: !!r.enabled,
    provider: r.provider || "aisensy",
    apiTokenHint: r.api_token_hint ?? undefined,
    webhookSecretHint: r.webhook_secret_hint ?? undefined,
    templates: tpl,
    updatedAt: r.updated_at ?? undefined,
  };
};

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

const emptyConfig = (): WhatsappConfig => ({
  enabled: false,
  provider: "aisensy",
  templates: DEFAULT_WHATSAPP_TEMPLATES,
});

class WhatsappSettingsService extends BaseService {
  /** Singleton row. Returns a synthetic empty config when missing. */
  async get(): Promise<WhatsappConfig> {
    const res = await this.db
      .from("settings_whatsapp_config" as never)
      .select("id, enabled, provider, api_token_hint, webhook_secret_hint, templates, updated_at")
      .limit(1)
      .maybeSingle();
    if (res.error) {
      if (isTableMissing(res.error)) return emptyConfig();
      throw AppError.fromSupabase(res.error, "settings_whatsapp_config");
    }
    if (!res.data) return emptyConfig();
    return toDomain(res.data as unknown as DbRow);
  }

  /**
   * Save toggle + templates. The api_token is NOT touched here — those
   * writes go through an edge function with service role (see migration
   * `revoke update (api_token_ciphertext)`).
   */
  async upsert(input: WhatsappConfigUpsert, updatedBy?: string): Promise<void> {
    const existing = await this.get();
    const payload = {
      enabled: input.enabled,
      provider: input.provider ?? existing.provider ?? "aisensy",
      templates: input.templates,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    };
    if (existing.id) {
      const { error } = await this.db
        .from("settings_whatsapp_config" as never)
        .update(payload as never)
        .eq("id", existing.id);
      if (error) throw AppError.fromSupabase(error, "settings_whatsapp_config.update");
    } else {
      const { error } = await this.db
        .from("settings_whatsapp_config" as never)
        .insert(payload as never);
      if (error) throw AppError.fromSupabase(error, "settings_whatsapp_config.insert");
    }
  }
}

export const whatsappSettingsService = new WhatsappSettingsService();
