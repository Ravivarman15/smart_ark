// ──────────────────────────────────────────────────────────────────────────────
// Automation event registry (Phase 2) — the single source of truth for which
// business events can auto-notify, their default channel/timing and the template
// they render. The Automation Settings page, the dispatcher, the scheduler and
// docs/AISENSY_TEMPLATES.md all read from here. Pure metadata — no services, so
// it never creates a circular import.
//
// `kind: "scheduled"` events are driven by the daily scheduler (comms-scheduler
// edge fn / in-app "Run now"); `kind: "event"` events fire from an operational
// action via commsDispatcher.dispatch(eventKey, context).
// ──────────────────────────────────────────────────────────────────────────────

import type {
  AutomationChannel,
  AutomationEventKind,
  AutomationTiming,
} from "../types/communication.types";

export interface AutomationEventMeta {
  key: string;
  label: string;
  /** Grouping shown on the settings page. */
  category: string;
  description: string;
  defaultTemplate: string;
  defaultChannel: AutomationChannel;
  defaultTiming: AutomationTiming;
  kind: AutomationEventKind;
}

const ev = (
  key: string,
  label: string,
  category: string,
  description: string,
  defaultTemplate: string,
  defaultChannel: AutomationChannel,
  defaultTiming: AutomationTiming,
  kind: AutomationEventKind,
): AutomationEventMeta => ({ key, label, category, description, defaultTemplate, defaultChannel, defaultTiming, kind });

export const AUTOMATION_EVENTS: AutomationEventMeta[] = [
  ev("attendance_absent",   "Student marked absent",   "Attendance", "Notify parents when a student is marked absent.",              "attendance_absent",      "whatsapp", "immediate", "event"),
  ev("attendance_present",  "Student marked present",  "Attendance", "Optional present-confirmation to parents.",                    "attendance_present",     "whatsapp", "immediate", "event"),
  ev("fee_due",             "Fee due reminder",        "Fees",       "Daily reminder to students with a pending balance.",            "fee_due_reminder",       "whatsapp", "scheduled", "scheduled"),
  ev("fee_paid",            "Fee paid receipt",        "Fees",       "Auto-send a branded Email + WhatsApp receipt when a payment is collected.", "fee_receipt",       "both",     "immediate", "event"),
  ev("exam_published",      "Exam marks published",    "Exams",      "Send marks/grade to parents when results are published.",       "exam_result",            "whatsapp", "immediate", "event"),
  ev("exam_scheduled",      "Exam reminder",           "Exams",      "Remind students of an upcoming exam.",                          "exam_reminder",          "whatsapp", "scheduled", "scheduled"),
  ev("birthday_student",    "Student birthday",        "Birthday",   "Daily birthday wishes for students with a birthday today.",      "birthday_wish",          "whatsapp", "scheduled", "scheduled"),
  ev("admission_completed", "Admission completed",     "Admission",  "Welcome message when an admission is completed.",               "student_welcome",        "both",     "immediate", "event"),
  ev("demo_scheduled",      "Demo scheduled",          "Admission",  "Confirm a demo session when it is booked.",                     "lead_demo_scheduled_v2", "whatsapp", "immediate", "event"),
  ev("demo_reminder",       "Demo reminder",           "Admission",  "Remind a prospect one day before their demo.",                  "lead_demo_reminder_v2",  "whatsapp", "scheduled", "scheduled"),
  ev("payroll_approved",    "Payroll approved",        "Payroll",    "WhatsApp staff when payroll is approved (payslip emails are sent by the payroll flow).", "payroll_approved", "whatsapp", "immediate", "event"),
  ev("staff_credentials",   "Staff credentials",       "Credentials","Send login credentials when a staff account is created.",       "staff_credentials",      "whatsapp", "immediate", "event"),
  ev("student_credentials", "Student credentials",     "Credentials","Send parent-app credentials when a student is created.",        "student_credentials",    "whatsapp", "immediate", "event"),
  ev("task_assigned",       "Task assigned",           "Tasks",      "Notify the assignee when a task is assigned.",                  "task_assigned",          "whatsapp", "immediate", "event"),
  ev("task_due",            "Task due reminder",       "Tasks",      "Remind assignees of tasks due tomorrow.",                       "task_reminder",          "whatsapp", "scheduled", "scheduled"),
  ev("certificate_ready",   "Certificate ready",       "Certificate","Notify when a certificate is generated.",                       "certificate_ready",      "whatsapp", "immediate", "event"),
  ev("live_class_created",  "Live class created",      "Live Class", "Notify assigned students when a live class is created.",        "live_class_notification","whatsapp", "immediate", "event"),
  ev("class_cancelled",     "Class cancelled",         "Live Class", "Notify students when a class is cancelled.",                    "class_cancelled",        "whatsapp", "immediate", "event"),
  ev("holiday_notice",      "Holiday notice",          "Holiday",    "Notify all students/staff when a holiday is added.",            "holiday_notice",         "whatsapp", "scheduled", "scheduled"),
];

export const AUTOMATION_EVENTS_BY_KEY: Record<string, AutomationEventMeta> =
  AUTOMATION_EVENTS.reduce((acc, e) => {
    acc[e.key] = e;
    return acc;
  }, {} as Record<string, AutomationEventMeta>);

/** Ordered category groups for the settings page. */
export const AUTOMATION_CATEGORIES: string[] = AUTOMATION_EVENTS.reduce<string[]>((acc, e) => {
  if (!acc.includes(e.category)) acc.push(e.category);
  return acc;
}, []);

/** Template keys actually referenced by an automation event (used by docs). */
export const AUTOMATION_TEMPLATE_KEYS: string[] = Array.from(
  new Set(AUTOMATION_EVENTS.map((e) => e.defaultTemplate)),
);
