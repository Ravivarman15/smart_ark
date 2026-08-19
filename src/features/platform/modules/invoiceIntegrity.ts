// ──────────────────────────────────────────────────────────────────────────────
// INVOICE NUMBER INTEGRITY
//
// ┌── WHY THIS IS A SCREEN AND NOT A COMMENT ──────────────────────────────┐
// │ Indian GST requires invoice numbers to be gapless within a financial   │
// │ year. `next_invoice_number()` guarantees that by construction — one    │
// │ row per (organization, financial year), incremented under a row lock,  │
// │ drawn only at issuance so an abandoned draft cannot burn a number.     │
// │                                                                        │
// │ But "guaranteed by construction" is a claim, and the one place it can  │
// │ break is outside that function: a row inserted directly, a number      │
// │ edited, a restore that replayed the invoices but not the counter. Each │
// │ of those is silent. An auditor finding the gap first is the expensive  │
// │ way to learn about it.                                                 │
// │                                                                        │
// │ So the console PROVES the sequence on every load instead of asserting  │
// │ it: the counter says how many numbers were drawn, the invoices say     │
// │ which ones exist, and the two must agree exactly.                      │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure and synchronous so the rules can be tested without a database — which
// matters more here than usual, because the failure being checked for is one
// nobody can conveniently reproduce in production.
// ──────────────────────────────────────────────────────────────────────────────

import type { InvoiceSequence, PlatformInvoice } from "../services/platform.service";

/** `PREFIX/2026-27/0001` → 1. Null when the number is not in that shape. */
export const invoiceSerial = (number: string): number | null => {
  const m = /\/(\d+)$/.exec(number.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export type IntegrityIssue =
  /** A number the counter says was drawn, with no invoice carrying it. */
  | { kind: "gap"; serials: number[] }
  /** Two invoices claiming the same number. */
  | { kind: "duplicate"; serials: number[] }
  /** An invoice numbered beyond what the counter ever issued. */
  | { kind: "beyond_counter"; serials: number[] }
  /** An invoice number that does not parse — it cannot be checked at all. */
  | { kind: "unparseable"; numbers: string[] }
  /** Invoices exist for a (org, year) with no counter row behind them. */
  | { kind: "orphan_series"; numbers: string[] };

export interface SeriesIntegrity {
  organizationId: string;
  organizationName: string;
  financialYear: string;
  prefix: string;
  /** What the counter says was drawn. */
  lastNumber: number;
  /** How many invoices actually carry a number in this series. */
  issued: number;
  issues: IntegrityIssue[];
  ok: boolean;
}

export interface IntegrityReport {
  series: SeriesIntegrity[];
  /** True only when every series is clean. Nothing here is "mostly fine". */
  ok: boolean;
  seriesWithIssues: number;
}

const key = (org: string, fy: string) => `${org}::${fy}`;

/**
 * Check every series the counter knows about, plus any the invoices imply.
 *
 * A voided invoice still counts as issued: voiding is how a wrong invoice is
 * corrected precisely BECAUSE it leaves the number in place. Treating a void as
 * a gap would flag the correct procedure as a violation and push an operator
 * toward deleting instead, which is the thing that actually breaks the law.
 */
export const checkInvoiceIntegrity = (
  invoices: readonly PlatformInvoice[],
  sequences: readonly InvoiceSequence[],
  orgName: (id: string) => string = (id) => id,
): IntegrityReport => {
  const bySeries = new Map<string, PlatformInvoice[]>();
  for (const inv of invoices) {
    // Drafts have no number yet by design — they must not look like a gap.
    if (!inv.financialYear || inv.status === "draft") continue;
    const k = key(inv.organizationId, inv.financialYear);
    const list = bySeries.get(k) ?? [];
    list.push(inv);
    bySeries.set(k, list);
  }

  const series: SeriesIntegrity[] = [];
  const seen = new Set<string>();

  for (const seq of sequences) {
    const k = key(seq.organizationId, seq.financialYear);
    seen.add(k);
    const rows = bySeries.get(k) ?? [];
    const issues: IntegrityIssue[] = [];

    const unparseable: string[] = [];
    const counts = new Map<number, number>();
    for (const r of rows) {
      const s = invoiceSerial(r.number);
      if (s == null) unparseable.push(r.number);
      else counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    if (unparseable.length) issues.push({ kind: "unparseable", numbers: unparseable.sort() });

    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s);
    if (duplicates.length) issues.push({ kind: "duplicate", serials: duplicates.sort((a, b) => a - b) });

    const gaps: number[] = [];
    for (let n = 1; n <= seq.lastNumber; n++) if (!counts.has(n)) gaps.push(n);
    if (gaps.length) issues.push({ kind: "gap", serials: gaps });

    const beyond = [...counts.keys()].filter((s) => s > seq.lastNumber);
    if (beyond.length) issues.push({ kind: "beyond_counter", serials: beyond.sort((a, b) => a - b) });

    series.push({
      organizationId: seq.organizationId,
      organizationName: orgName(seq.organizationId),
      financialYear: seq.financialYear,
      prefix: seq.prefix,
      lastNumber: seq.lastNumber,
      issued: rows.length,
      issues,
      ok: issues.length === 0,
    });
  }

  // Invoices whose series has no counter row at all. Not a gap — something
  // worse: numbers exist that nothing is tracking, so the NEXT issuance will
  // start again at 0001 and collide.
  for (const [k, rows] of bySeries) {
    if (seen.has(k)) continue;
    const [organizationId, financialYear] = k.split("::");
    series.push({
      organizationId,
      organizationName: orgName(organizationId),
      financialYear,
      prefix: "—",
      lastNumber: 0,
      issued: rows.length,
      issues: [{ kind: "orphan_series", numbers: rows.map((r) => r.number).sort() }],
      ok: false,
    });
  }

  series.sort(
    (a, b) =>
      b.financialYear.localeCompare(a.financialYear) ||
      a.organizationName.localeCompare(b.organizationName),
  );

  const bad = series.filter((s) => !s.ok).length;
  return { series, ok: bad === 0, seriesWithIssues: bad };
};

/** One line an operator can act on, per issue. */
export const describeIssue = (issue: IntegrityIssue): string => {
  const list = (ns: (number | string)[]) =>
    ns.length <= 6 ? ns.join(", ") : `${ns.slice(0, 6).join(", ")} … (+${ns.length - 6})`;
  switch (issue.kind) {
    case "gap":
      return `Missing ${issue.serials.length} number${issue.serials.length === 1 ? "" : "s"} the counter says was issued: ${list(issue.serials)}. A gap is a GST exposure — find the deleted rows or file a written explanation.`;
    case "duplicate":
      return `Two invoices share ${issue.serials.length === 1 ? "number" : "numbers"} ${list(issue.serials)}. Void one and reissue.`;
    case "beyond_counter":
      return `Numbered past the counter: ${list(issue.serials)}. The counter was reset or restored behind the invoices — it must be raised to the highest number in use before the next issuance.`;
    case "unparseable":
      return `Not in PREFIX/FY/NNNN form: ${list(issue.numbers)}. These were not written by issue_invoice().`;
    case "orphan_series":
      return `${issue.numbers.length} invoice(s) exist with no counter row, so the next issuance would restart at 0001 and collide: ${list(issue.numbers)}.`;
  }
};
