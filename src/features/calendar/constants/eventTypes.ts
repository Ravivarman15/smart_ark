// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Event Types & Metadata Registry
// ──────────────────────────────────────────────────────────────────────────────

import {
  Calendar,
  Sparkles,
  FileText,
  Users,
  Award,
  Clock,
  CreditCard,
  AlertOctagon,
  Megaphone,
  BookOpen,
  GraduationCap,
  Ban,
  Tag,
} from "lucide-react";
import type { CalendarEventType } from "../types/calendar.types";

export interface EventTypeMetadata {
  type: CalendarEventType;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Calendar;
  color: string; // Tailwind text/bg color token or hex
  badgeClass: string;
  borderClass: string;
  defaultAllDay?: boolean;
}

export const EVENT_TYPES_METADATA: Record<CalendarEventType, EventTypeMetadata> = {
  holiday: {
    type: "holiday",
    label: "Holiday / Vacation",
    shortLabel: "Holiday",
    description: "School holidays, public holidays, festivals, and term vacations.",
    icon: Sparkles,
    color: "#10b981", // Emerald
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    borderClass: "border-l-emerald-500",
    defaultAllDay: true,
  },
  exam: {
    type: "exam",
    label: "Examination & Tests",
    shortLabel: "Exam",
    description: "Mid-terms, unit tests, practicals, finals, and online MCQ exams.",
    icon: Award,
    color: "#6366f1", // Indigo
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    borderClass: "border-l-indigo-500",
  },
  parent_meeting: {
    type: "parent_meeting",
    label: "Parent Meeting",
    shortLabel: "Parent Meet",
    description: "Scheduled general or selective parent meetings and briefings.",
    icon: Users,
    color: "#3b82f6", // Blue
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    borderClass: "border-l-blue-500",
  },
  ptm: {
    type: "ptm",
    label: "Parent Teacher Meeting (PTM)",
    shortLabel: "PTM",
    description: "Official Parent-Teacher meetings, 1-on-1 consultations, and review sessions.",
    icon: Users,
    color: "#8b5cf6", // Purple
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    borderClass: "border-l-purple-500",
  },
  school_event: {
    type: "school_event",
    label: "School Event & Celebration",
    shortLabel: "Event",
    description: "Annual day, sports meet, cultural fests, science exhibitions, celebrations.",
    icon: Sparkles,
    color: "#f59e0b", // Amber
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    borderClass: "border-l-amber-500",
  },
  assignment_deadline: {
    type: "assignment_deadline",
    label: "Assignment / Project Deadline",
    shortLabel: "Assignment",
    description: "Submission due dates for homework, assignments, and practical projects.",
    icon: FileText,
    color: "#ec4899", // Pink
    badgeClass: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
    borderClass: "border-l-pink-500",
  },
  fee_due: {
    type: "fee_due",
    label: "Fee Payment Due Date",
    shortLabel: "Fee Due",
    description: "Term fee due dates, installment cut-offs, and late fee thresholds.",
    icon: CreditCard,
    color: "#e11d48", // Rose
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    borderClass: "border-l-rose-500",
  },
  special_class: {
    type: "special_class",
    label: "Special / Extra Class",
    shortLabel: "Special Class",
    description: "Remedial classes, weekend extra sessions, and revision workshops.",
    icon: BookOpen,
    color: "#06b6d4", // Cyan
    badgeClass: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
    borderClass: "border-l-cyan-500",
  },
  school_closure: {
    type: "school_closure",
    label: "School Closure / Emergency",
    shortLabel: "Closure",
    description: "Emergency closures, weather warnings, or administrative shutdown.",
    icon: Ban,
    color: "#dc2626", // Red
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    borderClass: "border-l-red-500",
    defaultAllDay: true,
  },
  announcement: {
    type: "announcement",
    label: "Important Announcement",
    shortLabel: "Notice",
    description: "Official institutional notice linked to the announcement center.",
    icon: Megaphone,
    color: "#f97316", // Orange
    badgeClass: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
    borderClass: "border-l-orange-500",
  },
  custom: {
    type: "custom",
    label: "Custom Academic Event",
    shortLabel: "Custom",
    description: "Custom academic milestones, club meetings, and extracurricular activities.",
    icon: Tag,
    color: "#64748b", // Slate
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    borderClass: "border-l-slate-500",
  },
};

export const ALL_EVENT_TYPES = Object.keys(EVENT_TYPES_METADATA) as CalendarEventType[];

export const DEFAULT_REMINDER_OPTIONS = [
  { value: "7_days", label: "7 days before", offset_minutes: 7 * 24 * 60 },
  { value: "3_days", label: "3 days before", offset_minutes: 3 * 24 * 60 },
  { value: "1_day", label: "1 day before", offset_minutes: 24 * 60 },
  { value: "2_hours", label: "2 hours before", offset_minutes: 120 },
  { value: "30_minutes", label: "30 minutes before", offset_minutes: 30 },
];
