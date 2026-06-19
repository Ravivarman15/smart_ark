// Counselor leaderboard + fastest-response aggregation. Fetches the raw rows
// (server-side filtered) and delegates all math to the pure utils so the logic
// stays unit-tested. Degrades to an empty board on a missing schema.

import { BaseService } from "@/shared/services";
import {
  computeLeaderboard,
  computeResponseStats,
  responseMinutesFor,
  type CounselorAux,
  type CounselorRow,
  type LeaderboardLead,
  type ResponseStats,
} from "../utils/leaderboard";

export interface LeaderboardResult {
  rows: CounselorRow[];
  responseStats: ResponseStats;
}

const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

class LeaderboardService extends BaseService {
  /** Full leaderboard for a window (defaults to current month). */
  async build(params: { from?: string; to?: string } = {}): Promise<LeaderboardResult> {
    const from = params.from ?? monthStartISO();
    try {
      let q = this.db
        .from("leads")
        .select("id, assigned_to, status, created_at, first_response_at")
        .is("deleted_at", null)
        .not("assigned_to", "is", null)
        .gte("created_at", from);
      if (params.to) q = q.lte("created_at", params.to);
      const leadRes = await q.limit(5000);
      if (leadRes.error) return { rows: [], responseStats: emptyStats() };

      const rawLeads = (leadRes.data as Record<string, unknown>[]) ?? [];
      const leads: LeaderboardLead[] = rawLeads.map((r) => ({
        assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
        status: String(r.status) as LeaderboardLead["status"],
        createdAt: String(r.created_at),
        firstResponseAt: r.first_response_at ? String(r.first_response_at) : undefined,
      }));
      const leadIdToCounselor = new Map<string, string>();
      for (const r of rawLeads) {
        if (r.assigned_to) leadIdToCounselor.set(String(r.id), String(r.assigned_to));
      }

      // Names.
      const staffRes = await this.db.from("profiles").select("id, name");
      const names = new Map<string, string>();
      for (const p of (staffRes.data as Record<string, unknown>[]) ?? []) {
        names.set(String(p.id), String(p.name ?? ""));
      }

      // Aux: follow-up completion (by assigned_to) + demo completion (via lead→counselor).
      const aux = new Map<string, CounselorAux>();
      const bump = (cid: string, patch: Partial<CounselorAux>) => {
        const cur = aux.get(cid) ?? {};
        aux.set(cid, {
          followupsTotal: (cur.followupsTotal ?? 0) + (patch.followupsTotal ?? 0),
          followupsCompleted: (cur.followupsCompleted ?? 0) + (patch.followupsCompleted ?? 0),
          demosTotal: (cur.demosTotal ?? 0) + (patch.demosTotal ?? 0),
          demosCompleted: (cur.demosCompleted ?? 0) + (patch.demosCompleted ?? 0),
        });
      };

      const fuRes = await this.db.from("lead_followups").select("assigned_to, status").gte("created_at", from);
      for (const f of (fuRes.data as Record<string, unknown>[]) ?? []) {
        if (!f.assigned_to) continue;
        bump(String(f.assigned_to), {
          followupsTotal: 1,
          followupsCompleted: f.status === "done" ? 1 : 0,
        });
      }

      const demoRes = await this.db.from("demo_classes").select("lead_id, status").gte("created_at", from);
      for (const d of (demoRes.data as Record<string, unknown>[]) ?? []) {
        const cid = leadIdToCounselor.get(String(d.lead_id));
        if (!cid) continue;
        bump(cid, { demosTotal: 1, demosCompleted: d.status === "attended" ? 1 : 0 });
      }

      const rows = computeLeaderboard(leads, names, aux);
      const samples = leads
        .map((l) => responseMinutesFor(l))
        .filter((n): n is number => n !== null);
      return { rows, responseStats: computeResponseStats(samples) };
    } catch {
      return { rows: [], responseStats: emptyStats() };
    }
  }
}

const emptyStats = (): ResponseStats => ({
  count: 0, average: null, median: null, fastest: null, slowest: null,
});

export const leaderboardService = new LeaderboardService();
