// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Domain Types & Interfaces
// ──────────────────────────────────────────────────────────────────────────────

export type CalendarEventType =
  | "holiday"
  | "exam"
  | "parent_meeting"
  | "ptm"
  | "school_event"
  | "assignment_deadline"
  | "fee_due"
  | "special_class"
  | "school_closure"
  | "announcement"
  | "custom";

export type CalendarEventStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export type TargetScope =
  | "all"
  | "roles"
  | "standards"
  | "batches"
  | "students"
  | "parents"
  | "staff"
  | "custom";

export type EventAudienceTargetType =
  | "all"
  | "role"
  | "standard"
  | "batch"
  | "student"
  | "parent"
  | "staff";

export interface EventAudience {
  id?: string;
  event_id?: string;
  organization_id?: string;
  target_type: EventAudienceTargetType;
  target_id?: string;
  target_name?: string;
  created_at?: string;
}

export type ReminderChannel = "in_app" | "whatsapp" | "email";

export interface EventReminder {
  id: string;
  reminder_type: "7_days" | "3_days" | "1_day" | "2_hours" | "30_minutes" | "custom";
  offset_minutes: number;
  label: string;
  channels: ReminderChannel[];
  sent?: boolean;
  sent_at?: string | null;
  sent_count?: number;
}

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  count?: number;
  until?: string; // YYYY-MM-DD
  daysOfWeek?: number[]; // 0=Sunday..6=Saturday
}

export interface EventAttachment {
  name: string;
  url: string;
  file_path?: string;
  size_bytes?: number;
  content_type?: string;
}

export interface CalendarEvent {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  event_type: CalendarEventType;
  start_at: string; // ISO 8601
  end_at: string;   // ISO 8601
  all_day: boolean;
  timezone: string;
  status: CalendarEventStatus;
  location?: string | null;
  color?: string | null;
  target_scope: TargetScope;
  is_recurring: boolean;
  recurrence_rule?: RecurrenceRule | null;
  reminders: EventReminder[];
  attachments?: EventAttachment[];
  linked_entity_type?: "exam" | "announcement" | "assignment" | "fee" | "timetable" | null;
  linked_entity_id?: string | null;
  linked_metadata?: Record<string, any>;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  audiences?: EventAudience[];
  creator?: {
    id?: string;
    full_name?: string;
    email?: string;
  };
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  event_type: CalendarEventType;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  timezone?: string;
  status?: CalendarEventStatus;
  location?: string;
  color?: string;
  target_scope?: TargetScope;
  audiences?: Array<{
    target_type: EventAudienceTargetType;
    target_id?: string;
    target_name?: string;
  }>;
  is_recurring?: boolean;
  recurrence_rule?: RecurrenceRule;
  reminders?: EventReminder[];
  attachments?: EventAttachment[];
  linked_entity_type?: "exam" | "announcement" | "assignment" | "fee" | "timetable";
  linked_entity_id?: string;
  linked_metadata?: Record<string, any>;
  publish_as_announcement?: boolean;
}

export interface UpdateCalendarEventInput extends Partial<CreateCalendarEventInput> {
  id: string;
}

export interface EventFilter {
  search?: string;
  event_types?: CalendarEventType[];
  statuses?: CalendarEventStatus[];
  standard_id?: string;
  batch_id?: string;
  student_id?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string;   // YYYY-MM-DD
}

export interface TargetCountPreview {
  studentsCount: number;
  parentsCount: number;
  staffCount: number;
  totalRecipients: number;
}

export interface EventConflict {
  conflictingEvent: CalendarEvent;
  conflictType: "overlap" | "same_class_exam" | "holiday_clash";
  message: string;
}
