import { BaseService, AppError } from "@/shared/services";
import type {
  SmsAutomation,
  SmsAutomationUpsert,
} from "../types/settings.types";

// Default catalog seeded into the UI when the table is empty (or missing).
// These keys match what the migration suggests; the UI shows them with the
// supplied labels so management has a starting point to edit.
export const DEFAULT_SMS_AUTOMATIONS: SmsAutomationUpsert[] = [
  { automationKey: "fee_due", label: "Fee Due Reminder", enabled: false,
    template: "Hi {student_name}, your fee of ₹{amount} is due on {due_date}. — ARK" },
  { automationKey: "attendance", label: "Attendance Alert", enabled: false,
    template: "Hi {parent_name}, {student_name} was marked absent on {date}." },
  { automationKey: "exam", label: "Exam Reminder", enabled: false,
    template: "Reminder: {exam_name} on {date} for {batch}. Best of luck!" },
  { automationKey: "birthday", label: "Birthday Wishes", enabled: false,
    template: "Happy birthday {student_name}! — Team ARK" },
  { automationKey: "enquiry_followup", label: "Enquiry Follow-up", enabled: false,
    template: "Hi {name}, thanks for your enquiry. Reply to schedule a visit." },
];

type DbRow = {
  id: string;
  automation_key: string;
  label: string;
  enabled: boolean;
  template: string;
  updated_at: string | null;
  updated_by: string | null;
};

const toDomain = (r: DbRow): SmsAutomation => ({
  id: r.id,
  automationKey: r.automation_key,
  label: r.label,
  enabled: !!r.enabled,
  template: r.template ?? "",
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

class SmsSettingsService extends BaseService {
  /**
   * List automations. When the table is missing (migration not applied),
   * returns synthetic defaults so the UI keeps working — toggles persist
   * only after the migration is run.
   */
  async list(): Promise<SmsAutomation[]> {
    const res = await this.db
      .from("settings_sms_automations" as never)
      .select("id, automation_key, label, enabled, template, updated_at, updated_by")
      .order("automation_key");

    if (res.error) {
      if (isTableMissing(res.error)) {
        return DEFAULT_SMS_AUTOMATIONS.map((d, i) => ({
          id: `seed-${i}`,
          ...d,
        }));
      }
      throw AppError.fromSupabase(res.error, "settings_sms_automations");
    }

    const rows = ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
    if (rows.length > 0) return rows;
    // Empty table → return seed defaults; first upsert from the UI will
    // persist them to the DB.
    return DEFAULT_SMS_AUTOMATIONS.map((d, i) => ({
      id: `seed-${i}`,
      ...d,
    }));
  }

  async upsert(input: SmsAutomationUpsert, updatedBy?: string): Promise<void> {
    const payload = {
      automation_key: input.automationKey,
      label: input.label,
      enabled: input.enabled,
      template: input.template,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    };
    const { error } = await this.db
      .from("settings_sms_automations" as never)
      .upsert(payload as never, { onConflict: "organization_id,automation_key" });
    if (error) throw AppError.fromSupabase(error, "settings_sms_automations.upsert");
  }
}

export const smsSettingsService = new SmsSettingsService();
