import { BaseService } from "@/shared/services";
import { staffAttendanceService } from "../../services";
import { today } from "../../utils/dates";
import {
  staffAttendancePct,
  staffMonthlySeries,
  staffPerformance,
} from "../utils/aggregate";
import type {
  StaffAnalytics,
  StaffAnalyticsRange,
  StaffKpis,
  StaffPerfRow,
  StaffRankingEntry,
  StaffWorkHours,
} from "../types/analytics.types";
import type { StaffAttendanceRecord } from "../../types/attendance.types";

/**
 * Staff attendance + work-hours analytics. Reuses staffAttendanceService for
 * the range fetch (single round-trip) and the pure aggregate utils for every
 * derived metric — so the numbers match the staff register exactly and the
 * Reports module can reuse them.
 */
class StaffAnalyticsService extends BaseService {
  async analyze(range: StaffAnalyticsRange): Promise<StaffAnalytics> {
    const td = today();
    const records = await staffAttendanceService.range(range.from, range.to, range.staffId);
    const todayRecords =
      td >= range.from && td <= range.to
        ? records.filter((r) => r.date === td)
        : await staffAttendanceService.getDay(td);

    const totalRes = await this.db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    const totalStaff = totalRes.count ?? 0;

    const count = (recs: StaffAttendanceRecord[], s: string) => recs.filter((r) => r.status === s).length;
    const avgWorked =
      todayRecords.length > 0
        ? Math.round(todayRecords.reduce((a, r) => a + r.workedMinutes, 0) / todayRecords.length)
        : 0;

    const kpis: StaffKpis = {
      totalStaff,
      presentToday: count(todayRecords, "present"),
      absentToday: count(todayRecords, "absent"),
      lateToday: count(todayRecords, "late"),
      leaveToday: count(todayRecords, "leave"),
      avgWorkedMinutes: avgWorked,
      attendancePct: staffAttendancePct(records),
    };

    let expected = 0;
    let worked = 0;
    let overtime = 0;
    for (const r of records) {
      expected += r.expectedMinutes;
      worked += r.workedMinutes;
      overtime += r.overtimeMinutes;
    }
    const workHours: StaffWorkHours = {
      expectedMinutes: expected,
      workedMinutes: worked,
      remainingMinutes: Math.max(expected - worked, 0),
      overtimeMinutes: overtime,
    };

    const perf = staffPerformance(records);
    const performance: StaffPerfRow[] = perf.map((p) => ({
      staffId: p.staffId,
      staffName: p.staffName,
      role: p.role,
      attendancePct: p.attendancePct,
      lateCount: p.lateCount,
      earlyExitCount: p.earlyExitCount,
      overtimeMinutes: p.overtimeMinutes,
      avgWorkedMinutes: p.avgWorkedMinutes,
      days: p.days,
    }));

    const rank = (
      arr: typeof perf,
      sortVal: (p: (typeof perf)[number]) => number,
      asc: boolean,
      mapVal: (p: (typeof perf)[number]) => number,
      unit?: string,
    ): StaffRankingEntry[] =>
      [...arr]
        .sort((a, b) => (asc ? sortVal(a) - sortVal(b) : sortVal(b) - sortVal(a)))
        .slice(0, 10)
        .map((p) => ({ staffId: p.staffId, staffName: p.staffName, value: mapVal(p), unit }));

    return {
      kpis,
      workHours,
      performance,
      bestAttendance: rank(perf, (p) => p.attendancePct, false, (p) => p.attendancePct, "%"),
      mostPunctual: rank(
        perf.filter((p) => p.days > 0),
        (p) => p.lateCount,
        true,
        (p) => p.lateCount,
        "late",
      ),
      highestHours: rank(perf, (p) => p.avgWorkedMinutes * p.days, false, (p) => p.avgWorkedMinutes * p.days, "min"),
      mostImproved: rank(
        perf,
        (p) => p.secondHalfPct - p.firstHalfPct,
        false,
        (p) => p.secondHalfPct - p.firstHalfPct,
        "%",
      ).filter((e) => e.value > 0),
      lateTrend: staffMonthlySeries(records, (recs) => recs.filter((r) => r.status === "late" || r.lateMinutes > 0).length),
      overtimeTrend: staffMonthlySeries(records, (recs) => Math.round(recs.reduce((a, r) => a + r.overtimeMinutes, 0) / 60)),
    };
  }
}

export const staffAnalyticsService = new StaffAnalyticsService();
