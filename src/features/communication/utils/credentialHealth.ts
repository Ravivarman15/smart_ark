// ──────────────────────────────────────────────────────────────────────────────
// Credential health — PURE, no React / no Supabase.
//
// Client-side classification of staff credential rows (read from `profiles` —
// never secrets). The authoritative login proof happens server-side in the
// verify-credentials edge function; this only surfaces structural issues
// (no auth link, no email, duplicates) so the Credential Health page can flag
// what needs repair before a send.
// ──────────────────────────────────────────────────────────────────────────────

import type { StaffCredentialStatus } from "../types/communication.types";

export interface StaffCredRow {
  profileId: string;
  name: string;
  email?: string | null;
  userId?: string | null;
  isActive?: boolean;
}

/**
 * Structural status of a staff credential:
 *   no_auth_link → profile not linked to an Auth login (cannot log in at all)
 *   no_email     → linked but missing the login email
 *   inactive     → deactivated account
 *   linked       → has an auth link + email (login-proof still needed at send)
 */
export const classifyStaffCredential = (row: StaffCredRow): StaffCredentialStatus => {
  if (!row.userId) return "no_auth_link";
  if (!row.email || row.email.trim() === "") return "no_email";
  if (row.isActive === false) return "inactive";
  return "linked";
};

/** Case-insensitive list of values that appear more than once (trimmed, blanks ignored). */
export const findDuplicates = (values: Array<string | null | undefined>): string[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim().toLowerCase();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
};

export interface StaffCredSummary {
  total: number;
  active: number;
  linked: number;
  missingAuthLink: number;
  missingEmail: number;
  duplicateEmails: string[];
  issues: Array<{ profileId: string; name: string; status: StaffCredentialStatus }>;
}

/** Roll up a set of staff rows into the Credential Health staff summary. */
export const summarizeStaffCredentials = (rows: StaffCredRow[]): StaffCredSummary => {
  const summary: StaffCredSummary = {
    total: rows.length,
    active: 0,
    linked: 0,
    missingAuthLink: 0,
    missingEmail: 0,
    duplicateEmails: findDuplicates(rows.map((r) => r.email)),
    issues: [],
  };
  for (const r of rows) {
    if (r.isActive !== false) summary.active += 1;
    const status = classifyStaffCredential(r);
    if (status === "linked") summary.linked += 1;
    else {
      if (status === "no_auth_link") summary.missingAuthLink += 1;
      if (status === "no_email") summary.missingEmail += 1;
      summary.issues.push({ profileId: r.profileId, name: r.name, status });
    }
  }
  return summary;
};

/** Human label for a verify-credentials failure reason. */
export const CREDENTIAL_REASON_LABEL: Record<string, string> = {
  no_auth_account: "No login account — invite the staff member first",
  orphaned_auth: "Orphaned profile — delete & re-invite",
  login_failed: "Login validation failed — not sent",
  rotate_failed: "Could not set temporary password",
  no_student_auth_backend: "Students have no login backend — cannot send",
  no_profile: "No matching record found",
  edge_error: "Verification service error",
};

export const credentialReasonLabel = (reason?: string): string =>
  (reason && CREDENTIAL_REASON_LABEL[reason]) || reason || "Unknown issue";
