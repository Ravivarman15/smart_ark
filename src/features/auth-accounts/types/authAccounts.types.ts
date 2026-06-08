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
