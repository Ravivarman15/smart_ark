// Lead WhatsApp Delivery analytics — read-only aggregation over lead_whatsapp_logs.
// Enriches each log with the counselor (via leads.assigned_to) so the dashboard
// can slice delivery by counselor + course. Degrades to [] when the schema is
// missing (pre-migration) so the page renders empty states, never crashes.

import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing } from "./leadMappers";
import type { WaLogRow } from "../utils/whatsappDelivery";

export interface WhatsappLogsQuery {
  /** ISO date (inclusive lower bound on created_at). */
  from?: string;
  /** ISO date (inclusive upper bound on created_at). */
  to?: string;
  limit?: number;
}

class LeadWhatsappAnalyticsService extends BaseService {
  /** Fetch enriched WhatsApp delivery log rows for the dashboard. */
  async fetchLogs(q: WhatsappLogsQuery = {}): Promise<WaLogRow[]> {
    let query = this.db
      .from("lead_whatsapp_logs" as never)
      .select(
        "id, lead_id, template_key, course, recipient_kind, status, queued_at, sent_at, delivered_at, read_at, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(q.limit ?? 5000);
    if (q.from) query = query.gte("created_at", q.from);
    if (q.to) query = query.lte("created_at", q.to);

    const res = await query;
    if (res.error) {
      if (isSchemaMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "lead_whatsapp_logs.analytics");
    }
    const logs = (res.data as unknown as Record<string, unknown>[]) ?? [];
    if (logs.length === 0) return [];

    // Resolve counselor + course via the parent lead (logs carry lead_id; course
    // may be null on escalation rows written by sla-checker).
    const leadIds = [...new Set(logs.map((l) => String(l.lead_id)).filter(Boolean))];
    const leadMap = new Map<string, { assignedTo: string | null; course: string | null }>();
    if (leadIds.length) {
      const leadRes = await this.db
        .from("leads" as never)
        .select("id, assigned_to, course")
        .in("id", leadIds as never);
      if (!leadRes.error) {
        for (const l of (leadRes.data as unknown as Record<string, unknown>[]) ?? []) {
          leadMap.set(String(l.id), {
            assignedTo: (l.assigned_to as string) ?? null,
            course: (l.course as string) ?? null,
          });
        }
      }
    }

    return logs.map((l): WaLogRow => {
      const parent = leadMap.get(String(l.lead_id));
      return {
        id: String(l.id),
        leadId: String(l.lead_id),
        templateKey: String(l.template_key ?? ""),
        course: (l.course as string) ?? parent?.course ?? null,
        counselorId: parent?.assignedTo ?? null,
        recipientKind: (l.recipient_kind as string) ?? null,
        status: String(l.status ?? "queued"),
        queuedAt: (l.queued_at as string) ?? null,
        sentAt: (l.sent_at as string) ?? null,
        deliveredAt: (l.delivered_at as string) ?? null,
        readAt: (l.read_at as string) ?? null,
        createdAt: String(l.created_at ?? new Date().toISOString()),
      };
    });
  }
}

export const leadWhatsappAnalyticsService = new LeadWhatsappAnalyticsService();
