// Attendance alert → WhatsApp message bridge. Reuses the communication module's
// pure render pipeline (deep import, no barrel — keeps comms pages out of this
// chunk). Four templates per the Phase-5 spec: defaulter, consecutive absence,
// monthly warning, improvement.

import { renderMessage, type RenderedMessage } from "@/features/communication/utils/whatsappTemplates";
import type { AttendanceAlert } from "../types/automation.types";

interface AlertTemplateDef {
  key: string;
  title: string;
  body: string;
}

export const ALERT_TEMPLATES: Record<string, AlertTemplateDef> = {
  attendance_defaulter: {
    key: "attendance_defaulter",
    title: "Attendance Defaulter",
    body:
      "Dear Parent, attendance for {{name}} is currently {{pct}}%, which is below the required {{threshold}}%. " +
      "Please ensure regular attendance. — Team {{branch}}",
  },
  consecutive_absence: {
    key: "consecutive_absence",
    title: "Consecutive Absence",
    body:
      "Dear Parent, {{name}} has been absent for {{days}} consecutive days. " +
      "Kindly contact the office if there is a concern. — Team {{branch}}",
  },
  monthly_attendance_warning: {
    key: "monthly_attendance_warning",
    title: "Monthly Attendance Warning",
    body:
      "Monthly attendance alert: {{name}} is at {{pct}}% this period. Please improve attendance to stay above {{threshold}}%. — Team {{branch}}",
  },
  attendance_improvement: {
    key: "attendance_improvement",
    title: "Attendance Improvement",
    body: "Great news! {{name}}'s attendance has improved to {{pct}}%. Keep up the good work! — Team {{branch}}",
  },
};

/** Pick the right template for an alert kind. */
export const templateKeyForAlert = (alertType: string): string => {
  if (alertType.startsWith("streak")) return "consecutive_absence";
  if (alertType.startsWith("defaulter")) return "attendance_defaulter";
  return "monthly_attendance_warning";
};

/** Render a ready-to-enqueue WhatsApp message for an attendance alert. */
export const renderAlert = (
  alert: AttendanceAlert,
  opts: { branchName?: string } = {},
): RenderedMessage => {
  const def = ALERT_TEMPLATES[templateKeyForAlert(alert.alertType)];
  return renderMessage(
    {
      templateKey: def.key,
      language: "en",
      providerName: def.key,
      body: def.body,
      buttons: [],
      media: undefined,
      variables: ["name", "pct", "threshold", "days", "branch"],
    },
    {
      name: alert.subjectName ?? "Student",
      pct: alert.metricValue ?? "",
      threshold: alert.threshold ?? "",
      days: alert.metricValue ?? "",
      branch: opts.branchName ?? "ARK",
    },
  );
};
