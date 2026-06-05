// ── Attendance Governance domain types (Phase 5) ────────────────────────────
// Locking, monthly closing, the approval queue and the unified audit center.
// Services map DB rows ↔ these app-facing shapes.

export type GovScope = "student" | "staff" | "all";
export type LockPeriodType = "day" | "week" | "month";

// ── Lock periods ─────────────────────────────────────────────────────────────
export interface AttendanceLock {
  id: string;
  scope: GovScope;
  periodType: LockPeriodType;
  periodKey: string;     // '2026-01' | '2026-01-15' | '2026-W03'
  fromDate: string;      // YYYY-MM-DD
  toDate: string;        // YYYY-MM-DD
  locked: boolean;
  reason?: string;
  lockedBy?: string;
  lockedByName?: string;
  lockedByRole?: string;
  lockedAt?: string;
  updatedAt?: string;
}

export interface LockInput {
  scope: GovScope;
  periodType: LockPeriodType;
  /** Anchor date inside the period (used to derive periodKey + from/to). */
  date: string;
  reason?: string;
}

// ── Monthly closing ──────────────────────────────────────────────────────────
export type ClosingStatus = "open" | "closed" | "reopened";

export interface AttendanceClosing {
  id: string;
  scope: GovScope;
  month: string;          // YYYY-MM
  status: ClosingStatus;
  remarks?: string;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  reopenedAt?: string;
  reopenReason?: string;
  updatedAt?: string;
}

// ── Approval queue ───────────────────────────────────────────────────────────
export type ApprovalRequestType =
  | "correction"
  | "backdated"
  | "bulk_import"
  | "reopen"
  | "unlock";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "returned";

export interface AttendanceApproval {
  id: string;
  requestType: ApprovalRequestType;
  entityType: "student" | "staff";
  targetId?: string;
  targetName?: string;
  affectedFrom?: string;
  affectedTo?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  attachments: string[];
  status: ApprovalStatus;
  requestedBy?: string;
  requestedByName?: string;
  requestedByRole?: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface ApprovalInput {
  requestType: ApprovalRequestType;
  entityType: "student" | "staff";
  targetId?: string;
  targetName?: string;
  affectedFrom?: string;
  affectedTo?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  attachments?: string[];
}

// ── Governance audit (Audit Center) ──────────────────────────────────────────
export type GovAuditAction =
  | "created"
  | "updated"
  | "locked"
  | "unlocked"
  | "closed"
  | "reopened"
  | "approved"
  | "rejected"
  | "returned"
  | "notified"
  | "dismissed"
  | "resolved";

export interface GovAuditEntry {
  id: string;
  entityType: string;   // lock | closing | approval | alert | correction
  entityId?: string;
  action: GovAuditAction;
  scope?: string;
  summary?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  createdAt: string;
}

// ── Compliance dashboard snapshot ────────────────────────────────────────────
export interface ComplianceSnapshot {
  studentsBelow75: number;
  studentsBelow50: number;
  staffBelowTarget: number;
  unapprovedCorrections: number;
  pendingApprovals: number;
  pendingReopens: number;
  openGovernanceTasks: number;
  openAlerts: number;
  monthsClosed: number;
  activeLocks: number;
}
