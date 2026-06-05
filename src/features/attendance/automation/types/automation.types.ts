// ── Attendance Automation domain types (Phase 5) ────────────────────────────
// The Automation Center: defaulter / streak / staff scans that generate alerts
// from live attendance data, plus the WhatsApp dispatch + run log.

import type { RiskLevel } from "../../analytics/types/analytics.types";

export type AlertCategory = "student" | "staff";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "notified" | "resolved" | "dismissed";

/** All alert kinds the scans can raise. */
export type AlertType =
  | "defaulter_75"
  | "defaulter_60"
  | "defaulter_50"
  | "streak_3"
  | "streak_5"
  | "streak_7"
  | "streak_10"
  | "staff_late"
  | "staff_low"
  | "staff_early_exit"
  | "staff_missing_checkout";

export type JobType =
  | "defaulter_scan"
  | "streak_scan"
  | "missing_checkout_scan"
  | "late_scan"
  | "compliance_scan";

export interface AlertChannels {
  in_app?: boolean;
  whatsapp?: boolean;
  email?: boolean;
}

export interface AttendanceAlert {
  id: string;
  alertType: AlertType | string;
  category: AlertCategory;
  severity: AlertSeverity;
  subjectId?: string;
  subjectName?: string;
  batchId?: string;
  batchName?: string;
  title: string;
  message?: string;
  metricValue?: number;
  threshold?: number;
  riskScore?: number;
  riskLevel?: RiskLevel;
  status: AlertStatus;
  channels: AlertChannels;
  dedupeKey: string;
  notifiedAt?: string;
  createdAt: string;
}

/** Upsert payload produced by the pure scan builders. */
export interface AlertInput {
  alertType: AlertType | string;
  category: AlertCategory;
  severity: AlertSeverity;
  subjectId?: string;
  subjectName?: string;
  batchId?: string;
  batchName?: string;
  title: string;
  message?: string;
  metricValue?: number;
  threshold?: number;
  riskScore?: number;
  riskLevel?: RiskLevel;
  dedupeKey: string;
}

export interface AutomationRun {
  id: string;
  jobType: JobType | string;
  status: "success" | "partial" | "failed";
  scanned: number;
  createdAlerts: number;
  notified: number;
  message?: string;
  startedAt: string;
  finishedAt?: string;
  runByName?: string;
  createdAt: string;
}

export interface ScanSummary {
  jobType: JobType;
  scanned: number;
  created: number;
  message: string;
}
