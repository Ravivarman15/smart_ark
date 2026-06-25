// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL ANOMALY DETECTION
//
// Pure predicates that surface the warning badges the Approval Center shows
// before Management signs off. Catching these *before* approval is the whole
// point of the review stage — a 40% jump or a negative net never reaches the
// bank file unnoticed.
//
//   • salary increase / decrease > 20% vs the previous month
//   • negative net salary
//   • bonus greater than the basic salary
//   • missing attendance for the period
//   • missing bank / PAN / Aadhaar (only when identity presence is KNOWN false —
//     unknown presence is never flagged, so the schema can add these later)
//   • duplicate employee across rows (same email) — cross-row, see findDuplicates
// ─────────────────────────────────────────────────────────────────────────────

import type { AnomalyFlag, IdentityPresence } from "../types/payroll.types";

/** A change beyond ±this percent vs last month is flagged for review. */
export const ANOMALY_THRESHOLD_PCT = 20;

export interface AnomalyInput {
  netSalary: number;
  previousNet: number;
  basicSalary: number;
  bonus: number;
  presentDays: number;
  workedMinutes: number;
  identity?: IdentityPresence;
}

export const detectAnomalies = (i: AnomalyInput): AnomalyFlag[] => {
  const flags: AnomalyFlag[] = [];

  // Month-over-month swing — only meaningful when there is a prior figure.
  if (i.previousNet > 0) {
    const pct = ((i.netSalary - i.previousNet) / i.previousNet) * 100;
    if (pct > ANOMALY_THRESHOLD_PCT) {
      flags.push({
        type: "increase_gt_20",
        severity: "warning",
        label: `Up ${Math.round(pct)}%`,
        detail: "Net salary rose more than 20% over last month.",
      });
    } else if (pct < -ANOMALY_THRESHOLD_PCT) {
      flags.push({
        type: "decrease_gt_20",
        severity: "warning",
        label: `Down ${Math.round(Math.abs(pct))}%`,
        detail: "Net salary fell more than 20% from last month.",
      });
    }
  }

  if (i.netSalary < 0) {
    flags.push({
      type: "negative_salary",
      severity: "critical",
      label: "Negative net",
      detail: "Deductions exceed earnings.",
    });
  }

  if (i.bonus > 0 && i.basicSalary > 0 && i.bonus > i.basicSalary) {
    flags.push({
      type: "bonus_gt_salary",
      severity: "warning",
      label: "Bonus > basic",
      detail: "One-time bonus is larger than the basic salary.",
    });
  }

  if (i.presentDays <= 0 && i.workedMinutes <= 0) {
    flags.push({
      type: "missing_attendance",
      severity: "warning",
      label: "No attendance",
      detail: "No attendance recorded for this period.",
    });
  }

  if (i.identity?.hasBank === false) {
    flags.push({ type: "missing_bank", severity: "warning", label: "No bank details" });
  }
  if (i.identity?.hasPan === false) {
    flags.push({ type: "missing_pan", severity: "warning", label: "No PAN" });
  }
  if (i.identity?.hasAadhaar === false) {
    flags.push({ type: "missing_aadhaar", severity: "warning", label: "No Aadhaar" });
  }

  return flags;
};

// ── Cross-row duplicate detection ────────────────────────────────────────────

export interface DuplicateInput {
  staffId: string;
  employeeCode?: string;
  email?: string;
}

/**
 * Returns the set of staff ids that collide with another DISTINCT staff id on
 * the same email or employee code — i.e. the same person paid twice. (The DB's
 * UNIQUE(run_id, staff_id) already stops the same id appearing twice.)
 */
export const findDuplicateStaffIds = (rows: DuplicateInput[]): Set<string> => {
  const byKey = new Map<string, Set<string>>();
  const add = (raw: string | undefined, id: string) => {
    const key = (raw ?? "").trim().toLowerCase();
    if (!key) return;
    const set = byKey.get(key) ?? new Set<string>();
    set.add(id);
    byKey.set(key, set);
  };
  for (const r of rows) {
    add(r.email, r.staffId);
    add(r.employeeCode, r.staffId);
  }
  const dup = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.size > 1) ids.forEach((id) => dup.add(id));
  }
  return dup;
};

export const DUPLICATE_FLAG: AnomalyFlag = {
  type: "duplicate_employee",
  severity: "critical",
  label: "Duplicate employee",
  detail: "Another payroll line shares this employee's email or code.",
};
