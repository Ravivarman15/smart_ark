import { BaseService } from "@/shared/services";
import type { FacultyInsight, FacultyWorkload } from "../types/allocation.types";
import { facultyWorkloadService } from "./facultyWorkload.service";

// ─────────────────────────────────────────────────────────────────────────────
// Faculty insights (Phase 11).
//
// DETERMINISTIC scoring — no external LLM, no network. Every number below is
// derived from data the module already owns (allocated vs completed minutes,
// punctuality, cancellations, rate), so the same inputs always produce the same
// insight and the panel works offline. This mirrors how the exam module's
// grading insights are computed.
//
// Scores are 0-100, higher is better, EXCEPT burnoutRisk which is a band.
// ─────────────────────────────────────────────────────────────────────────────

/** Weekly hours considered a full, healthy teaching load. */
export const TARGET_WEEKLY_HOURS = 18;
/** Above this weekly load a faculty member is over-utilised. */
export const OVERLOAD_WEEKLY_HOURS = 26;
/** Below this weekly load they are under-utilised. */
export const UNDERLOAD_WEEKLY_HOURS = 8;

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Pure scoring over one faculty workload row.
 *
 * @param weeks how many weeks the workload window spans (to normalise load)
 */
export const scoreFaculty = (w: FacultyWorkload, weeks = 4): FacultyInsight => {
  const allocatedHours = w.allocatedMinutes / 60;
  const completedHours = w.completedMinutes / 60;
  const weeklyHours = weeks > 0 ? allocatedHours / weeks : allocatedHours;

  // Productivity — how much of the allocated load actually got delivered,
  // penalised by missed classes.
  const delivery = w.allocatedMinutes > 0 ? w.completedMinutes / w.allocatedMinutes : 0;
  const missPenalty = w.allocatedMinutes > 0 ? w.missedMinutes / w.allocatedMinutes : 0;
  const productivityScore = clamp(delivery * 100 - missPenalty * 30);

  // Consistency — punctuality. 0 min average delay = 100; 30 min = 0.
  const consistencyScore = clamp(100 - (w.averageDelayMinutes / 30) * 100);

  // Workload — 100 at the target weekly load, falling off in both directions.
  const workloadScore = clamp(
    100 - (Math.abs(weeklyHours - TARGET_WEEKLY_HOURS) / TARGET_WEEKLY_HOURS) * 100,
  );

  const utilisation: FacultyInsight["utilisation"] =
    weeklyHours >= OVERLOAD_WEEKLY_HOURS
      ? "over"
      : weeklyHours <= UNDERLOAD_WEEKLY_HOURS
        ? "under"
        : "balanced";

  // Burnout risk — sustained overload, worsened by chronic lateness (a classic
  // fatigue signal) and by carrying a lot of extra classes.
  const extraShare = w.completedMinutes > 0 ? w.extraMinutes / w.completedMinutes : 0;
  const burnoutRisk: FacultyInsight["burnoutRisk"] =
    weeklyHours >= OVERLOAD_WEEKLY_HOURS && (w.averageDelayMinutes > 10 || extraShare > 0.25)
      ? "high"
      : weeklyHours >= OVERLOAD_WEEKLY_HOURS || extraShare > 0.3
        ? "medium"
        : "low";

  // Teaching efficiency — actual delivered time vs the time allocated.
  const teachingEfficiencyPct = clamp(delivery * 100, 0, 200);

  const recommendations: string[] = [];
  if (utilisation === "over")
    recommendations.push(
      `Reduce load — ${weeklyHours.toFixed(1)}h/week is above the ${OVERLOAD_WEEKLY_HOURS}h threshold. Redistribute or assign a substitute.`,
    );
  if (utilisation === "under")
    recommendations.push(
      `Capacity available — only ${weeklyHours.toFixed(1)}h/week allocated. Consider extra classes or additional sections.`,
    );
  if (w.averageDelayMinutes > 10)
    recommendations.push(
      `Average start delay is ${w.averageDelayMinutes} min across ${w.lateStarts} late starts — review the timetable gaps or room changes.`,
    );
  if (w.missedMinutes > 0)
    recommendations.push(
      `${(w.missedMinutes / 60).toFixed(1)}h of classes were missed — schedule make-up classes to protect syllabus coverage.`,
    );
  if (w.classesRemaining > 0 && delivery < 0.5 && w.allocatedMinutes > 0)
    recommendations.push(
      `Only ${Math.round(delivery * 100)}% of allocated hours are complete with ${w.classesRemaining} classes left — monitor closely.`,
    );
  if (burnoutRisk === "high")
    recommendations.push("Burnout risk HIGH — sustained overload with slipping punctuality.");
  if (recommendations.length === 0)
    recommendations.push("Balanced load, on-time delivery — no action needed.");

  return {
    teacherId: w.teacherId,
    teacherName: w.teacherName,
    productivityScore,
    consistencyScore,
    workloadScore,
    burnoutRisk,
    utilisation,
    averageDelayMinutes: w.averageDelayMinutes,
    costPerHour: completedHours > 0 ? Math.round(w.salaryEarned / completedHours) : w.hourlyRate,
    teachingEfficiencyPct,
    recommendations,
  };
};

/** Days → whole weeks (min 1) so short windows don't distort weekly load. */
export const weeksBetween = (from: string, to: string): number => {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const days =
    (Date.UTC(ty, (tm ?? 1) - 1, td ?? 1) - Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1)) / 86400000 + 1;
  return Math.max(1, days / 7);
};

class FacultyInsightsService extends BaseService {
  /** Insight cards for every faculty member with classes in the window. */
  async list(
    from: string,
    to: string,
    opts: { coordinatorId?: string; teacherId?: string } = {},
  ): Promise<FacultyInsight[]> {
    const workloads = await facultyWorkloadService.list(from, to, opts);
    const weeks = weeksBetween(from, to);
    return workloads
      .map((w) => scoreFaculty(w, weeks))
      .sort((a, b) => b.productivityScore - a.productivityScore);
  }
}

export const facultyInsightsService = new FacultyInsightsService();
