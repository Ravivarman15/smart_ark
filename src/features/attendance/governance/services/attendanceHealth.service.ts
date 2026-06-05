// ──────────────────────────────────────────────────────────────────────────────
// Attendance Health service
//
// A focused, attendance-only production-readiness probe (companion to the global
// System Health page). It answers "is the attendance module wired up and
// behaving?" — checking the core tables, governance tables (locks / approvals),
// automation (alerts / runs), the settings singleton and realtime readiness, and
// rolls each into a Healthy / Warning / Critical status so issues surface before
// they turn into a debugging session.
//
// Status semantics
//   • critical — a CORE table is missing (attendance can't function) or a probe
//                hard-fails. Apply 20260612_attendance_module.sql.
//   • warning  — a governance / automation table is missing (feature degraded),
//                the settings row is absent, the last automation run failed, or
//                open critical alerts need attention. Often "apply
//                20260613_attendance_governance.sql".
//   • healthy  — table present and behaving.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";

export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";

export interface AttendanceHealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  rowCount?: number;
  /** Migration that introduces the underlying table(s), for the fix hint. */
  migration?: string;
}

export interface AttendanceHealthReport {
  generatedAt: string;
  overall: HealthStatus;
  /** 0–100: healthy=100, warning=50, critical/unknown=0, averaged. */
  score: number;
  checks: AttendanceHealthCheck[];
}

type ProbeResult = { state: "ok" | "missing" | "error"; count: number; message?: string };

const isRelationMissing = (e: { code?: string; message?: string } | null | undefined): boolean => {
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const m = (e.message ?? "").toLowerCase();
  return (
    (m.includes("relation") && m.includes("does not exist")) ||
    (m.includes("could not find") && m.includes("table")) ||
    m.includes("schema cache")
  );
};

class AttendanceHealthService extends BaseService {
  /** Head-count probe — distinguishes present / missing / hard-error. */
  private async probe(table: string): Promise<ProbeResult> {
    try {
      const res = await this.db.from(table as never).select("id", { count: "exact", head: true });
      if (res.error) {
        if (isRelationMissing(res.error)) return { state: "missing", count: 0 };
        return { state: "error", count: 0, message: res.error.message };
      }
      return { state: "ok", count: res.count ?? 0 };
    } catch (e) {
      return { state: "error", count: 0, message: (e as Error).message };
    }
  }

  private async countWhere(table: string, build: (q: any) => any): Promise<number> {
    try {
      const res = await build(this.db.from(table as never).select("id", { count: "exact", head: true }));
      if (res.error) return 0;
      return res.count ?? 0;
    } catch {
      return 0;
    }
  }

  async report(): Promise<AttendanceHealthReport> {
    const checks: AttendanceHealthCheck[] = [];

    // 1. Core attendance tables ────────────────────────────────────────────────
    const [studentAtt, staffAtt, staffAudit] = await Promise.all([
      this.probe("student_attendance"),
      this.probe("staff_attendance"),
      this.probe("staff_attendance_audit"),
    ]);
    const coreMissing = [
      studentAtt.state === "missing" && "student_attendance",
      staffAtt.state === "missing" && "staff_attendance",
      staffAudit.state === "missing" && "staff_attendance_audit",
    ].filter(Boolean) as string[];
    checks.push({
      key: "tables",
      label: "Attendance tables",
      migration: "20260612_attendance_module",
      status: coreMissing.length > 0 ? "critical" : "healthy",
      rowCount: studentAtt.count + staffAtt.count,
      detail:
        coreMissing.length > 0
          ? `Missing: ${coreMissing.join(", ")}. Apply 20260612_attendance_module.sql.`
          : `student_attendance (${studentAtt.count.toLocaleString()}) + staff_attendance (${staffAtt.count.toLocaleString()}) present with audit trail.`,
    });

    // 2. Attendance settings (singleton must have a row) ────────────────────────
    const settings = await this.probe("attendance_settings");
    checks.push({
      key: "settings",
      label: "Attendance settings",
      migration: "20260612_attendance_module",
      status: settings.state === "missing" ? "critical" : settings.count === 0 ? "warning" : "healthy",
      rowCount: settings.count,
      detail:
        settings.state === "missing"
          ? "attendance_settings table missing — work-hours engine uses code defaults. Apply 20260612_attendance_module.sql."
          : settings.count === 0
            ? "No policy row found — the default row was not seeded. Re-run the seed in 20260612_attendance_module.sql."
            : "Institute attendance policy row present (shift times, late threshold, expected hours).",
    });

    // 3. Attendance locks ───────────────────────────────────────────────────────
    const locks = await this.probe("attendance_locks");
    const activeLocks =
      locks.state === "ok" ? await this.countWhere("attendance_locks", (q) => q.eq("locked", true)) : 0;
    checks.push({
      key: "locks",
      label: "Attendance locks",
      migration: "20260613_attendance_governance",
      status: locks.state === "missing" ? "warning" : locks.state === "error" ? "warning" : "healthy",
      rowCount: locks.count,
      detail:
        locks.state === "missing"
          ? "Governance not installed — locking is inactive (all periods writable). Apply 20260613_attendance_governance.sql."
          : `${activeLocks} active lock(s) of ${locks.count} total. Locked periods reject edits/imports/corrections.`,
    });

    // 4. Attendance approvals ───────────────────────────────────────────────────
    const approvals = await this.probe("attendance_approvals");
    const pending =
      approvals.state === "ok" ? await this.countWhere("attendance_approvals", (q) => q.eq("status", "pending")) : 0;
    checks.push({
      key: "approvals",
      label: "Attendance approvals",
      migration: "20260613_attendance_governance",
      status: approvals.state === "missing" ? "warning" : pending >= 20 ? "warning" : "healthy",
      rowCount: approvals.count,
      detail:
        approvals.state === "missing"
          ? "Approval queue table missing — correction/reopen/unlock requests can't be filed. Apply 20260613_attendance_governance.sql."
          : pending >= 20
            ? `${pending} pending requests — backlog building, review the Approval Queue.`
            : `${pending} pending request(s) of ${approvals.count} total.`,
    });

    // 5. Attendance alerts ──────────────────────────────────────────────────────
    const alerts = await this.probe("attendance_alerts");
    const openCritical =
      alerts.state === "ok"
        ? await this.countWhere("attendance_alerts", (q) => q.eq("status", "open").eq("severity", "critical"))
        : 0;
    const openTotal =
      alerts.state === "ok" ? await this.countWhere("attendance_alerts", (q) => q.eq("status", "open")) : 0;
    checks.push({
      key: "alerts",
      label: "Attendance alerts",
      migration: "20260613_attendance_governance",
      status: alerts.state === "missing" ? "warning" : openCritical > 0 ? "warning" : "healthy",
      rowCount: alerts.count,
      detail:
        alerts.state === "missing"
          ? "Alerts table missing — automation scans can't persist. Apply 20260613_attendance_governance.sql."
          : openCritical > 0
            ? `${openCritical} CRITICAL alert(s) open (of ${openTotal} open). Review Student/Staff Alerts.`
            : `${openTotal} open alert(s) of ${alerts.count} total.`,
    });

    // 6. Attendance automation runs ─────────────────────────────────────────────
    const runs = await this.probe("attendance_automation_runs");
    let lastRunStatus: string | null = null;
    if (runs.state === "ok") {
      try {
        const res = await this.db
          .from("attendance_automation_runs" as never)
          .select("status, created_at")
          .order("created_at", { ascending: false })
          .limit(1);
        const row = ((res.data ?? []) as Record<string, unknown>[])[0];
        lastRunStatus = row ? String(row.status ?? "") : null;
      } catch {
        lastRunStatus = null;
      }
    }
    checks.push({
      key: "automation_runs",
      label: "Automation runs",
      migration: "20260613_attendance_governance",
      status:
        runs.state === "missing"
          ? "warning"
          : lastRunStatus === "failed"
            ? "warning"
            : "healthy",
      rowCount: runs.count,
      detail:
        runs.state === "missing"
          ? "Run log table missing — automation history not recorded. Apply 20260613_attendance_governance.sql."
          : runs.count === 0
            ? "No scans run yet — trigger one from the Automation Center."
            : `${runs.count} run(s) logged. Last run: ${lastRunStatus ?? "unknown"}.`,
    });

    // 7. Realtime channel readiness ─────────────────────────────────────────────
    // A channel only propagates changes for tables that exist; we report whether
    // the attendance-module-sync tables are present (publication membership can't
    // be verified from PostgREST directly).
    const govMissing = [locks, approvals, alerts, runs].some((p) => p.state === "missing");
    const realtimeStatus: HealthStatus = coreMissing.length > 0 ? "critical" : govMissing ? "warning" : "healthy";
    checks.push({
      key: "realtime",
      label: "Realtime channels",
      migration: "20260613_attendance_governance",
      status: realtimeStatus,
      detail:
        realtimeStatus === "critical"
          ? "Core tables missing — the attendance-module-sync channel can't propagate changes."
          : realtimeStatus === "warning"
            ? "Some governance/automation tables missing — those changes won't sync live until the migration is applied + added to supabase_realtime."
            : "attendance-module-sync watches all attendance + governance + automation tables; live cross-tab sync ready.",
    });

    // ── Roll-up ────────────────────────────────────────────────────────────────
    const weight = (s: HealthStatus) => (s === "healthy" ? 100 : s === "warning" ? 50 : 0);
    const score = checks.length > 0 ? Math.round(checks.reduce((a, c) => a + weight(c.status), 0) / checks.length) : 0;
    const overall: HealthStatus = checks.some((c) => c.status === "critical")
      ? "critical"
      : checks.some((c) => c.status === "warning")
        ? "warning"
        : "healthy";

    return { generatedAt: new Date().toISOString(), overall, score, checks };
  }
}

export const attendanceHealthService = new AttendanceHealthService();
