// ──────────────────────────────────────────────────────────────────────────────
// Lead Score Engine — pure, deterministic, unit-testable.
//
// Produces a 0..100 score from the factors the spec calls out (source, course,
// class, previous interaction, response time, demo attendance, parent
// engagement) and maps it to a category. NO React, NO supabase here — the
// service persists the result + factor breakdown to lead_score_history.
// ──────────────────────────────────────────────────────────────────────────────

import type { LeadSource, ScoreCategory } from "../types/lead.types";

export interface ScoreFactors {
  source?: LeadSource | string;
  course?: string | null;
  standard?: string | null;
  /** Count of prior activities / interactions logged for the lead. */
  interactions?: number;
  /** Minutes from creation to first counselor response (undefined = no response yet). */
  responseMinutes?: number;
  /** Did the lead attend a demo? */
  demoAttended?: boolean;
  /** A parent contact (name/phone) present → higher engagement. */
  hasParentContact?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
}

export interface ScoreResult {
  score: number;
  category: ScoreCategory;
  breakdown: Record<string, number>;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Source quality weights — ad/landing leads convert better than cold manual.
const SOURCE_POINTS: Record<string, number> = {
  meta_ads: 20,
  landing: 18,
  referral: 16,
  walk_in: 14,
  call: 12,
  manual: 8,
};

// Course intent weights — high-ticket programs score higher.
const COURSE_POINTS = (course?: string | null): number => {
  if (!course) return 4;
  const c = course.toLowerCase();
  if (c.includes("neet") || c.includes("jee")) return 20;
  if (c.includes("foundation")) return 14;
  if (c.includes("tuition")) return 10;
  return 8;
};

export function categoryFor(score: number): ScoreCategory {
  if (score >= 80) return "priority";
  if (score >= 60) return "hot";
  if (score >= 35) return "warm";
  return "cold";
}

export function calculateLeadScore(f: ScoreFactors): ScoreResult {
  const breakdown: Record<string, number> = {};

  breakdown.source = SOURCE_POINTS[String(f.source ?? "manual")] ?? 8;
  breakdown.course = COURSE_POINTS(f.course);
  breakdown.standard = f.standard ? 6 : 0;

  // Engagement: parent contact + reachability.
  breakdown.engagement =
    (f.hasParentContact ? 8 : 0) + (f.hasPhone ? 6 : 0) + (f.hasEmail ? 4 : 0);

  // Prior interactions (capped).
  breakdown.interactions = clamp((f.interactions ?? 0) * 3, 0, 12);

  // Response time — faster first response → hotter (only when responded).
  if (f.responseMinutes === undefined) {
    breakdown.response = 0;
  } else if (f.responseMinutes <= 15) {
    breakdown.response = 14;
  } else if (f.responseMinutes <= 60) {
    breakdown.response = 10;
  } else if (f.responseMinutes <= 180) {
    breakdown.response = 5;
  } else {
    breakdown.response = 0;
  }

  // Demo attendance is the strongest pre-admission signal.
  breakdown.demo = f.demoAttended ? 20 : 0;

  const score = clamp(
    Object.values(breakdown).reduce((a, b) => a + b, 0),
    0,
    100,
  );

  return { score: Math.round(score), category: categoryFor(score), breakdown };
}
