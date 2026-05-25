// ──────────────────────────────────────────────────────────────────────────────
// Communication analytics — centralised aggregation. ZERO maths in UI.
// Composes the `message_queue` outbox into delivery / read / failure stats.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import type { CommsAnalytics } from "../types/communication.types";
import { groupByDay, pct } from "../utils/commsCalc";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

const emptyAnalytics = (): CommsAnalytics => ({
  total: 0,
  queued: 0,
  processing: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  failed: 0,
  cancelled: 0,
  deliveryRate: 0,
  readRate: 0,
  failureRate: 0,
  byTemplate: [],
  byChannel: [],
  byDay: [],
});

class CommsAnalyticsService extends BaseService {
  async overview(filter: { campaignId?: string; from?: string; to?: string } = {}): Promise<CommsAnalytics> {
    let q = this.db
      .from("message_queue" as never)
      .select(
        "id, status, channel, template_key, template, sent_at, delivered_at, read_at, created_at, campaign_id"
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (filter.campaignId) q = q.eq("campaign_id", filter.campaignId);
    if (filter.from) q = q.gte("created_at", filter.from);
    if (filter.to) q = q.lte("created_at", filter.to);

    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return emptyAnalytics();
      throw AppError.fromSupabase(res.error, "message_queue.analytics");
    }
    const rows =
      (res.data as unknown as Array<{
        id: string;
        status: string;
        channel: string;
        template_key: string | null;
        template: string;
        sent_at: string | null;
        delivered_at: string | null;
        read_at: string | null;
        created_at: string;
      }>) ?? [];

    const out = emptyAnalytics();
    out.total = rows.length;

    const tplMap = new Map<string, { total: number; delivered: number; failed: number }>();
    const chanMap = new Map<string, number>();

    for (const r of rows) {
      switch (r.status) {
        case "queued":
          out.queued++;
          break;
        case "processing":
          out.processing++;
          break;
        case "sent":
          out.sent++;
          break;
        case "delivered":
          out.delivered++;
          break;
        case "read":
          out.read++;
          break;
        case "failed":
          out.failed++;
          break;
        case "cancelled":
          out.cancelled++;
          break;
      }
      const tkey = r.template_key || r.template || "—";
      const t = tplMap.get(tkey) ?? { total: 0, delivered: 0, failed: 0 };
      t.total++;
      if (r.status === "delivered" || r.status === "read") t.delivered++;
      if (r.status === "failed") t.failed++;
      tplMap.set(tkey, t);
      chanMap.set(r.channel, (chanMap.get(r.channel) ?? 0) + 1);
    }

    out.deliveryRate = pct(out.delivered + out.read, out.total);
    out.readRate = pct(out.read, out.total);
    out.failureRate = pct(out.failed, out.total);

    out.byTemplate = Array.from(tplMap.entries())
      .map(([templateKey, v]) => ({ templateKey, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    out.byChannel = Array.from(chanMap.entries())
      .map(([channel, total]) => ({ channel, total }))
      .sort((a, b) => b.total - a.total);

    const dayMap = new Map<string, { total: number; delivered: number; failed: number }>();
    for (const r of rows) {
      const day = (r.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const v = dayMap.get(day) ?? { total: 0, delivered: 0, failed: 0 };
      v.total++;
      if (r.status === "delivered" || r.status === "read") v.delivered++;
      if (r.status === "failed") v.failed++;
      dayMap.set(day, v);
    }
    out.byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, ...v }));

    // groupByDay is also exposed by commsCalc — kept here for downstream re-use.
    void groupByDay;

    return out;
  }
}

export const commsAnalyticsService = new CommsAnalyticsService();
