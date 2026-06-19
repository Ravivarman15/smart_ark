// Dashboard aggregates — counselor (own leads) + management (all leads).
// Uses head+count queries (no row transfer) where possible; one bounded fetch
// for response-time averaging. Returns zeroed cards on a missing schema.

import { BaseService } from "@/shared/services";
import { slaService } from "./sla.service";
import type { CounselorDashboard, ManagementDashboard } from "../types/lead.types";

const startOfTodayISO = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

class LeadDashboardService extends BaseService {
  async counselor(counselorId: string): Promise<CounselorDashboard> {
    const empty: CounselorDashboard = {
      totalLeads: 0, todayLeads: 0, pendingFollowups: 0, overdueLeads: 0,
      demosScheduled: 0, admissions: 0, conversionRate: 0, avgResponseMinutes: 0,
      slaCompliance: 100,
    };
    try {
      const today = startOfTodayISO();

      const [total, todayC, overdue] = await Promise.all([
        this.db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("assigned_to", counselorId),
        this.db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("assigned_to", counselorId).gte("created_at", today),
        this.db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("assigned_to", counselorId).eq("is_overdue", true),
      ]);
      if (total.error) return empty;

      const pending = await this.db
        .from("lead_followups")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", counselorId)
        .eq("status", "pending");

      // demos + admissions need this counselor's lead ids.
      const leadIdsRes = await this.db
        .from("leads").select("id").is("deleted_at", null).eq("assigned_to", counselorId);
      const leadIds = (leadIdsRes.data as Record<string, unknown>[] | null ?? []).map((r) => String(r.id));

      let demos = 0;
      let admissions = 0;
      if (leadIds.length) {
        const [d, a] = await Promise.all([
          this.db.from("demo_classes").select("id", { count: "exact", head: true }).in("lead_id", leadIds).eq("status", "scheduled"),
          this.db.from("admissions").select("id", { count: "exact", head: true }).in("lead_id", leadIds),
        ]);
        demos = d.count ?? 0;
        admissions = a.count ?? 0;
      }

      const totalLeads = total.count ?? 0;

      // Avg response time (bounded fetch of responded leads).
      const respRes = await this.db
        .from("leads")
        .select("created_at, first_response_at")
        .eq("assigned_to", counselorId)
        .not("first_response_at", "is", null)
        .limit(500);
      const respRows = (respRes.data as Record<string, unknown>[] | null) ?? [];
      const avgResponseMinutes = respRows.length
        ? Math.round(
            respRows.reduce((acc, r) => {
              const c = new Date(String(r.created_at)).getTime();
              const f = new Date(String(r.first_response_at)).getTime();
              return acc + Math.max(0, (f - c) / 60_000);
            }, 0) / respRows.length,
          )
        : 0;

      const slaCompliance = await slaService.complianceForCounselor(counselorId);

      return {
        totalLeads,
        todayLeads: todayC.count ?? 0,
        pendingFollowups: pending.count ?? 0,
        overdueLeads: overdue.count ?? 0,
        demosScheduled: demos,
        admissions,
        conversionRate: totalLeads ? Math.round((admissions / totalLeads) * 100) : 0,
        avgResponseMinutes,
        slaCompliance,
      };
    } catch {
      return empty;
    }
  }

  async management(): Promise<ManagementDashboard> {
    const empty: ManagementDashboard = {
      totalLeads: 0, todayLeads: 0, admissions: 0, revenue: 0, pendingFollowups: 0,
      overdueLeads: 0, unassignedLeads: 0, highValueLeads: 0, slaViolations: 0, conversionRate: 0,
    };
    try {
      const today = startOfTodayISO();
      const base = () => this.db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null);

      const [total, todayC, overdue, unassigned, highValue] = await Promise.all([
        base(),
        base().gte("created_at", today),
        base().eq("is_overdue", true),
        base().eq("assignment_state", "unassigned"),
        base().in("score_category", ["hot", "priority"]),
      ]);
      if (total.error) return empty;

      const [pending, slaViol, admissionRows] = await Promise.all([
        this.db.from("lead_followups").select("id", { count: "exact", head: true }).eq("status", "pending"),
        this.db.from("lead_sla").select("id", { count: "exact", head: true }).eq("breached", true),
        this.db.from("admissions").select("fee_amount").is("deleted_at", null),
      ]);

      const admRows = (admissionRows.data as Record<string, unknown>[] | null) ?? [];
      const revenue = admRows.reduce((a, r) => a + Number(r.fee_amount ?? 0), 0);
      const admissions = admRows.length;
      const totalLeads = total.count ?? 0;

      return {
        totalLeads,
        todayLeads: todayC.count ?? 0,
        admissions,
        revenue,
        pendingFollowups: pending.count ?? 0,
        overdueLeads: overdue.count ?? 0,
        unassignedLeads: unassigned.count ?? 0,
        highValueLeads: highValue.count ?? 0,
        slaViolations: slaViol.count ?? 0,
        conversionRate: totalLeads ? Math.round((admissions / totalLeads) * 100) : 0,
      };
    } catch {
      return empty;
    }
  }
}

export const leadDashboardService = new LeadDashboardService();
