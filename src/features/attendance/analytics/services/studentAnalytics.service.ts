import { BaseService, AppError } from "@/shared/services";
import { today, monthStart } from "../../utils/dates";
import {
  buildDefaulters,
  consecutiveBuckets,
  dailyPctDays,
  dailyTrend,
  groupComparison,
  monthlyTrend,
  mostImproved,
  pct,
  rollupStudents,
  topAttendance,
  type RosterEntry,
  type StudentAttRow,
} from "../utils/aggregate";
import type {
  HeatCell,
  StudentAnalytics,
  StudentAnalyticsFilters,
  StudentKpis,
} from "../types/analytics.types";
import type { StudentAttendanceStatus } from "../../types/attendance.types";

const PRESENTISH = ["present", "late", "half_day"];

const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || (m.includes("could not find") && m.includes("column"));
};

const yearStart = (d: string) => `${d.slice(0, 4)}-01-01`;

interface Scope {
  batchIds: string[];
  batchName: Map<string, string>;
  batchStandard: Map<string, string | undefined>;
  standardName: Map<string, string>;
}

/**
 * Student attendance analytics. One bounded fetch of the filtered range rows
 * powers every derived view (trends / defaulters / comparisons / heatmap /
 * leaderboards); KPI month/year percentages use cheap head-count queries so we
 * never transfer a year of rows. All math lives in ../utils/aggregate (pure),
 * so the Reports module can reuse it. Migration-safe: attendance_date falls
 * back to the legacy `date` column.
 */
class StudentAnalyticsService extends BaseService {
  private async resolveScope(filters: StudentAnalyticsFilters): Promise<Scope> {
    // Batches carry standard/course-type/year ids → resolve the filter set to
    // a batch-id list, then everything keys off batch membership.
    const bRes = await this.db
      .from("batches")
      .select("id, name, standard_id, course_type_id, academic_year_id");
    const batches = (bRes.error ? [] : (bRes.data ?? [])) as Record<string, unknown>[];
    const sRes = await this.db.from("standards").select("id, name");
    const standardName = new Map<string, string>(
      ((sRes.error ? [] : sRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
    );

    const batchName = new Map<string, string>();
    const batchStandard = new Map<string, string | undefined>();
    const batchIds: string[] = [];
    for (const b of batches) {
      const id = String(b.id);
      if (filters.batchId && id !== filters.batchId) continue;
      if (filters.standardId && b.standard_id !== filters.standardId) continue;
      if (filters.courseTypeId && b.course_type_id !== filters.courseTypeId) continue;
      if (filters.academicYearId && b.academic_year_id !== filters.academicYearId) continue;
      batchIds.push(id);
      batchName.set(id, String(b.name));
      batchStandard.set(id, (b.standard_id as string) ?? undefined);
    }
    return { batchIds, batchName, batchStandard, standardName };
  }

  private async fetchRows(studentIds: string[], roster: Map<string, RosterEntry>, from: string, to: string): Promise<StudentAttRow[]> {
    if (studentIds.length === 0) return [];
    const run = (col: "attendance_date" | "date") =>
      this.db
        .from("student_attendance")
        .select(`student_id, batch_id, status, ${col}`)
        .gte(col, from)
        .lte(col, to)
        .in("student_id", studentIds)
        .limit(50000);
    let res = await run("attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await run("date");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => {
      const studentId = String(r.student_id);
      return {
        studentId,
        batchId: (r.batch_id as string) ?? roster.get(studentId)?.batchId,
        date: String(r.attendance_date ?? r.date ?? ""),
        status: r.status as StudentAttendanceStatus,
      };
    });
  }

  private async countPct(studentIds: string[], from: string, to: string): Promise<number> {
    if (studentIds.length === 0) return 0;
    const count = async (refine: (q: any) => any): Promise<number> => {
      const run = (col: "attendance_date" | "date") => {
        let q = this.db
          .from("student_attendance")
          .select("id", { count: "exact", head: true })
          .gte(col, from)
          .lte(col, to)
          .in("student_id", studentIds);
        q = refine(q);
        return q;
      };
      let res = await run("attendance_date");
      if (res.error && isSchemaCacheMiss(res.error)) res = await run("date");
      return res.count ?? 0;
    };
    const den = await count((q) => q.not("status", "eq", "holiday"));
    const num = await count((q) => q.in("status", PRESENTISH));
    return pct(num, den);
  }

  async analyze(filters: StudentAnalyticsFilters): Promise<StudentAnalytics> {
    const scope = await this.resolveScope(filters);
    const td = today();

    // Roster (filtered to scope batches).
    const roster = new Map<string, RosterEntry>();
    if (scope.batchIds.length > 0) {
      const studRes = await this.db
        .from("students")
        .select("id, name, roll_number, batch_id")
        .eq("is_active", true)
        .in("batch_id", scope.batchIds);
      for (const s of (studRes.data ?? []) as Record<string, unknown>[]) {
        const batchId = (s.batch_id as string) ?? undefined;
        const standardId = batchId ? scope.batchStandard.get(batchId) : undefined;
        roster.set(String(s.id), {
          id: String(s.id),
          name: String(s.name),
          rollNumber: (s.roll_number as string) ?? undefined,
          batchId,
          batchName: batchId ? scope.batchName.get(batchId) : undefined,
          standardId,
          standardName: standardId ? scope.standardName.get(standardId) : undefined,
        });
      }
    }

    const studentIds = Array.from(roster.keys());
    const rangeRows = await this.fetchRows(studentIds, roster, filters.from, filters.to);
    const todayRows =
      td >= filters.from && td <= filters.to
        ? rangeRows.filter((r) => r.date === td)
        : await this.fetchRows(studentIds, roster, td, td);

    // KPIs
    const todayCount = (s: StudentAttendanceStatus) => todayRows.filter((r) => r.status === s).length;
    const [monthPct, yearPct] = await Promise.all([
      this.countPct(studentIds, monthStart(td), td),
      this.countPct(studentIds, yearStart(td), td),
    ]);
    const agg = rollupStudents(rangeRows);
    let rangeNum = 0;
    let rangeDen = 0;
    for (const a of agg.values()) {
      rangeNum += a.present;
      rangeDen += a.total;
    }
    const kpis: StudentKpis = {
      totalStudents: roster.size,
      presentToday: todayCount("present"),
      absentToday: todayCount("absent"),
      lateToday: todayCount("late"),
      medicalToday: todayCount("medical_leave"),
      excusedToday: todayCount("excused"),
      halfDayToday: todayCount("half_day"),
      rangePct: pct(rangeNum, rangeDen),
      monthPct,
      yearPct,
    };

    const defaulters = buildDefaulters(agg, roster);

    // Heatmap (institute / scope per-day present %) → HeatCell calendar.
    const heatDays = dailyPctDays(rangeRows, filters.from, filters.to);
    const heatmap: HeatCell[] = heatDays.map((d) => {
      const date = new Date(`${d.date}T00:00:00`);
      const week = `W${Math.ceil((date.getDate() + ((new Date(`${d.date.slice(0, 7)}-01T00:00:00`).getDay() + 6) % 7)) / 7)}`;
      const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(date.getDay() + 6) % 7];
      return {
        row: week,
        col: weekday,
        value: d.pct,
        date: d.date,
        status: !d.hasData ? "none" : d.pct >= 90 ? "present" : d.pct >= 75 ? "late" : "absent",
      };
    });

    return {
      kpis,
      dailyTrend: dailyTrend(rangeRows),
      monthlyTrend: monthlyTrend(rangeRows),
      defaulters,
      consecutiveBuckets: consecutiveBuckets(defaulters),
      topAttendance: topAttendance(agg, roster),
      mostImproved: mostImproved(agg, roster),
      batchComparison: groupComparison(rangeRows, (r) => r.batchId, (id) => scope.batchName.get(id) ?? "Batch"),
      standardComparison: groupComparison(
        rangeRows,
        (r) => (r.batchId ? scope.batchStandard.get(r.batchId) : undefined),
        (id) => scope.standardName.get(id) ?? "Standard",
      ),
      heatmap,
    };
  }
}

export const studentAnalyticsService = new StudentAnalyticsService();
