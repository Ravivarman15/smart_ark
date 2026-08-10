// ──────────────────────────────────────────────────────────────────────────────
// FAMILY GROUPING — pure, no I/O.
//
// ┌── THE PROBLEM ─────────────────────────────────────────────────────────┐
// │ A parent with three children at the institute receives three separate  │
// │ WhatsApp messages when all three are marked absent. From the parent's  │
// │ side that is spam from a number they are meant to trust, and it is the │
// │ single most common complaint about school messaging.                   │
// └────────────────────────────────────────────────────────────────────────┘
//
// Grouping is a TEMPLATE CAPABILITY, not a global behaviour. Consolidation is
// right for "here is today's attendance across your children" and wrong for a
// fee receipt, an exam result or a credential — those are inherently about ONE
// student, and merging them produces a message that is either ambiguous or
// leaks one child's data into another's context.
//
// Deliberately pure so it is testable without a database, and deliberately NOT
// a separate send path — it collapses the candidate list before the existing
// dispatcher runs, so dedupe, quiet hours, preference and audit are unchanged.
// ──────────────────────────────────────────────────────────────────────────────

import type { RecipientCandidate } from "../types/communication.types";

/** Events whose message is about the FAMILY's day, not one student's record. */
export const FAMILY_GROUPED_EVENTS = new Set<string>([
  "attendance_absent",
  "attendance_present",
]);

export function supportsFamilyGrouping(eventKey: string): boolean {
  return FAMILY_GROUPED_EVENTS.has(eventKey);
}

export interface GroupedFamily {
  /** The candidate that will actually receive the message. */
  recipient: RecipientCandidate;
  /** Every student this message covers, in name order. */
  students: RecipientCandidate[];
}

/**
 * Digits only, so "+91 98765 43210", "09876543210" and "9876543210" are
 * recognised as one parent. Without this the grouping silently does nothing
 * for most real data, because the same parent's number is stored differently
 * across imports.
 */
const phoneKey = (phone?: string): string | null => {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10); // last 10 — normalises the country code away
};

/**
 * Collapse candidates sharing a parent phone number into one recipient each.
 *
 * Returns groups in the input's original order. A candidate with no usable
 * phone is returned as its own group untouched — validation downstream will
 * reject it with a proper reason, and silently dropping it here would hide
 * that from the pre-flight count.
 */
export function groupByFamily(candidates: RecipientCandidate[]): GroupedFamily[] {
  const byPhone = new Map<string, GroupedFamily>();
  const out: GroupedFamily[] = [];

  for (const c of candidates) {
    const key = phoneKey(c.phone);
    if (!key) {
      out.push({ recipient: c, students: [c] });
      continue;
    }
    const existing = byPhone.get(key);
    if (existing) {
      existing.students.push(c);
      continue;
    }
    const group: GroupedFamily = { recipient: c, students: [c] };
    byPhone.set(key, group);
    out.push(group);
  }

  for (const g of out) {
    g.students.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

/**
 * "Arjun — Absent" per line, for a template that renders a child list.
 *
 * Kept as a single joined string rather than a structured field because Meta
 * template parameters are flat strings — a positional parameter cannot carry
 * a list, so the list has to arrive pre-formatted.
 */
export function renderStudentLines(
  students: RecipientCandidate[],
  statusFor: (c: RecipientCandidate) => string,
): string {
  return students.map((s) => `${s.name} — ${statusFor(s)}`).join("\n");
}

/**
 * Apply grouping to a resolved audience.
 *
 * Only the first student of each family survives as a recipient; the rest are
 * folded into its variables as `student_list` and `student_count`. The
 * surviving candidate keeps its own id, so dedupe still works per family.
 */
export function applyFamilyGrouping(
  recipients: RecipientCandidate[],
  variablesByRecipient: Record<string, Record<string, string>>,
  statusKey = "attendance_status",
): {
  recipients: RecipientCandidate[];
  variablesByRecipient: Record<string, Record<string, string>>;
  collapsed: number;
} {
  const groups = groupByFamily(recipients);
  const outRecipients: RecipientCandidate[] = [];
  const outVars: Record<string, Record<string, string>> = {};
  let collapsed = 0;

  for (const g of groups) {
    outRecipients.push(g.recipient);
    const base = variablesByRecipient[g.recipient.id] ?? {};
    if (g.students.length === 1) {
      outVars[g.recipient.id] = base;
      continue;
    }
    collapsed += g.students.length - 1;
    outVars[g.recipient.id] = {
      ...base,
      student_list: renderStudentLines(
        g.students,
        (s) => variablesByRecipient[s.id]?.[statusKey] ?? "",
      ),
      // Comma list for templates that read better inline than as a block.
      student_names: g.students.map((s) => s.name).join(", "),
      student_count: String(g.students.length),
    };
  }

  return { recipients: outRecipients, variablesByRecipient: outVars, collapsed };
}
