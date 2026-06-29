// ──────────────────────────────────────────────────────────────────────────────
// DATA HEALTH + IMPORT DASHBOARD analytics (pure)
//
// `buildDataHealth` summarises the quality of an import preview (missing fields,
// duplicate parent records, students without a batch/year). `rowHealthIssues`
// lists the gaps for one row (drives the downloadable health report).
// `summarizeImports` aggregates the import-history batches for the dashboard.
// ──────────────────────────────────────────────────────────────────────────────

import type { ImportBatch } from "../types/student.types";
import type { ImportRowPreview } from "./importMapping";

const mobKey = (v?: string): string => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 7 ? (d.length > 10 ? d.slice(-10) : d) : "";
};

export interface DataHealth {
  total: number;
  missingParentMobile: number;
  missingEmail: number;
  missingDob: number;
  missingAdmission: number;
  missingRoll: number;
  missingBloodGroup: number;
  missingAddress: number;
  duplicateParentRecords: number;
  withoutBatch: number;
  withoutAcademicYear: number;
}

/** Per-row data-quality gaps — the rows of the downloadable health report. */
export function rowHealthIssues(r: ImportRowPreview): string[] {
  const s = r.student;
  const issues: string[] = [];
  if (!mobKey(s.parentContact || s.studentContact)) issues.push("Missing parent mobile");
  if (!s.parentEmail && !s.studentEmail) issues.push("Missing email");
  if (!s.dateOfBirth) issues.push("Missing DOB");
  if (!s.enrolmentNo && !s.grNo) issues.push("Missing admission number");
  if (!s.rollNumber) issues.push("Missing roll number");
  if (!s.bloodGroup) issues.push("Missing blood group");
  if (!s.address) issues.push("Missing address");
  if (!r.resolved.batchId && !s.batchId) issues.push("Without batch");
  if (!r.resolved.academicYearId) issues.push("Without academic year");
  return issues;
}

/** Aggregate data-health metrics over the importable rows. */
export function buildDataHealth(rows: ImportRowPreview[]): DataHealth {
  const importable = rows.filter((r) => r.status !== "error");
  const mobileCounts = new Map<string, number>();
  for (const r of importable) {
    const k = mobKey(r.student.parentContact || r.student.studentContact);
    if (k) mobileCounts.set(k, (mobileCounts.get(k) ?? 0) + 1);
  }
  let duplicateParentRecords = 0;
  for (const r of importable) {
    const k = mobKey(r.student.parentContact || r.student.studentContact);
    if (k && (mobileCounts.get(k) ?? 0) > 1) duplicateParentRecords += 1;
  }

  const count = (pred: (r: ImportRowPreview) => boolean) => importable.filter(pred).length;
  return {
    total: importable.length,
    missingParentMobile: count((r) => !mobKey(r.student.parentContact || r.student.studentContact)),
    missingEmail: count((r) => !r.student.parentEmail && !r.student.studentEmail),
    missingDob: count((r) => !r.student.dateOfBirth),
    missingAdmission: count((r) => !r.student.enrolmentNo && !r.student.grNo),
    missingRoll: count((r) => !r.student.rollNumber),
    missingBloodGroup: count((r) => !r.student.bloodGroup),
    missingAddress: count((r) => !r.student.address),
    duplicateParentRecords,
    withoutBatch: count((r) => !r.resolved.batchId && !r.student.batchId),
    withoutAcademicYear: count((r) => !r.resolved.academicYearId),
  };
}

export interface ImportDashboard {
  totalImports: number;
  studentsImported: number;
  updated: number;
  skipped: number;
  families: number;
  rolledBack: number;
  avgProcessingMs: number;
  totalErrors: number;
}

/** Aggregate the import-history batches for the dashboard. */
export function summarizeImports(history: ImportBatch[]): ImportDashboard {
  const active = history.filter((b) => b.status !== "rolled_back");
  const sum = (pick: (b: ImportBatch) => number) => history.reduce((n, b) => n + pick(b), 0);
  const durations = active.map((b) => b.durationMs ?? 0).filter((d) => d > 0);
  return {
    totalImports: history.length,
    studentsImported: sum((b) => b.successRows ?? 0),
    updated: sum((b) => b.updatedRows ?? 0),
    skipped: sum((b) => b.skippedRows ?? 0),
    families: sum((b) => b.families ?? 0),
    rolledBack: history.filter((b) => b.status === "rolled_back").length,
    avgProcessingMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    totalErrors: sum((b) => b.errorRows ?? 0),
  };
}
