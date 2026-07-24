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
  /**
   * Registry default used ONLY when `comms_automation_settings` has no row for
   * the event (pre-migration / un-seeded). Everything defaults OFF — a school
   * must opt in before we message a parent — except the attendance notices,
   * which the spec pins to Default = ON.
   */
  defaultEnabled?: boolean;
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
  defaultEnabled = false,
): AutomationEventMeta => ({ key, label, category, description, defaultTemplate, defaultChannel, defaultTiming, kind, defaultEnabled });

export const AUTOMATION_EVENTS: AutomationEventMeta[] = [
  // Real-time: fired synchronously by attendanceWhatsapp.service on Submit
  // Attendance. Default ON — see docs/ATTENDANCE_WHATSAPP_AUTOMATION.md.
  ev("attendance_absent",   "Student marked absent",   "Attendance", "Instantly WhatsApp parents when a student is marked absent (sent in real time on Submit Attendance).", "attendance_absent",   "whatsapp", "immediate", "event", true),
  ev("attendance_corrected","Attendance corrected",    "Attendance", "Auto-send a correction when an already-notified absence is changed to PRESENT.",                      "attendance_corrected","whatsapp", "immediate", "event", true),
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
  // Academics / Allocation — these notify the TEACHER (recipient kind=staff) when
  // a coordinator schedules/changes their classes. Default OFF (opt-in).
  ev("teacher_class_scheduled",   "Class scheduled (teacher)",   "Academics", "Notify a teacher when a coordinator schedules a new class for them.",  "teacher_class_scheduled",   "both", "immediate", "event"),
  ev("teacher_class_rescheduled", "Class rescheduled (teacher)", "Academics", "Notify a teacher when one of their classes is rescheduled.",           "teacher_class_rescheduled", "both", "immediate", "event"),
  ev("teacher_class_cancelled",   "Class cancelled (teacher)",   "Academics", "Notify a teacher when one of their classes is cancelled.",             "teacher_class_cancelled",   "both", "immediate", "event"),
  ev("teacher_extra_class",       "Extra class assigned",        "Academics", "Notify a teacher instantly when a coordinator assigns them an extra class.", "teacher_extra_class",   "both", "immediate", "event"),
  ev("teacher_substitute_assigned", "Substitute assigned",       "Academics", "Notify a teacher instantly when a coordinator assigns them as substitute for a class.", "teacher_substitute_assigned", "both", "immediate", "event"),
  // Phase 3 — class tracking automation. Reminders are dispatched by the
  // Class Control Center sweep; started/ended fire from the class lifecycle.
  // All default OFF (opt-in) so nothing is sent until an institute enables it.
  ev("class_reminder_faculty",     "Class reminder — faculty",     "Academics", "Remind the faculty member 15 minutes before their class starts.",              "class_reminder_faculty",     "both", "immediate", "event"),
  ev("class_reminder_coordinator", "Class reminder — coordinator", "Academics", "Alert the coordinator 5 minutes before a class that has not started yet.",     "class_reminder_coordinator", "both", "immediate", "event"),
  ev("class_started",              "Class started",                "Academics", "Notify the coordinator and management the moment a class goes live.",          "class_started",              "both", "immediate", "event"),
  ev("class_ended",                "Class ended",                  "Academics", "Notify the coordinator and management when a class ends, with actual hours.",  "class_ended",                "both", "immediate", "event"),
  ev("class_attendance_missing",   "Attendance missing",           "Academics", "Chase the faculty member when a finished class still has no attendance.",      "class_attendance_missing",   "both", "immediate", "event"),
  ev("class_cancelled_students",   "Class cancelled (students)",   "Academics", "Inform students and parents when a scheduled class is cancelled.",             "class_cancelled",            "whatsapp", "immediate", "event"),
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
