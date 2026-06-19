// SLA engine — per-stage deadline tracking.
// Stage windows: new → respond in 15m; contacted → demo in 2 days;
// demo_attended → admission in 7 days. (See SLA_MINUTES.)

import { BaseService } from "@/shared/services";
import { isSchemaMissing, SLA_MINUTES } from "./leadMappers";

class SlaService extends BaseService {
  /** Open (start) an SLA window for a lead entering a stage. */
  async open(leadId: string, stage: string): Promise<string | null> {
    const minutes = SLA_MINUTES[stage];
    if (minutes === undefined) return null; // no SLA defined for this stage
    const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const res = await this.db.from("lead_sla").insert({
      lead_id: leadId,
      stage,
      due_at: dueAt,
    } as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] sla.open failed:", res.error.message);
    }
    return dueAt;
  }

  /** Resolve all open SLA rows for a lead (it advanced/closed). */
  async resolve(leadId: string, stage?: string): Promise<void> {
    let q = this.db
      .from("lead_sla")
      .update({ resolved_at: new Date().toISOString() } as never)
      .eq("lead_id", leadId)
      .is("resolved_at", null);
    if (stage) q = q.eq("stage", stage);
    const res = await q;
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[leads] sla.resolve failed:", res.error.message);
    }
  }

  /** Compliance % for a counselor: resolved-before-breach / total closed windows. */
  async complianceForCounselor(counselorId: string): Promise<number> {
    // Join via leads.assigned_to; fetch this counselor's lead ids first.
    const leadRes = await this.db
      .from("leads")
      .select("id")
      .eq("assigned_to", counselorId)
      .is("deleted_at", null);
    if (leadRes.error || !leadRes.data?.length) return 100;
    const ids = (leadRes.data as Record<string, unknown>[]).map((r) => String(r.id));

    const slaRes = await this.db
      .from("lead_sla")
      .select("breached")
      .in("lead_id", ids);
    if (slaRes.error || !slaRes.data?.length) return 100;
    const rows = slaRes.data as Record<string, unknown>[];
    const breached = rows.filter((r) => r.breached === true).length;
    return Math.round(((rows.length - breached) / rows.length) * 100);
  }
}

export const slaService = new SlaService();
