// ──────────────────────────────────────────────────────────────────────────────
// Counselor leaderboard + fastest-response engine — PURE & unit-testable.
// No React, no supabase. The leaderboard service fetches rows and feeds them
// here; components render the result.
// ──────────────────────────────────────────────────────────────────────────────

import type { LeadStatus } from "../types/lead.types";

export interface LeaderboardLead {
  assignedTo?: string;
  status: LeadStatus;
  createdAt: string;
  firstResponseAt?: string;
}

export interface CounselorAux {
  followupsTotal?: number;
  followupsCompleted?: number;
  demosTotal?: number;
  demosCompleted?: number;
}

export interface CounselorRow {
  counselorId: string;
  name: string;
  leadsHandled: number;
  admissions: number;
  conversionRate: number; // %
  avgResponseMinutes: number | null;
  fastestResponseMinutes: number | null;
  followupCompletion: number; // %
  demoCompletion: number; // %
  score: number; // composite for overall ranking
  rank: number;
}

/** Minutes from lead creation to first counselor response (null if no response). */
export function responseMinutesFor(lead: LeadLike): number | null {
  if (!lead.firstResponseAt) return null;
  const created = new Date(lead.createdAt).getTime();
  const responded = new Date(lead.firstResponseAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(responded)) return null;
  return Math.max(0, (responded - created) / 60_000);
}

interface LeadLike {
  createdAt: string;
  firstResponseAt?: string;
}

export interface ResponseStats {
  count: number;
  average: number | null;
  median: number | null;
  fastest: number | null;
  slowest: number | null;
}

/** Average / median / fastest / slowest over a set of response-minute samples. */
export function computeResponseStats(samples: number[]): ResponseStats {
  const xs = samples.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return { count: 0, average: null, median: null, fastest: null, slowest: null };
  const sum = xs.reduce((a, b) => a + b, 0);
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
  return {
    count: xs.length,
    average: Math.round((sum / xs.length) * 10) / 10,
    median: Math.round(median * 10) / 10,
    fastest: xs[0],
    slowest: xs[xs.length - 1],
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Build the ranked counselor leaderboard. `score` is a composite used for the
 * overall rank; individual category leaders (most admissions, fastest, etc.)
 * are derived from the returned rows by the caller.
 */
export function computeLeaderboard(
  leads: LeaderboardLead[],
  names: Map<string, string>,
  aux: Map<string, CounselorAux> = new Map(),
): CounselorRow[] {
  const grouped = new Map<string, LeaderboardLead[]>();
  for (const l of leads) {
    if (!l.assignedTo) continue;
    const arr = grouped.get(l.assignedTo) ?? [];
    arr.push(l);
    grouped.set(l.assignedTo, arr);
  }

  const rows: CounselorRow[] = [];
  for (const [counselorId, group] of grouped) {
    const leadsHandled = group.length;
    const admissions = group.filter((l) => l.status === "admission").length;
    const conversionRate = leadsHandled ? round((admissions / leadsHandled) * 100) : 0;
    const responseSamples = group
      .map((l) => responseMinutesFor(l))
      .filter((n): n is number => n !== null);
    const stats = computeResponseStats(responseSamples);
    const a = aux.get(counselorId) ?? {};
    const followupCompletion = a.followupsTotal
      ? round(((a.followupsCompleted ?? 0) / a.followupsTotal) * 100)
      : 0;
    const demoCompletion = a.demosTotal
      ? round(((a.demosCompleted ?? 0) / a.demosTotal) * 100)
      : 0;

    // Composite: admissions weigh most, then conversion, then speed + completion.
    // Faster response → higher (invert: 60min cap → 0..20 pts).
    const speedPts = stats.average === null ? 0 : Math.max(0, 20 - Math.min(20, stats.average / 3));
    const score = round(
      admissions * 10 +
        conversionRate * 0.4 +
        speedPts +
        followupCompletion * 0.15 +
        demoCompletion * 0.15,
    );

    rows.push({
      counselorId,
      name: names.get(counselorId) ?? "Unknown",
      leadsHandled,
      admissions,
      conversionRate,
      avgResponseMinutes: stats.average,
      fastestResponseMinutes: stats.fastest,
      followupCompletion,
      demoCompletion,
      score,
    });
  }

  rows.sort((a, b) => b.score - a.score || b.admissions - a.admissions);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export type LeaderCategory =
  | "overall"
  | "admissions"
  | "conversion"
  | "fastest"
  | "demos";

/** The single top counselor for a given category (null if no data). */
export function categoryLeader(rows: CounselorRow[], category: LeaderCategory): CounselorRow | null {
  if (rows.length === 0) return null;
  const pool = [...rows];
  switch (category) {
    case "admissions":
      pool.sort((a, b) => b.admissions - a.admissions);
      break;
    case "conversion":
      pool.sort((a, b) => b.conversionRate - a.conversionRate);
      break;
    case "fastest":
      pool.sort((a, b) => {
        if (a.avgResponseMinutes === null) return 1;
        if (b.avgResponseMinutes === null) return -1;
        return a.avgResponseMinutes - b.avgResponseMinutes;
      });
      break;
    case "demos":
      pool.sort((a, b) => b.demoCompletion - a.demoCompletion);
      break;
    default:
      pool.sort((a, b) => b.score - a.score);
  }
  return pool[0] ?? null;
}
