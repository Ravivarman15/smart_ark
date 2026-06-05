import { BaseService } from "@/shared/services";
import { studentAnalyticsService } from "./studentAnalytics.service";
import { staffAnalyticsService } from "./staffAnalytics.service";
import type {
  RiskAnalytics,
  RiskLevel,
  StudentAnalyticsFilters,
  StudentRiskRow,
  StaffRiskRow,
} from "../types/analytics.types";

const staffRiskLevel = (score: number): RiskLevel =>
  score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

/**
 * Risk engine — derives at-risk students and staff from the same live
 * analytics the other pages use (no separate fetch logic, no duplicate math).
 * Produces a 0–100 risk score + human-readable reason per entity.
 */
class RiskAnalyticsService extends BaseService {
  async analyze(filters: StudentAnalyticsFilters): Promise<RiskAnalytics> {
    const [students, staff] = await Promise.all([
      studentAnalyticsService.analyze(filters),
      staffAnalyticsService.analyze({ from: filters.from, to: filters.to }),
    ]);

    const studentRisks: StudentRiskRow[] = students.defaulters
      .filter((d) => d.riskLevel !== "low")
      .map((d) => {
        const score = Math.min(100, 100 - d.attendancePct + d.consecutiveAbsence * 5);
        const reasons: string[] = [];
        if (d.attendancePct < 75) reasons.push(`${d.attendancePct}% attendance`);
        if (d.consecutiveAbsence >= 3) reasons.push(`${d.consecutiveAbsence} consecutive absences`);
        return { ...d, riskScore: Math.round(score), reason: reasons.join(" · ") || "Below threshold" };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    const staffRisks: StaffRiskRow[] = staff.performance
      .map((p) => {
        const score = Math.min(100, 100 - p.attendancePct + p.lateCount * 3);
        return {
          staffId: p.staffId,
          staffName: p.staffName,
          role: p.role,
          attendancePct: p.attendancePct,
          lateCount: p.lateCount,
          riskScore: Math.round(score),
          riskLevel: staffRiskLevel(score),
          reason:
            [
              p.attendancePct < 80 ? `${p.attendancePct}% attendance` : "",
              p.lateCount >= 3 ? `${p.lateCount} late arrivals` : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Within limits",
        };
      })
      .filter((r) => r.riskLevel !== "low")
      .sort((a, b) => b.riskScore - a.riskScore);

    return { studentRisks, staffRisks };
  }
}

export const riskAnalyticsService = new RiskAnalyticsService();
