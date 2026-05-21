// Static option lists + display metadata for the Live Class feature.
// NO React, NO Supabase.

import type {
  AssignType,
  LiveClassStatus,
  MeetingPlatform,
  RepeatRule,
} from "../types/liveClass.types";

export const STATUS_META: Record<
  LiveClassStatus,
  { label: string; tone: "accent" | "positive" | "warning" | "danger" | "neutral" }
> = {
  scheduled: { label: "Scheduled", tone: "accent" },
  ongoing: { label: "Ongoing", tone: "warning" },
  completed: { label: "Completed", tone: "positive" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const PLATFORM_META: Record<MeetingPlatform, { label: string }> = {
  google_meet: { label: "Google Meet" },
  zoom: { label: "Zoom" },
  ms_teams: { label: "Microsoft Teams" },
  other: { label: "Other" },
};

export const PLATFORM_OPTIONS: { value: MeetingPlatform; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "zoom", label: "Zoom" },
  { value: "ms_teams", label: "Microsoft Teams" },
  { value: "other", label: "Other" },
];

export const ASSIGN_TYPE_OPTIONS: { value: AssignType; label: string; hint: string }[] = [
  { value: "batch", label: "Single Batch", hint: "Assign to one batch." },
  { value: "multiple_batches", label: "Multiple Batches", hint: "Assign to several batches." },
  { value: "standard", label: "Entire Standard", hint: "Every batch in the standard." },
];

export const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const STATUS_OPTIONS: { value: LiveClassStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// WhatsApp template keys — kept here so the messaging service and any
// future AiSensy template config stay in sync.
export const WA_TEMPLATES = {
  liveClassScheduled: "live_class_scheduled",
  liveClassReminder: "live_class_reminder",
  liveClassRescheduled: "live_class_rescheduled",
  liveClassCancelled: "live_class_cancelled",
} as const;
