// ── Student & Parent Authentication — domain types ───────────────────────────
// App-facing shapes for the auth-accounts platform. DB shape lives in
// 20260615_student_parent_auth.sql; provisioning + login proof happen in the
// student-parent-accounts edge function.

export type AuthSubject = "student" | "parent";

/** Lifecycle status of a login account. */
export type AccountStatus = "pending" | "active" | "disabled" | "locked";

/** Health bucket derived client-side (no secrets). */
export type AccountHealth = "no_login" | "active" | "disabled" | "locked" | "pending";

export interface StudentAuthAccount {
  id: string;
  studentId: string;
  userId?: string;
  username?: string;
  loginEmail?: string;
  mobile?: string;
  status: AccountStatus;
  lastLoginAt?: string;
}

/** A student attached to a parent account, resolved for display. */
export interface LinkedChild {
  studentId: string;
  name: string;
  className?: string;
  section?: string;
  enrolmentNo?: string;
  relation?: string;
  isPrimary: boolean;
}

export interface ParentAuthAccount {
  id: string;
  userId?: string;
  name?: string;
  username?: string;
  loginEmail?: string;
  email?: string;
  mobile?: string;
  status: AccountStatus;
  linkedStudentIds: string[];
  /** Resolved children — populated by listParentAccounts(). */
  children: LinkedChild[];
  /**
   * When true, the DB trigger mirrors the linked student's guardian fields
   * onto this account. Flipped to false automatically on any manual edit.
   */
  autoSync?: boolean;
  lastSyncedAt?: string;
  /**
   * Set when the children could not be READ (not when there are none).
   *
   * "We don't know" and "there are none" must render differently: showing
   * "No children linked" after a failed query told staff a linked child was
   * missing and sent them to re-link an account that was already correct.
   */
  childrenError?: string;
}

/** Result of the server-side verify / provision (login proven or blocked). */
export interface AccountVerifyResult {
  ok: boolean;
  verified?: boolean;
  accountId?: string;
  userId?: string;
  username?: string;
  loginEmail?: string;
  password?: string;
  loginVerified?: boolean;
  reason?: string;
  message?: string;
  /**
   * Raw server diagnostics (auth error name / status / code, the login email
   * that was attempted). Surfaced in the UI behind a disclosure so a failure is
   * always diagnosable without reading edge-function logs.
   */
  detail?: Record<string, unknown>;
  /**
   * Set when the account was created but one or more children could not be
   * attached. Distinct from `message`: the provision SUCCEEDED, so this must
   * not be rendered as a failure — but a parent linked to nobody sees an empty
   * portal, and staff have to be told.
   */
  linkWarning?: string;
  /** Per-channel credential delivery outcome, when a send was attempted. */
  deliveries?: { channel: "email" | "whatsapp"; ok: boolean; skipped?: boolean; message?: string }[];
}

export interface AccountHealthSnapshot {
  totalStudents: number;
  studentAccountsCreated: number;
  studentAccountsMissing: number;
  parentAccountsCreated: number;
  pendingAccounts: number;
  disabledAccounts: number;
  lockedAccounts: number;
  duplicateUsernames: string[];
  duplicateEmails: string[];
}
