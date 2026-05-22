import { BaseService } from "@/shared/services";
import { daysAgo, today } from "../utils/dates";
import type {
  DashboardAnalytics,
  AttendanceAnalytics,
  PendingApprovalsSummary,
  EnquiryAnalytics,
} from "../types/dashboard.types";

// Dashboard analytics service — read-only aggregations across multiple
// domains. Lives in the dashboard feature (not students/staff/etc.) because
// every metric here is cross-cutting and exists *only* to feed the dashboard.
//
// Resilience: the dashboard must never hard-fail. Each source query degrades
// independently — a missing table / column / RLS denial yields 0 (or an empty
// list) for that one metric instead of throwing and blanking the whole panel.
// Several feature migrations are environment-dependent (see the
// pending-migrations note), so partial data is expected and acceptable.

/** Count from a `head: true` query; any error degrades to 0. */
const okCount = (
  res: { count: number | null; error: unknown },
  label: string,
): number => {
  if (res.error) {
    console.warn(`[dashboard] ${label} count unavailable:`, res.error);
    return 0;
  }
  return res.count ?? 0;
};

/** Rows from a select query; any error degrades to an empty list. */
const okRows = <T>(
  res: { data: T[] | null; error: unknown },
  label: string,
): T[] => {
  if (res.error) {
    console.warn(`[dashboard] ${label} unavailable:`, res.error);
    return [];
  }
  return res.data ?? [];
};

class AnalyticsService extends BaseService {
  /**
   * High-level dashboard KPIs. Single call, single network round-trip per
   * domain. Anything expensive (income series, etc.) lives in
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
      totalStaffRes,
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
      // `profiles` holds staff only — students live in the `students` table.
      // Count every row; do NOT filter by role: the `app_role` enum has no
      // 'student' member, so `.neq("role","student")` errors at the DB.
      this.db.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const totalStaff = okCount(totalStaffRes, "staff");
    const attendanceRows = okRows(attendanceTodayRes, "teacher_attendance");
    const checkedIn = attendanceRows.filter((r) => !!r.check_in_time).length;
    const absent = Math.max(0, totalStaff - checkedIn);
    const attendancePct =
      totalStaff > 0 ? Math.round((checkedIn / totalStaff) * 100) : 0;

    const totalEnquiries = okCount(enquiryCountRes, "enquiries");
    const converted = okCount(convertedRes, "converted enquiries");
    const conversionPct =
      totalEnquiries > 0 ? Math.round((converted / totalEnquiries) * 100) : 0;

    return {
      totalStudents: okCount(totalStudentsRes, "students"),
      activeStudents: okCount(activeStudentsRes, "active students"),
      todayEnquiries: okCount(todayEnquiriesRes, "today enquiries"),
      todayAbsentStaff: absent,
      enquiryConversionPct: conversionPct,
      attendancePct,
    };
  }

  async attendance(): Promise<AttendanceAnalytics> {
    const t = today();

    const [staffRes, attRes] = await Promise.all([
      // Staff headcount — every `profiles` row (see note in dashboard()).
      this.db.from("profiles").select("id", { count: "exact", head: true }),
      this.db
        .from("teacher_attendance")
        .select("teacher_id, status, check_in_time")
        .eq("date", t),
    ]);

    const totalStaff = okCount(staffRes, "staff");
    const rows = okRows(attRes, "teacher_attendance");
    const present = rows.filter((r) => !!r.check_in_time).length;
    const pending = rows.filter((r) => !!r.check_in_time && !r.status).length;
    const absent = Math.max(0, totalStaff - present);
    const attendancePct =
      totalStaff > 0 ? Math.round((present / totalStaff) * 100) : 0;

    return {
      presentToday: present,
      absentToday: absent,
      pendingApproval: pending,
      attendancePct,
    };
  }

  async pendingApprovals(): Promise<PendingApprovalsSummary> {
    const t = today();

    const [admissionsRes, leavesRes, checkInRes, checkOutRes, overrideRes] =
      await Promise.all([
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

    const pendingCheckIns = okRows(checkInRes, "check-ins").filter(
      (r) => !!r.check_in_time && !r.status,
    ).length;
    const pendingCheckOuts = okRows(checkOutRes, "check-outs").filter(
      (r) => !!r.check_out_time && !r.check_out_status,
    ).length;

    const pendingAdmissions = okCount(admissionsRes, "admissions");
    const pendingLeaves = okCount(leavesRes, "leave requests");
    const pendingOverrides = okCount(overrideRes, "override requests");

    return {
      pendingAdmissions,
      pendingLeaves,
      pendingCheckIns,
      pendingCheckOuts,
      pendingOverrides,
      total:
        pendingAdmissions +
        pendingLeaves +
        pendingCheckIns +
        pendingCheckOuts +
        pendingOverrides,
    };
  }

  async enquiries(): Promise<EnquiryAnalytics> {
    const t = today();
    const weekAgo = daysAgo(7);
    const monthAgo = daysAgo(30);

    const [todayRes, weekRes, monthRes, statusRes, totalRes, convertedRes] =
      await Promise.all([
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

    const counts = new Map<string, number>();
    for (const r of okRows(statusRes, "enquiry statuses")) {
      const s = (r.status as string) ?? "unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const byStatus = Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    const total = okCount(totalRes, "enquiries");
    const converted = okCount(convertedRes, "converted enquiries");
    const conversionPct = total > 0 ? Math.round((converted / total) * 100) : 0;

    return {
      todayEnquiries: okCount(todayRes, "today enquiries"),
      weekEnquiries: okCount(weekRes, "week enquiries"),
      monthEnquiries: okCount(monthRes, "month enquiries"),
      conversionPct,
      byStatus,
    };
  }
}

export const analyticsService = new AnalyticsService();
