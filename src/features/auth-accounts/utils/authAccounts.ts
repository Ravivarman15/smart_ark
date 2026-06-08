// ── Student & Parent Authentication — PURE helpers (no React / no Supabase) ──
// Username synthesis, login-email derivation, account-health classification and
// summary. The authoritative login proof is server-side (student-parent-accounts
// edge function); these drive the Account Health dashboard + are unit-tested.

import type {
  AccountHealth,
  AccountStatus,
  StudentAuthAccount,
  ParentAuthAccount,
  AccountHealthSnapshot,
} from "../types/authAccounts.types";

export const STUDENT_LOGIN_DOMAIN = "students.ark.local";
export const PARENT_LOGIN_DOMAIN = "parents.ark.local";

/** Deterministic, readable username slug from a name + a salt (mirrors the edge fn). */
export const suggestUsername = (name: string, salt: string): string => {
  const base = (name || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 18);
  const tail = (salt || "").replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase() || "0000";
  return `${base || "user"}.${tail}`;
};

/** Synthesised login email when the account has no real email. */
export const synthLoginEmail = (username: string, subject: "student" | "parent"): string =>
  `${username}@${subject === "student" ? STUDENT_LOGIN_DOMAIN : PARENT_LOGIN_DOMAIN}`;

/** Is this a synthesised (placeholder) login email rather than a real one? */
export const isSyntheticEmail = (email?: string | null): boolean =>
  !!email && (email.endsWith(`@${STUDENT_LOGIN_DOMAIN}`) || email.endsWith(`@${PARENT_LOGIN_DOMAIN}`));

/** Health bucket for an account: no login link → no auth, else its status. */
export const classifyAccountHealth = (account: { userId?: string; status: AccountStatus }): AccountHealth => {
  if (!account.userId) return "no_login";
  return account.status;
};

/** Case-insensitive values that appear more than once (trimmed, blanks ignored). */
export const findDuplicates = (values: Array<string | null | undefined>): string[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim().toLowerCase();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
};

export interface SummariseInput {
  totalStudents: number;
  studentAccounts: StudentAuthAccount[];
  parentAccounts: ParentAuthAccount[];
}

/** Roll up student + parent accounts into the Account Health snapshot. */
export const summarizeAccountHealth = (input: SummariseInput): AccountHealthSnapshot => {
  const { totalStudents, studentAccounts, parentAccounts } = input;
  const created = studentAccounts.filter((a) => !!a.userId).length;

  const all = [...studentAccounts, ...parentAccounts];
  let pending = 0;
  let disabled = 0;
  let locked = 0;
  for (const a of all) {
    const h = classifyAccountHealth(a);
    if (h === "pending") pending += 1;
    else if (h === "disabled") disabled += 1;
    else if (h === "locked") locked += 1;
  }

  // Real (non-synthetic) emails only — synthesised placeholders are expected to
  // share a domain and must not be flagged as "duplicates".
  const realEmails = all
    .map((a) => a.loginEmail)
    .filter((e) => !isSyntheticEmail(e));

  return {
    totalStudents,
    studentAccountsCreated: created,
    studentAccountsMissing: Math.max(totalStudents - created, 0),
    parentAccountsCreated: parentAccounts.filter((a) => !!a.userId).length,
    pendingAccounts: pending,
    disabledAccounts: disabled,
    lockedAccounts: locked,
    duplicateUsernames: findDuplicates(all.map((a) => a.username)),
    duplicateEmails: findDuplicates(realEmails),
  };
};

/** Human label for a verify/provision failure reason. */
export const ACCOUNT_REASON_LABEL: Record<string, string> = {
  no_account: "No login account — create one first",
  no_student_account: "Student has no login — create one first",
  no_auth_link: "Account not linked to a login",
  no_student_auth_backend: "Authentication platform not installed",
  login_failed: "Login validation failed — not sent",
  rotate_failed: "Could not set temporary password",
  create_failed: "Could not create the login account",
  exists: "Account already exists — use Reset Password",
  disabled: "Account is disabled",
  locked: "Account is locked",
};

export const accountReasonLabel = (reason?: string): string =>
  (reason && ACCOUNT_REASON_LABEL[reason]) || reason || "Unknown issue";
