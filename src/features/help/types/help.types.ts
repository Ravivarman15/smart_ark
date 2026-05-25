// ──────────────────────────────────────────────────────────────────────────────
// Help & Support module — types
// ──────────────────────────────────────────────────────────────────────────────

export type TicketCategory =
  | "general"
  | "fee"
  | "exam"
  | "attendance"
  | "student"
  | "staff"
  | "login"
  | "app_bug"
  | "feature_request"
  | "other";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_user"
  | "resolved"
  | "closed"
  | "cancelled";

export type SenderKind = "requester" | "agent" | "system";

export interface SupportTicket {
  id: string;
  ticketNo?: number;
  subject: string;
  description?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterProfileId?: string;
  requesterRole?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  campusId?: string;
  pagePath?: string;
  browserInfo?: string;
  assignedToProfileId?: string;
  assignedToName?: string;
  assignedAt?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  reopenedAt?: string;
  reopenCount: number;
  slaFirstResponseMinutes: number;
  slaResolutionMinutes: number;
  slaBreachedFirstResponse: boolean;
  slaBreachedResolution: boolean;
  satisfactionRating?: number;
  satisfactionComment?: string;
  satisfactionAt?: string;
  messageCount: number;
  attachmentCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportTicketInput {
  subject: string;
  description?: string;
  category: TicketCategory;
  priority?: TicketPriority;
  requesterPhone?: string;
  pagePath?: string;
  tags?: string[];
}

export interface TicketAssignmentInput {
  assignedToProfileId?: string | null;
  assignedToName?: string | null;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderProfileId?: string;
  senderName?: string;
  senderRole?: string;
  senderKind: SenderKind;
  body: string;
  isInternal: boolean;
  attachmentsSummary: Array<{ name: string; url: string; mime?: string }>;
  createdAt: string;
}

export interface SupportTicketMessageInput {
  ticketId: string;
  body: string;
  isInternal?: boolean;
  attachmentsSummary?: Array<{ name: string; url: string; mime?: string }>;
}

export interface SupportTicketAttachment {
  id: string;
  ticketId: string;
  messageId?: string;
  name: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedBy?: string;
  uploadedByName?: string;
  createdAt: string;
}

// ── Feedback ────────────────────────────────────────────────────────────────
export type FeedbackKind = "suggestion" | "bug" | "praise" | "complaint" | "nps";

export type FeedbackStatus =
  | "received"
  | "reviewing"
  | "planned"
  | "in_progress"
  | "shipped"
  | "declined";

export interface SupportFeedback {
  id: string;
  kind: FeedbackKind;
  module?: string;
  title?: string;
  body?: string;
  score?: number;
  status: FeedbackStatus;
  isAnonymous: boolean;
  isPublic: boolean;
  requesterProfileId?: string;
  requesterRole?: string;
  requesterName?: string;
  votesCount: number;
  repliedAt?: string;
  plannedAt?: string;
  shippedAt?: string;
  declinedAt?: string;
  managerReply?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportFeedbackInput {
  kind: FeedbackKind;
  module?: string;
  title?: string;
  body?: string;
  score?: number;
  isAnonymous?: boolean;
  isPublic?: boolean;
}

export interface SupportFeedbackStatusInput {
  status: FeedbackStatus;
  managerReply?: string;
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface HelpAnalytics {
  totalTickets: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  closed: number;
  cancelled: number;
  slaBreachedFirstResponse: number;
  slaBreachedResolution: number;
  avgFirstResponseMinutes: number;
  avgResolutionMinutes: number;
  satisfactionAverage: number;
  satisfactionCount: number;
  npsScore: number;
  npsResponses: number;
  byCategory: Array<{ category: TicketCategory; total: number; resolved: number }>;
  byPriority: Array<{ priority: TicketPriority; total: number }>;
  byAssignee: Array<{ assignee: string; total: number; resolved: number }>;
  byDay: Array<{ date: string; total: number; resolved: number }>;
  feedbackByKind: Array<{ kind: FeedbackKind; total: number }>;
}

// ── Audit ───────────────────────────────────────────────────────────────────
export type HelpAuditEntity = "ticket" | "message" | "attachment" | "feedback" | "vote";

export type HelpAuditAction =
  | "create"
  | "update"
  | "delete"
  | "assign"
  | "status_change"
  | "reopen"
  | "resolve"
  | "close"
  | "satisfaction";

export interface HelpAuditEntry {
  id: string;
  entityType: HelpAuditEntity;
  entityId?: string;
  action: HelpAuditAction;
  actorId?: string;
  actorName?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
