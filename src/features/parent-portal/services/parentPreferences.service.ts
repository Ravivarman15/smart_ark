// ── Parent Portal — parent-owned settings ────────────────────────────────────
//
// Scope note: this holds ONLY what the parent owns and what had nowhere else to
// live (portal language, theme, per-event notification opt-outs).
//
// It deliberately does NOT own the outbound channel preference. That is
// `students.communication_preference` — the Communication engine's source of
// truth, already read by the WhatsApp/Email dispatchers. Duplicating it here
// would create two answers to "how do we contact this family", and the engine
// would keep using the other one.

import { BaseService } from "@/shared/services";
import type { ParentPreferences } from "../types/parentPortal.types";

const DEFAULTS: ParentPreferences = {
  language: "en",
  theme: "system",
  notificationPrefs: {},
};

class ParentPreferencesService extends BaseService {
  /** Never throws — a parent with no row yet simply gets the defaults. */
  async get(parentAccountId: string): Promise<ParentPreferences> {
    // The result is typed `never` because the table postdates the generated
    // Supabase types; widen once, here, rather than at every field read.
    const res = (await this.db
      .from("parent_portal_preferences" as never)
      .select("language, theme, notification_prefs")
      .eq("parent_account_id", parentAccountId)
      .maybeSingle()) as { data: unknown; error: unknown };
    if (res.error || !res.data) return DEFAULTS;
    const r = res.data as Record<string, unknown>;
    return {
      language: (r.language as string) || "en",
      theme: ((r.theme as string) || "system") as ParentPreferences["theme"],
      notificationPrefs: (r.notification_prefs as Record<string, boolean>) ?? {},
    };
  }

  /**
   * Upsert on the primary key so first-save and update are the same call —
   * a parent toggling a switch should not care whether a row exists.
   */
  async save(parentAccountId: string, prefs: ParentPreferences): Promise<void> {
    const { error } = await this.db
      .from("parent_portal_preferences" as never)
      .upsert(
        {
          parent_account_id: parentAccountId,
          language: prefs.language,
          theme: prefs.theme,
          notification_prefs: prefs.notificationPrefs,
        } as never,
        { onConflict: "parent_account_id" },
      );
    if (error) throw error;
  }
}

export const parentPreferencesService = new ParentPreferencesService();
