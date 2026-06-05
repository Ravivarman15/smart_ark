import { BaseService } from "@/shared/services";
import { studentAnalyticsService } from "../../analytics/services/studentAnalytics.service";
import { staffAnalyticsService } from "../../analytics/services/staffAnalytics.service";
import { today, monthStart } from "../../utils/dates";
import { isGovMissing } from "./governanceAudit.service";
import type { ComplianceSnapshot } from "../types/governance.types";

/**
 * Compliance Dashboard aggregate. Combines live analytics (student defaulters,
 * staff below target) with governance counts (pending approvals / reopens,
 * unapproved corrections, open alerts, closed months, active locks). Every
 * governance count degrades to 0 when Phase-5 tables are absent.
 */
class ComplianceService extends BaseService {
  async snapshot(): Promise<ComplianceSnapshot> {
    const td = today();
    const filters = { from: monthStart(td), to: td };

    const [student, staff] = await Promise.all([
      studentAnalyticsService.analyze(filters).catch(() => null),
      staffAnalyticsService.analyze({ from: filters.from, to: filters.to }).catch(() => null),
    ]);

    const studentsBelow75 = (student?.defaulters ?? []).filter((d) => d.attendancePct < 75).length;
    const studentsBelow50 = (student?.defaulters ?? []).filter((d) => d.attendancePct < 50).length;
    const minPct = 75;
    const staffBelowTarget = (staff?.performance ?? []).filter((p) => p.attendancePct < minPct).length;

    const safeCount = async (table: string, build: (q: any) => any): Promise<number> => {
      try {
        const res = await build(this.db.from(table as never).select("id", { count: "exact", head: true }));
        if (res.error) {
          if (isGovMissing(res.error)) return 0;
          return 0;
        }
        return res.count ?? 0;
      } catch {
        return 0;
      }
    };

    const [pendingApprovals, pendingReopens, unapprovedCorrections, openAlerts, monthsClosed, activeLocks] =
      await Promise.all([
        safeCount("attendance_approvals", (q) => q.eq("status", "pending")),
        safeCount("attendance_approvals", (q) => q.eq("status", "pending").eq("request_type", "reopen")),
        safeCount("attendance_approvals", (q) => q.eq("status", "pending").eq("request_type", "correction")),
        safeCount("attendance_alerts", (q) => q.eq("status", "open")),
        safeCount("attendance_closings", (q) => q.eq("status", "closed")),
        safeCount("attendance_locks", (q) => q.eq("locked", true)),
      ]);

    return {
      studentsBelow75,
      studentsBelow50,
      staffBelowTarget,
      unapprovedCorrections,
      pendingApprovals,
      pendingReopens,
      openGovernanceTasks: pendingApprovals + openAlerts,
      openAlerts,
      monthsClosed,
      activeLocks,
    };
  }
}

export const complianceService = new ComplianceService();
