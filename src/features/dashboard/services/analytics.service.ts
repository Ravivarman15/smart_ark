import { BaseService, AppError } from "@/shared/services";
import { today } from "../utils/dates";
import type {
  DashboardAnalytics,
  AttendanceAnalytics,
  PendingApprovalsSummary,
  EnquiryAnalytics,
} from "../types/dashboard.types";

// Dashboard analytics service — reads-only aggregations across multiple
// domains. Lives in the dashboard feature (not students/staff/etc.) because
// every metric here is cross-cutting and exists *only* to feed the dashboard.
//
// Strategy: prefer `count` head queries (Postgres COUNT is cheap and
// supabase-js supports `head: true` to skip the row payload). Falls back to
// `select(id)` + `.length` only where filtering on derived state.
class AnalyticsService extends BaseService {
  /**
   * High-level dashboard KPIs. Single call, single network round-trip per
   * domain. Anything that's expensive (income series, etc.) lives in
   * financeAnalyticsService instead — keep this one snappy.
   */
  async dashboard(): Promise<DashboardAnalytics> {
    const t = today();

    const [
      totalStudentsRes,
      activeStudentsRes,
      todayEnquiriesRes,
      attendanceTodayRes,
      enquiryCountRes,
      convertedRes,
    ] = await Promise.all([
      this.db.from("students").select("id", { count: "exact", head: true }),
      this.db
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .eq("date", t),
      this.db
        .from("teacher_attendance")
        .select("teacher_id, status, check_in_time")
        .eq("date", t),
      this.db.from("admission_calls").select("id", { count: "exact", head: true }),
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .eq("status", "converted"),
    ]);

    if (totalStudentsRes.error) throw AppError.fromSupabase(totalStudentsRes.error, "students");
    if (activeStudentsRes.error) throw AppError.fromSupabase(activeStudentsRes.error, "students");
    if (todayEnquiriesRes.error) throw AppError.fromSupabase(todayEnquiriesRes.error, "admission_calls");
    if (attendanceTodayRes.error) throw AppError.fromSupabase(attendanceTodayRes.error, "teacher_attendance");
    if (enquiryCountRes.error) throw AppError.fromSupabase(enquiryCountRes.error, "admission_calls");
    if (convertedRes.error) throw AppError.fromSupabase(convertedRes.error, "admission_calls");

    const totalStaffRes = await this.db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("role", "student");
    if (totalStaffRes.error) throw AppError.fromSupabase(totalStaffRes.error, "profiles");

    const totalStaff = totalStaffRes.count ?? 0;
    const attendanceRows = attendanceTodayRes.data ?? [];
    const checkedIn = attendanceRows.filter((r) => !!r.check_in_time).length;
    const absent = Math.max(0, totalStaff - checkedIn);
    const attendancePct = totalStaff > 0 ? Math.round((checkedIn / totalStaff) * 100) : 0;

    const totalEnquiries = enquiryCountRes.count ?? 0;
    const converted = convertedRes.count ?? 0;
    const conversionPct = totalEnquiries > 0 ? Math.round((converted / totalEnquiries) * 100) : 0;

    return {
      totalStudents: totalStudentsRes.count ?? 0,
      activeStudents: activeStudentsRes.count ?? 0,
      todayEnquiries: todayEnquiriesRes.count ?? 0,
      todayAbsentStaff: absent,
      enquiryConversionPct: conversionPct,
      attendancePct,
    };
  }

  async attendance(): Promise<AttendanceAnalytics> {
    const t = today();

    const [staffRes, attRes] = await Promise.all([
      this.db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("role", "student"),
      this.db
        .from("teacher_attendance")
        .select("teacher_id, status, check_in_time")
        .eq("date", t),
    ]);
    if (staffRes.error) throw AppError.fromSupabase(staffRes.error, "profiles");
    if (attRes.error) throw AppError.fromSupabase(attRes.error, "teacher_attendance");

    const totalStaff = staffRes.count ?? 0;
    const rows = attRes.data ?? [];
    const present = rows.filter((r) => !!r.check_in_time).length;
    const pending = rows.filter((r) => !!r.check_in_time && !r.status).length;
    const absent = Math.max(0, totalStaff - present);
    const attendancePct = totalStaff > 0 ? Math.round((present / totalStaff) * 100) : 0;

    return {
      presentToday: present,
      absentToday: absent,
      pendingApproval: pending,
      attendancePct,
    };
  }

  async pendingApprovals(): Promise<PendingApprovalsSummary> {
    const t = today();

    const [admissionsRes, leavesRes, checkInRes, checkOutRes, overrideRes] = await Promise.all([
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .eq("status", "interested"),
      this.db
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      this.db
        .from("teacher_attendance")
        .select("teacher_id, status, check_in_time")
        .eq("date", t),
      this.db
        .from("teacher_attendance")
        .select("teacher_id, check_out_status, check_out_time")
        .eq("date", t),
      this.db
        .from("override_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    if (admissionsRes.error) throw AppError.fromSupabase(admissionsRes.error, "admission_calls");
    if (leavesRes.error) throw AppError.fromSupabase(leavesRes.error, "leave_requests");
    if (checkInRes.error) throw AppError.fromSupabase(checkInRes.error, "teacher_attendance");
    if (checkOutRes.error) throw AppError.fromSupabase(checkOutRes.error, "teacher_attendance");

    const pendingCheckIns =
      (checkInRes.data ?? []).filter((r) => !!r.check_in_time && !r.status).length;
    const pendingCheckOuts =
      (checkOutRes.data ?? []).filter((r) => !!r.check_out_time && !r.check_out_status).length;

    const pendingAdmissions = admissionsRes.count ?? 0;
    const pendingLeaves = leavesRes.count ?? 0;
    // override_requests may not exist on every DB — treat error as "0".
    const pendingOverrides = overrideRes.error ? 0 : overrideRes.count ?? 0;

    return {
      pendingAdmissions,
      pendingLeaves,
      pendingCheckIns,
      pendingCheckOuts,
      pendingOverrides,
      total:
        pendingAdmissions + pendingLeaves + pendingCheckIns + pendingCheckOuts + pendingOverrides,
    };
  }

  async enquiries(): Promise<EnquiryAnalytics> {
    const t = today();
    const weekAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString().split("T")[0];
    })();
    const monthAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split("T")[0];
    })();

    const [todayRes, weekRes, monthRes, statusRes, totalRes, convertedRes] = await Promise.all([
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .eq("date", t),
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .gte("date", weekAgo),
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .gte("date", monthAgo),
      this.db.from("admission_calls").select("status"),
      this.db.from("admission_calls").select("id", { count: "exact", head: true }),
      this.db
        .from("admission_calls")
        .select("id", { count: "exact", head: true })
        .eq("status", "converted"),
    ]);

    if (todayRes.error) throw AppError.fromSupabase(todayRes.error, "admission_calls");
    if (weekRes.error) throw AppError.fromSupabase(weekRes.error, "admission_calls");
    if (monthRes.error) throw AppError.fromSupabase(monthRes.error, "admission_calls");
    if (statusRes.error) throw AppError.fromSupabase(statusRes.error, "admission_calls");

    const counts = new Map<string, number>();
    for (const r of statusRes.data ?? []) {
      const s = (r.status as string) ?? "unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const byStatus = Array.from(counts.entries()).map(([status, count]) => ({ status, count }));

    const total = totalRes.count ?? 0;
    const converted = convertedRes.count ?? 0;
    const conversionPct = total > 0 ? Math.round((converted / total) * 100) : 0;

    return {
      todayEnquiries: todayRes.count ?? 0,
      weekEnquiries: weekRes.count ?? 0,
      monthEnquiries: monthRes.count ?? 0,
      conversionPct,
      byStatus,
    };
  }
}

export const analyticsService = new AnalyticsService();
