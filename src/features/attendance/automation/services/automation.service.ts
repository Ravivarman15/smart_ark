import { BaseService, AppError } from "@/shared/services";
import { aisensyService } from "@/features/communication/services/aisensy.service";
import { studentAnalyticsService } from "../../analytics/services/studentAnalytics.service";
import { staffAnalyticsService } from "../../analytics/services/staffAnalytics.service";
import { staffAttendanceService } from "../../services/staffAttendance.service";
import { today, monthStart } from "../../utils/dates";
import type { AttendanceMarker } from "../../types/attendance.types";
import { alertsService } from "./alerts.service";
import { renderAlert } from "../utils/alertTemplates";
import {
  buildStaffAlerts,
  buildStudentAlerts,
  staffDedupe,
} from "../utils/scan";
import type { AlertInput, AttendanceAlert, AutomationRun, JobType, ScanSummary } from "../types/automation.types";

const isMissing = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || m.includes("relation");
};

const toRun = (r: Record<string, unknown>): AutomationRun => ({
  id: String(r.id),
  jobType: String(r.job_type ?? ""),
  status: (r.status as AutomationRun["status"]) ?? "success",
  scanned: Number(r.scanned ?? 0),
  createdAlerts: Number(r.created_alerts ?? 0),
  notified: Number(r.notified ?? 0),
  message: (r.message as string) ?? undefined,
  startedAt: String(r.started_at ?? ""),
  finishedAt: (r.finished_at as string) ?? undefined,
  runByName: (r.run_by_name as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

/**
 * Automation Center orchestrator. Runs live-data scans (defaulters, streaks,
 * staff late / low / early-exit, missing check-outs), writes deduped alerts and
 * logs each run. All scans operate on the current month-to-date and reuse the
 * Phase-3 analytics services — no dummy data. Migration-safe throughout.
 */
class AutomationService extends BaseService {
  private period(): { from: string; to: string; key: string } {
    const td = today();
    return { from: monthStart(td), to: td, key: td.slice(0, 7) };
  }

  private async logRun(
    jobType: JobType,
    startedAt: string,
    summary: { scanned: number; created: number; notified?: number; status?: AutomationRun["status"]; message: string },
    marker?: AttendanceMarker,
  ): Promise<void> {
    try {
      await this.db.from("attendance_automation_runs" as never).insert({
        job_type: jobType,
        status: summary.status ?? "success",
        scanned: summary.scanned,
        created_alerts: summary.created,
        notified: summary.notified ?? 0,
        message: summary.message,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        run_by: marker?.profileId ?? null,
        run_by_name: marker?.name ?? null,
      } as never);
    } catch {
      /* run log is best-effort */
    }
  }

  /** Student defaulter + consecutive-absence scan (one pass over analytics). */
  async runStudentScan(marker?: AttendanceMarker): Promise<ScanSummary> {
    const startedAt = new Date().toISOString();
    const { from, to, key } = this.period();
    const analytics = await studentAnalyticsService.analyze({ from, to });
    const alerts = buildStudentAlerts(analytics.defaulters, key);
    const created = await alertsService.upsertMany(alerts);
    const message = `${analytics.defaulters.length} defaulter(s) scanned · ${created} new alert(s)`;
    await this.logRun("defaulter_scan", startedAt, { scanned: analytics.defaulters.length, created, message }, marker);
    return { jobType: "defaulter_scan", scanned: analytics.defaulters.length, created, message };
  }

  /** Staff late / low-attendance / early-exit scan. */
  async runStaffScan(marker?: AttendanceMarker, thresholds = { minPct: 75, maxLate: 3, maxEarlyExit: 3 }): Promise<ScanSummary> {
    const startedAt = new Date().toISOString();
    const { from, to, key } = this.period();
    const analytics = await staffAnalyticsService.analyze({ from, to });
    const alerts = buildStaffAlerts(analytics.performance, thresholds, key);
    const created = await alertsService.upsertMany(alerts);
    const message = `${analytics.performance.length} staff scanned · ${created} new alert(s)`;
    await this.logRun("late_scan", startedAt, { scanned: analytics.performance.length, created, message }, marker);
    return { jobType: "late_scan", scanned: analytics.performance.length, created, message };
  }

  /** Missing check-out scan — staff with an in-time but no out-time today. */
  async runMissingCheckoutScan(marker?: AttendanceMarker): Promise<ScanSummary> {
    const startedAt = new Date().toISOString();
    const td = today();
    let records: { staffId: string; staffName?: string; inTime?: string; outTime?: string }[] = [];
    try {
      records = await staffAttendanceService.getDay(td);
    } catch {
      records = [];
    }
    const missing = records.filter((r) => r.inTime && !r.outTime);
    const alerts: AlertInput[] = missing.map((r) => ({
      alertType: "staff_missing_checkout",
      category: "staff",
      severity: "medium",
      subjectId: r.staffId,
      subjectName: r.staffName,
      title: `${r.staffName ?? "Staff"} has not checked out`,
      message: `Checked in but no check-out recorded for ${td}.`,
      dedupeKey: staffDedupe(r.staffId, "staff_missing_checkout", td),
    }));
    const created = await alertsService.upsertMany(alerts);
    const message = `${records.length} staff scanned · ${created} missing check-out(s)`;
    await this.logRun("missing_checkout_scan", startedAt, { scanned: records.length, created, message }, marker);
    return { jobType: "missing_checkout_scan", scanned: records.length, created, message };
  }

  /** Run every scan in sequence (the daily "compliance scan"). */
  async runAll(marker?: AttendanceMarker): Promise<ScanSummary[]> {
    const out: ScanSummary[] = [];
    for (const fn of [
      () => this.runStudentScan(marker),
      () => this.runStaffScan(marker),
      () => this.runMissingCheckoutScan(marker),
    ]) {
      try {
        out.push(await fn());
      } catch (e) {
        out.push({ jobType: "compliance_scan", scanned: 0, created: 0, message: (e as Error).message });
      }
    }
    return out;
  }

  /** Enqueue WhatsApp messages for the given alerts, then flag them notified. */
  async notify(alerts: AttendanceAlert[], opts: { branchName?: string } = {}, marker?: AttendanceMarker): Promise<{ queued: number; skipped: number }> {
    const sendable = alerts.filter((a) => a.category === "student" && a.subjectId);
    if (sendable.length === 0) return { queued: 0, skipped: 0 };
    const inputs = sendable.map((a) => ({
      rendered: renderAlert(a, opts),
      contextType: "attendance_alert",
      contextId: a.id,
      recipient: { kind: "guardian" as const, name: a.subjectName, studentId: a.subjectId },
      createdBy: marker?.profileId,
    }));
    const res = await aisensyService.enqueueBulk(inputs);
    if (res.queued > 0) {
      await alertsService.markNotified(sendable.map((a) => a.id), "whatsapp");
    }
    return { queued: res.queued, skipped: res.skipped };
  }

  async listRuns(limit = 50): Promise<AutomationRun[]> {
    const res = await this.db
      .from("attendance_automation_runs" as never)
      .select("id, job_type, status, scanned, created_alerts, notified, message, started_at, finished_at, run_by_name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_automation_runs");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toRun);
  }
}

export const automationService = new AutomationService();
