// Private row→domain mappers + shared helpers for the leads services.
// Only services/ may import this. Keeps DB row shapes out of the app layer.

import type {
  Admission,
  CounselorCourseMapping,
  DemoClass,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadFollowup,
  LeadNote,
  LeadNotification,
  LeadPriority,
  LeadSource,
  LeadStatus,
  ScoreCategory,
} from "../types/lead.types";

type Row = Record<string, unknown>;

const s = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : String(v);
const n = (v: unknown): number =>
  v === null || v === undefined || v === "" ? 0 : Number(v);
const b = (v: unknown): boolean => v === true || v === "true";

/** A missing-table / missing-column error — drives graceful degradation. */
export const isSchemaMissing = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("relation") ||
    m.includes("column")
  );
};

// ── SLA windows per the spec ──────────────────────────────────────────────────
export const SLA_MINUTES: Record<string, number> = {
  new: 15,                 // respond within 15 minutes
  contacted: 2 * 24 * 60,  // demo within 2 days
  demo_attended: 7 * 24 * 60, // admission within 7 days
};

// ── Mappers ───────────────────────────────────────────────────────────────────
export const toLead = (r: Row): Lead => ({
  id: String(r.id),
  studentName: String(r.student_name ?? ""),
  parentName: s(r.parent_name),
  phone: s(r.phone),
  email: s(r.email),
  source: (s(r.source) as LeadSource) ?? "manual",
  course: s(r.course),
  standard: s(r.standard),
  campus: s(r.campus),
  status: (s(r.status) as LeadStatus) ?? "new",
  closeReason: s(r.close_reason),
  score: n(r.score),
  scoreCategory: (s(r.score_category) as ScoreCategory) ?? "cold",
  priority: (s(r.priority) as LeadPriority) ?? "medium",
  estimatedValue: n(r.estimated_value),
  assignedTo: s(r.assigned_to),
  assignedAt: s(r.assigned_at),
  assignmentState: (s(r.assignment_state) as Lead["assignmentState"]) ?? "unassigned",
  firstResponseAt: s(r.first_response_at),
  lastActivityAt: String(r.last_activity_at ?? r.created_at ?? new Date().toISOString()),
  slaDueAt: s(r.sla_due_at),
  slaBreached: b(r.sla_breached),
  isOverdue: b(r.is_overdue),
  escalationCount: n(r.escalation_count),
  isDuplicate: b(r.is_duplicate),
  duplicateOf: s(r.duplicate_of),
  notes: s(r.notes),
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? r.created_at ?? ""),
  createdBy: s(r.created_by),
  updatedBy: s(r.updated_by),
  deletedAt: s(r.deleted_at),
});

export const toNote = (r: Row): LeadNote => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  note: String(r.note ?? ""),
  createdAt: String(r.created_at ?? ""),
  createdBy: s(r.created_by),
});

export const toActivity = (r: Row): LeadActivity => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  type: (s(r.type) as LeadActivityType) ?? "note",
  detail: s(r.detail),
  oldValue: s(r.old_value),
  newValue: s(r.new_value),
  actorId: s(r.actor_id),
  actorName: s(r.actor_name),
  createdAt: String(r.created_at ?? ""),
});

export const toFollowup = (r: Row): LeadFollowup => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  assignedTo: s(r.assigned_to),
  level: n(r.level),
  channel: String(r.channel ?? "call"),
  dueAt: String(r.due_at ?? ""),
  status: (s(r.status) as LeadFollowup["status"]) ?? "pending",
  completedAt: s(r.completed_at),
  taskId: s(r.task_id),
  notes: s(r.notes),
  createdAt: String(r.created_at ?? ""),
});

export const toNotification = (r: Row): LeadNotification => ({
  id: String(r.id),
  recipientId: s(r.recipient_id),
  leadId: s(r.lead_id),
  type: String(r.type ?? ""),
  title: String(r.title ?? ""),
  message: s(r.message),
  isRead: b(r.is_read),
  readAt: s(r.read_at),
  createdAt: String(r.created_at ?? ""),
});

export const toDemo = (r: Row): DemoClass => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  facultyId: s(r.faculty_id),
  scheduledAt: String(r.scheduled_at ?? ""),
  batch: s(r.batch),
  subject: s(r.subject),
  mode: (s(r.mode) as DemoClass["mode"]) ?? "offline",
  status: (s(r.status) as DemoClass["status"]) ?? "scheduled",
  notes: s(r.notes),
  createdAt: String(r.created_at ?? ""),
});

export const toAdmission = (r: Row): Admission => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  studentId: s(r.student_id),
  counselorId: s(r.counselor_id),
  admissionDate: String(r.admission_date ?? ""),
  course: s(r.course),
  batch: s(r.batch),
  campus: s(r.campus),
  feeAmount: n(r.fee_amount),
  scholarshipAmount: n(r.scholarship_amount),
  paymentStatus: (s(r.payment_status) as Admission["paymentStatus"]) ?? "pending",
  status: (s(r.status) as Admission["status"]) ?? "confirmed",
  notes: s(r.notes),
  createdAt: String(r.created_at ?? ""),
});

export const toMapping = (r: Row): CounselorCourseMapping => ({
  id: String(r.id),
  counselorId: String(r.counselor_id),
  course: s(r.course),
  standard: s(r.standard),
  campus: s(r.campus),
  priority: n(r.priority),
  isActive: b(r.is_active),
});
