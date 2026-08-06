import { BaseService, AppError } from "@/shared/services";
import { governanceAuditService } from "../../governance/services";
import type { AttendanceMarker } from "../../types/attendance.types";
import type { RiskLevel } from "../../analytics/types/analytics.types";
import type {
  AlertCategory,
  AlertChannels,
  AlertInput,
  AlertSeverity,
  AlertStatus,
  AlertType,
  AttendanceAlert,
} from "../types/automation.types";

const isMissing = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || m.includes("relation");
};

const COLS =
  "id, alert_type, category, severity, subject_id, subject_name, batch_id, batch_name, " +
  "title, message, metric_value, threshold, risk_score, risk_level, status, channels, " +
  "dedupe_key, notified_at, created_at";

const toAlert = (r: Record<string, unknown>): AttendanceAlert => ({
  id: String(r.id),
  alertType: (r.alert_type as AlertType) ?? "defaulter_75",
  category: (r.category as AlertCategory) ?? "student",
  severity: (r.severity as AlertSeverity) ?? "medium",
  subjectId: (r.subject_id as string) ?? undefined,
  subjectName: (r.subject_name as string) ?? undefined,
  batchId: (r.batch_id as string) ?? undefined,
  batchName: (r.batch_name as string) ?? undefined,
  title: String(r.title ?? ""),
  message: (r.message as string) ?? undefined,
  metricValue: r.metric_value != null ? Number(r.metric_value) : undefined,
  threshold: r.threshold != null ? Number(r.threshold) : undefined,
  riskScore: r.risk_score != null ? Number(r.risk_score) : undefined,
  riskLevel: (r.risk_level as RiskLevel) ?? undefined,
  status: (r.status as AlertStatus) ?? "open",
  channels: (r.channels as AlertChannels) ?? {},
  dedupeKey: String(r.dedupe_key ?? ""),
  notifiedAt: (r.notified_at as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
});

/**
 * Attendance alerts store. Scans `insert` deduped rows (existing keys are left
 * untouched so resolved/dismissed alerts never reopen). Notification + status
 * changes are audited. Degrades to empty/no-op when Phase-5 tables are absent.
 */
class AlertsService extends BaseService {
  private table() {
    return this.db.from("attendance_alerts" as never);
  }

  async list(filters: { category?: AlertCategory | "all"; status?: AlertStatus | "all"; limit?: number } = {}): Promise<AttendanceAlert[]> {
    let q = this.table().select(COLS).order("created_at", { ascending: false }).limit(filters.limit ?? 500);
    if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    const res = await q;
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "attendance_alerts");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(toAlert);
  }

  /** Insert new deduped alerts; existing dedupe keys are ignored. Returns inserted count. */
  async upsertMany(inputs: AlertInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const rows = inputs.map((a) => ({
      alert_type: a.alertType,
      category: a.category,
      severity: a.severity,
      subject_id: a.subjectId ?? null,
      subject_name: a.subjectName ?? null,
      batch_id: a.batchId ?? null,
      batch_name: a.batchName ?? null,
      title: a.title,
      message: a.message ?? null,
      metric_value: a.metricValue ?? null,
      threshold: a.threshold ?? null,
      risk_score: a.riskScore ?? null,
      risk_level: a.riskLevel ?? null,
      status: "open",
      channels: { in_app: true },
      dedupe_key: a.dedupeKey,
    }));
    const res = await this.table()
      .upsert(rows as never, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (res.error) {
      if (isMissing(res.error)) return 0;
      throw AppError.fromSupabase(res.error, "attendance_alerts.upsertMany");
    }
    return ((res.data ?? []) as unknown[]).length;
  }

  async setStatus(id: string, status: AlertStatus, marker?: AttendanceMarker): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === "notified") patch.notified_at = new Date().toISOString();
    if (status === "resolved") {
      patch.resolved_by = marker?.profileId ?? null;
      patch.resolved_at = new Date().toISOString();
    }
    const res = await this.table().update(patch as never).eq("id", id);
    if (res.error && !isMissing(res.error)) throw AppError.fromSupabase(res.error, "attendance_alerts.setStatus");
    await governanceAuditService.log(
      { entityType: "alert", entityId: id, action: status === "notified" ? "notified" : status === "resolved" ? "resolved" : "dismissed", summary: `Alert ${status}` },
      marker,
    );
  }

  /** Flag a set of alerts as notified after a WhatsApp dispatch. */
  async markNotified(ids: string[], channel: keyof AlertChannels = "whatsapp"): Promise<void> {
    if (ids.length === 0) return;
    const res = await this.table()
      .update({ status: "notified", notified_at: new Date().toISOString(), channels: { in_app: true, [channel]: true } } as never)
      .in("id", ids);
    if (res.error && !isMissing(res.error)) throw AppError.fromSupabase(res.error, "attendance_alerts.markNotified");
  }
}

export const alertsService = new AlertsService();
