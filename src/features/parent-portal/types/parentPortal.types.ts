// ── Parent Portal — domain types ─────────────────────────────────────────────
//
// Deliberately thin. The portal is a VIEW over modules that already have domain
// types, so it re-exports theirs rather than redefining them:
//
//   Student            → features/students/types
//   StudentInsights    → features/students/hooks/useStudentInsights
//   HealthScores/AiSummary → features/students/utils/student360
//   TimelineEntry      → features/communication/types
//   StudentDocument    → features/students/types
//   LiveClass          → features/live-classes/types
//
// Only shapes with no existing owner are declared here.

import type { Student } from "@/features/students/types";
import type { HealthScores, AiSummary } from "@/features/students/utils/student360";

/** A child linked to the signed-in parent, plus the link's own metadata. */
export interface ParentChild {
  student: Student;
  /** parent_student_links.relation — 'father' | 'mother' | 'guardian' | … */
  relation?: string;
  isPrimary: boolean;
}

/**
 * The cheap per-child rollup behind each Home dashboard card.
 *
 * Kept separate from StudentInsights on purpose: Home renders one card PER
 * child, and pulling the full insights bundle for every child would mean
 * N children × 4 queries before the first paint. This shape is what the cards
 * actually display and nothing more.
 */
export interface ChildSummary {
  studentId: string;
  attendancePercent: number | null;
  /** Today's attendance mark, when one has been recorded. */
  todayStatus: "present" | "absent" | "late" | null;
  classesToday: number;
  nextClassAt?: string;
  upcomingExam?: { id: string; title: string; subject?: string; date?: string };
  feePending: number;
  feeTotal: number;
  overallPercent: number | null;
  health: HealthScores;
  /** Transport / hostel flags carried on the student profile. */
  transportRequired: boolean;
  hostelRequired: boolean;
}

/** One entry in the unified activity timeline. */
export interface ParentTimelineItem {
  id: string;
  /** Drives the icon + colour and the filter chips. */
  kind:
    | "attendance"
    | "exam"
    | "fee"
    | "class"
    | "document"
    | "message"
    | "admission";
  date?: string;
  title: string;
  detail: string;
}

/** A scheduled class as the portal shows it (timetable + live class merged). */
export interface ParentClassItem {
  id: string;
  source: "schedule" | "live";
  title: string;
  subjectName?: string;
  teacherName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  /** Present only for online classes; the Join button is gated on it. */
  meetingLink?: string;
  room?: string;
  mode?: string;
  recordingUrl?: string;
  classNotes?: string;
}

/** Answer returned by the rule-based parent assistant. */
export interface AssistantAnswer {
  question: string;
  answer: string;
  /** Supporting figures rendered as chips under the answer. */
  facts: { label: string; value: string }[];
}

/** Parent-owned portal settings (parent_portal_preferences). */
export interface ParentPreferences {
  language: string;
  theme: "light" | "dark" | "system";
  /** event key → true when the parent has OPTED OUT of that notification. */
  notificationPrefs: Record<string, boolean>;
}

/** Events a parent may opt out of. Mirrors comms_automation_settings keys. */
export const PARENT_NOTIFICATION_EVENTS = [
  { key: "attendance", label: "Attendance marked / absent" },
  { key: "homework", label: "Homework assigned" },
  { key: "exam_reminder", label: "Exam reminders" },
  { key: "exam_marks", label: "Results published" },
  { key: "fee_due", label: "Fee due reminders" },
  { key: "fee_paid", label: "Fee receipts" },
  { key: "birthday", label: "Birthday greetings" },
  { key: "live_class", label: "Live class alerts" },
] as const;

export type { HealthScores, AiSummary };
