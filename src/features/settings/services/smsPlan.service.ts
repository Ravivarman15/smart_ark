import { BaseService } from "@/shared/services";
import type { SmsPlanSummary } from "../types/settings.types";

// SMS plan service. No `sms_transactions` table exists yet — when one is
// added, replace the synthetic series with a real query. Until then the UI
// shows a placeholder state with the low-balance threshold from config.

const LOW_BALANCE_DEFAULT = 100;

class SmsPlanService extends BaseService {
  async summary(): Promise<SmsPlanSummary> {
    // Try to read from a (likely-missing) sms_transactions table; gracefully
    // fall back to an empty history.
    const res = await this.db
      .from("sms_transactions" as never)
      .select("id, type, amount, occurred_at, note")
      .order("occurred_at", { ascending: false })
      .limit(50);

    let history: SmsPlanSummary["history"] = [];
    let lifetimeUsage = 0;
    let balance = 0;
    let lastRechargeAt: string | undefined;

    if (!res.error && Array.isArray(res.data)) {
      type Row = { id: string; type: "recharge" | "spend"; amount: number; occurred_at: string; note?: string };
      const rows = (res.data as unknown as Row[]);
      history = rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount) || 0,
        occurredAt: r.occurred_at,
        note: r.note,
      }));
      for (const r of rows) {
        if (r.type === "recharge") {
          balance += Number(r.amount) || 0;
          if (!lastRechargeAt) lastRechargeAt = r.occurred_at;
        } else if (r.type === "spend") {
          balance -= Number(r.amount) || 0;
          lifetimeUsage += Number(r.amount) || 0;
        }
      }
    }

    // Monthly usage = sum of spends in the last 30 days.
    const cutoff = Date.now() - 30 * 86_400_000;
    const monthlyUsage = history
      .filter((h) => h.type === "spend" && new Date(h.occurredAt).getTime() >= cutoff)
      .reduce((sum, h) => sum + h.amount, 0);

    return {
      balance,
      monthlyUsage,
      lifetimeUsage,
      lowBalanceThreshold: LOW_BALANCE_DEFAULT,
      lastRechargeAt,
      history,
    };
  }
}

export const smsPlanService = new SmsPlanService();
