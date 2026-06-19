// Domain types for the Lead Management + Automation CRM.
// App-facing (camelCase). DB row shapes stay private to services/.

export type LeadStatus =
  | "new"
  | "contacted"
  | "followup"
  | "demo_scheduled"
  | "demo_attended"
  | "admission"
  | "closed";

export type LeadSource =
  | "meta_ads"
  | "landing"
  | "walk_in"
  | "call"
  | "referral"
  | "manual";

export type ScoreCategory = "cold" | "warm" | "hot" | "priority";
export type LeadPriority = "high" | "medium" | "low";
export type AssignmentState = "unassigned" | "assigned";

/** Ordered pipeline stages — drives the Kanban board + stage transitions. */
export const LEAD_PIPELINE: LeadStatus[] = [
  "new",
  "contacted",
  "followup",
  "demo_scheduled",
  "demo_attended",
  "admission",
  "closed",
];

export interface Lead {
  id: string;
  studentName: string;
  parentName?: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  course?: string;
  standard?: string;
  campus?: string;
  status: LeadStatus;
  closeReason?: string;
  score: number;
  scoreCategory: ScoreCategory;
  priority: LeadPriority;
  estimatedValue: number;
  assignedTo?: string;
  assignedAt?: string;
  assignmentState: AssignmentState;
  firstResponseAt?: string;
  lastActivityAt: string;
  slaDueAt?: string;
  slaBreached: boolean;
  isOverdue: boolean;
  escalationCount: number;
  isDuplicate: boolean;
  duplicateOf?: string;
  notes?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: string;
}

export interface CreateLeadInput {
  studentName: string;
  parentName?: string;
  phone?: string;
  email?: string;
  source?: LeadSource;
  course?: string;
  standard?: string;
  campus?: string;
  priority?: LeadPriority;
  estimatedValue?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type UpdateLeadInput = Partial<
  Omit<Lead, "id" | "createdAt" | "updatedAt" | "metadata"> & {
    metadata?: Record<string, unknown>;
  }
>;

/** Public landing-page / Meta-ads payload (unauthenticated). */
export interface PublicLeadInput {
  studentName: string;
  parentName?: string;
  phone: string;
  email?: string;
  course?: string;
  standard?: string;
  campus?: string;
  source?: LeadSource;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus | "all";
  scoreCategory?: ScoreCategory | "all";
  assignedTo?: string | "all" | "unassigned";
  source?: LeadSource | "all";
  overdueOnly?: boolean;
  todayOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LeadListResult {
  rows: Lead[];
  total: number;
  degraded: boolean;
}

export interface LeadNote {
  id: string;
  leadId: string;
  note: string;
  createdAt: string;
  createdBy?: string;
}

export type LeadActivityType =
  | "created"
  | "assigned"
  | "status_change"
  | "note"
  | "followup"
  | "demo"
  | "admission"
  | "whatsapp"
  | "escalation"
  | "score";

export interface LeadActivity {
  id: string;
  leadId: string;
  type: LeadActivityType;
  detail?: string;
  oldValue?: string;
  newValue?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface LeadFollowup {
  id: string;
  leadId: string;
  assignedTo?: string;
  level: number;
  channel: string;
  dueAt: string;
  status: "pending" | "done" | "overdue" | "escalated" | "cancelled";
  completedAt?: string;
  taskId?: string;
  notes?: string;
  createdAt: string;
}

export interface LeadNotification {
  id: string;
  recipientId?: string;
  leadId?: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface DemoClass {
  id: string;
  leadId: string;
  facultyId?: string;
  scheduledAt: string;
  batch?: string;
  subject?: string;
  mode: "offline" | "online";
  status: "scheduled" | "attended" | "missed" | "cancelled";
  notes?: string;
  createdAt: string;
}

export interface Admission {
  id: string;
  leadId: string;
  studentId?: string;
  counselorId?: string;
  admissionDate: string;
  course?: string;
  batch?: string;
  campus?: string;
  feeAmount: number;
  scholarshipAmount: number;
  paymentStatus: "pending" | "partial" | "paid";
  status: "confirmed" | "provisional" | "cancelled";
  notes?: string;
  createdAt: string;
}

export interface CounselorCourseMapping {
  id: string;
  counselorId: string;
  course?: string;
  standard?: string;
  campus?: string;
  priority: number;
  isActive: boolean;
}

export interface DuplicateMatch {
  lead: Lead;
  reason: "phone" | "email" | "name";
}

/** Result of the full automated intake pipeline. */
export interface IntakeResult {
  lead: Lead;
  duplicate?: DuplicateMatch;
  assignedTo?: string;
  whatsappQueued: boolean;
  followupCreated: boolean;
  taskId?: string;
}

// ── Dashboard aggregates ──────────────────────────────────────────────────────
export interface CounselorDashboard {
  totalLeads: number;
  todayLeads: number;
  pendingFollowups: number;
  overdueLeads: number;
  demosScheduled: number;
  admissions: number;
  conversionRate: number;       // %
  avgResponseMinutes: number;
  slaCompliance: number;        // %
}

export interface ManagementDashboard {
  totalLeads: number;
  todayLeads: number;
  admissions: number;
  revenue: number;
  pendingFollowups: number;
  overdueLeads: number;
  unassignedLeads: number;
  highValueLeads: number;
  slaViolations: number;
  conversionRate: number;       // %
}
