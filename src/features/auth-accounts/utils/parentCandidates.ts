// ── Parent candidates — extract guardians from a student record ──────────────
//
// Staff should never retype what the institution already holds. Every student
// row already carries father / mother / guardian names, mobiles and emails
// (captured at admission and by the Student Import engine), so provisioning a
// portal login is a matter of CONFIRMING those details, not entering them.
//
// Pure functions only — no I/O — so the readiness rules that decide whether an
// account can be created are unit-testable and identical everywhere they run.

import type { Student } from "@/features/students/types";

/** Which guardian slot on the student record a candidate came from. */
export type GuardianRole = "father" | "mother" | "guardian";

/** A field the candidate needs but the student record does not have. */
export interface MissingField {
  field: "name" | "mobile" | "email";
  label: string;
  /** blocking = cannot create the account at all. */
  severity: "blocking" | "advisory";
  why: string;
}

export interface ParentCandidate {
  role: GuardianRole;
  /** Label for the slot, e.g. "Father" or "Guardian (Uncle)". */
  roleLabel: string;
  name: string;
  mobile: string;
  email: string;
  /** Everything the record could not supply. */
  missing: MissingField[];
  /** No blocking gaps — an account can be provisioned. */
  canCreate: boolean;
  /** True when the slot is entirely empty (nothing recorded for this guardian). */
  isEmpty: boolean;
}

const clean = (v?: string | null): string => (v ?? "").trim();

/**
 * Normalise an Indian mobile for comparison: last 10 digits.
 *
 * The same parent is stored as "9876543210", "+91 98765 43210" and
 * "091-9876543210" across admission forms and imported spreadsheets. Comparing
 * raw strings would create a duplicate login per spelling — which is exactly
 * the bug the Student Import engine's family dedup exists to avoid.
 */
export const normalizeMobile = (v?: string | null): string => {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const isValidMobile = (v?: string | null): boolean => normalizeMobile(v).length === 10;

export const isValidEmail = (v?: string | null): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v));

/**
 * What is missing for this candidate, and does it block creation?
 *
 * BLOCKING: a name. The account is created against a person; without one the
 * portal greets "Parent" and staff cannot tell two accounts apart.
 *
 * ADVISORY: contact details. The login itself works without them — the edge
 * function synthesises a login email — but with neither a mobile nor an email
 * there is no way to DELIVER the credentials, so the account would be created
 * and then stranded. That is worth a loud warning, not a hard block: staff who
 * are handing over credentials in person are doing nothing wrong.
 */
export const evaluateCandidate = (
  name: string,
  mobile: string,
  email: string,
): { missing: MissingField[]; canCreate: boolean } => {
  const missing: MissingField[] = [];

  if (!clean(name)) {
    missing.push({
      field: "name",
      label: "Name",
      severity: "blocking",
      why: "An account cannot be created without a name.",
    });
  }

  const hasMobile = isValidMobile(mobile);
  const hasEmail = isValidEmail(email);

  if (!hasMobile && !hasEmail) {
    // ONE problem, reported once. Emitting a red row for "mobile" and another
    // for "email" describes a single failure — no way to reach this person —
    // as two, which reads like twice as much work to fix.
    missing.push({
      field: "mobile",
      label: "Mobile number or email",
      severity: "blocking",
      why: "Neither is on record, so there is no way to send the login details.",
    });
    return { missing, canCreate: false };
  }

  if (!hasMobile) {
    missing.push({
      field: "mobile",
      label: "Mobile number",
      severity: "advisory",
      why: clean(mobile)
        ? "The recorded mobile is not a valid 10-digit number — credentials will be emailed instead."
        : "No mobile on record — credentials can still be emailed.",
    });
  }

  if (!hasEmail) {
    missing.push({
      field: "email",
      label: "Email address",
      severity: "advisory",
      why: "No email on record — a login email will be generated automatically.",
    });
  }

  return { missing, canCreate: !missing.some((m) => m.severity === "blocking") };
};

const build = (
  role: GuardianRole,
  roleLabel: string,
  name?: string | null,
  mobile?: string | null,
  email?: string | null,
): ParentCandidate => {
  const n = clean(name);
  const m = clean(mobile);
  const e = clean(email);
  const { missing, canCreate } = evaluateCandidate(n, m, e);
  return {
    role,
    roleLabel,
    name: n,
    mobile: m,
    email: e,
    missing,
    canCreate,
    isEmpty: !n && !m && !e,
  };
};

/**
 * Every guardian slot recorded against a student, in the order staff expect.
 *
 * All three are returned even when empty — a caller showing "Mother: nothing
 * recorded" is more useful than one that silently omits the row, because the
 * gap is itself the thing staff need to act on.
 */
export const extractParentCandidates = (student: Student): ParentCandidate[] => [
  build("father", "Father", student.parentName, student.parentContact, student.parentEmail),
  build("mother", "Mother", student.motherName, student.motherContact, student.motherEmail),
  build(
    "guardian",
    student.guardianRelation ? `Guardian (${student.guardianRelation})` : "Guardian",
    student.guardianName,
    student.guardianContact,
    // The student schema has no guardian_email column — guardians fall back to
    // the shared parent email rather than showing a permanently-blank field.
    student.parentEmail,
  ),
];

/** The slot most likely to be the primary contact — the first usable one. */
export const preferredCandidate = (candidates: ParentCandidate[]): ParentCandidate | undefined =>
  candidates.find((c) => c.canCreate && isValidMobile(c.mobile)) ??
  candidates.find((c) => c.canCreate) ??
  candidates.find((c) => !c.isEmpty);

/**
 * Other students sharing this mobile — i.e. siblings.
 *
 * A parent with three children must end up with ONE login linked to three
 * students, never three logins. Mobile is the practical family key in this
 * data (it is what the Student Import engine dedupes families on), while
 * surname is not: it is unreliable across regions and remarriages.
 *
 * Not a guarantee of siblinghood — shared mobiles happen — which is why the UI
 * offers these for confirmation rather than linking them silently.
 */
export const findSiblings = (
  students: Student[],
  mobile: string,
  excludeStudentId?: string,
): Student[] => {
  const key = normalizeMobile(mobile);
  if (key.length !== 10) return [];
  return students.filter((s) => {
    if (s.id === excludeStudentId) return false;
    return [s.parentContact, s.parentContact2, s.motherContact, s.guardianContact]
      .map(normalizeMobile)
      .includes(key);
  });
};

/** An existing account for this person, matched on mobile then email. */
export const findExistingAccount = <T extends { mobile?: string; email?: string; loginEmail?: string }>(
  accounts: T[],
  mobile: string,
  email: string,
): T | undefined => {
  const m = normalizeMobile(mobile);
  if (m.length === 10) {
    const byMobile = accounts.find((a) => normalizeMobile(a.mobile) === m);
    if (byMobile) return byMobile;
  }
  const e = clean(email).toLowerCase();
  if (!e) return undefined;
  return accounts.find(
    (a) => clean(a.email).toLowerCase() === e || clean(a.loginEmail).toLowerCase() === e,
  );
};

/** Blocking gaps across a set of candidates — drives the red summary panel. */
export const summariseGaps = (
  candidates: ParentCandidate[],
): { blocking: MissingField[]; advisory: MissingField[] } => {
  const seen = new Set<string>();
  const blocking: MissingField[] = [];
  const advisory: MissingField[] = [];
  for (const c of candidates) {
    for (const m of c.missing) {
      const key = `${c.role}:${m.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = { ...m, label: `${c.roleLabel} — ${m.label}` };
      if (m.severity === "blocking") blocking.push(entry);
      else advisory.push(entry);
    }
  }
  return { blocking, advisory };
};
