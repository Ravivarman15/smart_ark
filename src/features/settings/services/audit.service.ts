import { BaseService } from "@/shared/services";
import type { SettingsAuditArea, SettingsAuditEntry } from "../types/settings.types";

// Settings audit log — fire-and-forget writes from hooks. Errors are
// swallowed so a missing audit table never blocks the actual change.

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

class SettingsAuditService extends BaseService {
  async record(args: SettingsAuditEntry & { actorId?: string }): Promise<void> {
    const payload = {
      actor_id: args.actorId ?? null,
      area: args.area,
      change_key: args.changeKey ?? null,
      prev_value: args.prevValue ?? null,
      new_value: args.newValue ?? null,
    };
    const { error } = await this.db
      .from("settings_audit" as never)
      .insert(payload as never);
    if (error && !isTableMissing(error)) {
      // eslint-disable-next-line no-console
      console.warn("[settings.audit]", error.message);
    }
  }
}

export const settingsAuditService = new SettingsAuditService();
export type { SettingsAuditArea };
