// ──────────────────────────────────────────────────────────────────────────────
// INVOICES + BACKUPS — the gates for two pages that were reserved
//
// Both pages made claims in prose before they could act on them. This file
// pins the two rules that carry legal or operational weight:
//
//   • an invoice series is gapless, and the console can PROVE it rather than
//     restate the design;
//   • a restore rehearsal is due on a schedule, a failed one does not count,
//     and an untimed one is not a passing RTO measurement.
//
// Both are computed by pure functions precisely because the interesting cases
// — a gap, a failed restore, eleven months of silence — are the ones nobody
// can conveniently reproduce against a real system.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  checkInvoiceIntegrity,
  describeIssue,
  invoiceSerial,
} from "../modules/invoiceIntegrity";
import {
  recoveryPosture,
  meetsRto,
  measuredRto,
  formatDuration,
} from "../modules/recoveryPosture";
import { amountInWords } from "@/features/billing/documents/invoicePdf";
import {
  DR_DEFAULTS,
  type DrPolicy,
  type DrRehearsal,
  type InvoiceSequence,
  type PlatformInvoice,
} from "../services/platform.service";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Source with comments removed, for gates that must not match prose. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ORG = "org-1";

const invoice = (n: string, over: Partial<PlatformInvoice> = {}): PlatformInvoice => ({
  id: `i-${n}`,
  organizationId: ORG,
  organizationName: "Acme Academy",
  organizationSlug: "acme",
  subscriptionId: "s-1",
  number: n,
  status: "issued",
  currency: "INR",
  subtotal: 1000,
  discountTotal: 0,
  taxTotal: 180,
  total: 1180,
  cgst: 90,
  sgst: 90,
  igst: 0,
  gstTreatment: "cgst_sgst",
  placeOfSupply: "33",
  gstin: null,
  financialYear: "2026-27",
  periodStart: null,
  periodEnd: null,
  issuedAt: "2026-05-01T00:00:00Z",
  dueAt: null,
  paidAt: null,
  notes: null,
  provider: null,
  providerPaymentId: null,
  pdfPath: null,
  emailedAt: null,
  createdAt: "2026-05-01T00:00:00Z",
  ...over,
});

const seq = (last: number, over: Partial<InvoiceSequence> = {}): InvoiceSequence => ({
  organizationId: ORG,
  financialYear: "2026-27",
  prefix: "ACME",
  lastNumber: last,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
// 1 — INVOICE NUMBERING
// ════════════════════════════════════════════════════════════════════════════

describe("Invoice serials parse the way the database writes them", () => {
  it("reads the trailing counter", () => {
    expect(invoiceSerial("ACME/2026-27/0001")).toBe(1);
    expect(invoiceSerial("ACME/2026-27/0042")).toBe(42);
    expect(invoiceSerial("A/2026-27/1234")).toBe(1234);
  });

  it("refuses anything else rather than guessing", () => {
    // A wrong guess here would silently reshape the gap report.
    expect(invoiceSerial("ACME-2026-0001")).toBeNull();
    expect(invoiceSerial("ACME/2026-27/")).toBeNull();
    expect(invoiceSerial("ACME/2026-27/0000")).toBeNull();
    expect(invoiceSerial("")).toBeNull();
  });
});

describe("The gapless check proves the sequence", () => {
  it("passes a complete series", () => {
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0001"), invoice("ACME/2026-27/0002")],
      [seq(2)],
    );
    expect(r.ok).toBe(true);
    expect(r.seriesWithIssues).toBe(0);
    expect(r.series[0].issued).toBe(2);
  });

  it("catches a missing number", () => {
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0001"), invoice("ACME/2026-27/0003")],
      [seq(3)],
    );
    expect(r.ok).toBe(false);
    expect(r.series[0].issues).toContainEqual({ kind: "gap", serials: [2] });
  });

  it("counts a VOIDED invoice as issued", () => {
    // Voiding is the correct way to cancel, precisely BECAUSE the number stays.
    // Treating it as a gap would flag the compliant procedure as a violation
    // and push an operator toward deleting instead — the thing that actually
    // breaks the law.
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0001", { status: "void" }), invoice("ACME/2026-27/0002")],
      [seq(2)],
    );
    expect(r.ok).toBe(true);
  });

  it("ignores drafts, which have no number yet by design", () => {
    const r = checkInvoiceIntegrity(
      [
        invoice("ACME/2026-27/0001"),
        invoice("", { status: "draft", id: "draft-1" }),
      ],
      [seq(1)],
    );
    expect(r.ok).toBe(true);
  });

  it("catches two invoices sharing a number", () => {
    const r = checkInvoiceIntegrity(
      [
        invoice("ACME/2026-27/0001"),
        invoice("ACME/2026-27/0001", { id: "dupe" }),
        invoice("ACME/2026-27/0002"),
      ],
      [seq(2)],
    );
    expect(r.series[0].issues).toContainEqual({ kind: "duplicate", serials: [1] });
  });

  it("catches an invoice numbered past its counter", () => {
    // The signature of a restore that replayed invoices without the sequence
    // table — and the next issuance would collide.
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0001"), invoice("ACME/2026-27/0009")],
      [seq(1)],
    );
    expect(r.series[0].issues).toContainEqual({ kind: "beyond_counter", serials: [9] });
  });

  it("catches invoices whose series has no counter at all", () => {
    const r = checkInvoiceIntegrity([invoice("ACME/2026-27/0001")], []);
    expect(r.ok).toBe(false);
    expect(r.series[0].issues[0].kind).toBe("orphan_series");
  });

  it("catches a number nothing in this system would have written", () => {
    const r = checkInvoiceIntegrity([invoice("MANUAL-001")], [seq(1)]);
    expect(r.series[0].issues).toContainEqual({ kind: "unparseable", numbers: ["MANUAL-001"] });
  });

  it("keeps organizations and financial years apart", () => {
    // Two tenants each numbering from 0001 is correct, not a duplicate.
    const other = invoice("BETA/2026-27/0001", { id: "b1", organizationId: "org-2" });
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0001"), other],
      [seq(1), seq(1, { organizationId: "org-2", prefix: "BETA" })],
    );
    expect(r.ok).toBe(true);
    expect(r.series).toHaveLength(2);
  });

  it("says something actionable about every issue", () => {
    const r = checkInvoiceIntegrity(
      [invoice("ACME/2026-27/0002")],
      [seq(2)],
    );
    for (const s of r.series) {
      for (const issue of s.issues) {
        const msg = describeIssue(issue);
        expect(msg.length, issue.kind).toBeGreaterThan(30);
      }
    }
  });

  it("reports nothing at all when there is nothing to report", () => {
    const r = checkInvoiceIntegrity([], []);
    expect(r.ok).toBe(true);
    expect(r.series).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — AMOUNT IN WORDS
// ════════════════════════════════════════════════════════════════════════════

describe("Amounts are spelled the way an Indian invoice must", () => {
  it("uses lakh and crore, not the short scale", () => {
    // "One hundred thousand" on an Indian tax invoice is wrong.
    expect(amountInWords(100000)).toBe("One Lakh Rupees Only");
    expect(amountInWords(10000000)).toBe("One Crore Rupees Only");
    expect(amountInWords(125000)).toBe("One Lakh Twenty Five Thousand Rupees Only");
  });

  it("carries paise when there are any", () => {
    expect(amountInWords(1180.5)).toBe("One Thousand One Hundred Eighty Rupees and Fifty Paise Only");
    expect(amountInWords(1180)).toBe("One Thousand One Hundred Eighty Rupees Only");
  });

  it("handles zero and the teens", () => {
    expect(amountInWords(0)).toBe("Zero Rupees Only");
    expect(amountInWords(15)).toBe("Fifteen Rupees Only");
    expect(amountInWords(90)).toBe("Ninety Rupees Only");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — RECOVERY POSTURE
// ════════════════════════════════════════════════════════════════════════════

const policy: DrPolicy = { ...DR_DEFAULTS };

const rehearsal = (daysAgo: number, over: Partial<DrRehearsal> = {}): DrRehearsal => ({
  id: `r-${daysAgo}`,
  performedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  performedBy: "ops@smartark.ai",
  restoredTo: "2026-08-01 14:30 IST",
  outcome: "pass",
  minutesToRestore: 95,
  notes: null,
  ...over,
});

describe("Recovery posture answers 'are we covered'", () => {
  it("treats never having rehearsed as overdue, not as unknown", () => {
    // The page previously stated the requirement and could not tell you it had
    // never been met. Silence must not read as compliance.
    const p = recoveryPosture(policy, []);
    expect(p.level).toBe("overdue");
    expect(p.nextDue).toBeNull();
    expect(p.headline).toMatch(/has ever been rehearsed/i);
  });

  it("is verified inside the interval", () => {
    const p = recoveryPosture(policy, [rehearsal(3)]);
    expect(p.level).toBe("verified");
    expect(p.daysUntilDue).toBe(27);
  });

  it("warns before it lapses, not after", () => {
    const p = recoveryPosture(policy, [rehearsal(25)]);
    expect(p.level).toBe("due_soon");
    expect(p.daysUntilDue).toBe(5);
  });

  it("goes overdue past the interval and says by how much", () => {
    const p = recoveryPosture(policy, [rehearsal(45)]);
    expect(p.level).toBe("overdue");
    expect(p.daysUntilDue).toBe(-15);
    expect(p.headline).toMatch(/15 days/);
  });

  it("reports a FAILED rehearsal as its own level", () => {
    // Folding it into "overdue" would describe a scheduling slip and an
    // outage-in-waiting with the same words.
    const p = recoveryPosture(policy, [rehearsal(1, { outcome: "fail" }), rehearsal(20)]);
    expect(p.level).toBe("failing");
    expect(p.lastPass?.id).toBe("r-20");
  });

  it("does not let a failure reset the clock", () => {
    // Compliance dates from the last restore that WORKED.
    const p = recoveryPosture(policy, [rehearsal(1, { outcome: "fail" })]);
    expect(p.level).toBe("failing");
    expect(p.lastPass).toBeNull();
    expect(p.headline).toMatch(/never been demonstrated/i);
  });

  it("dates the next rehearsal from the last PASS, not the last attempt", () => {
    const p = recoveryPosture(policy, [rehearsal(29, { id: "old" })]);
    expect(p.level).toBe("due_soon");
    // A later failure must not extend it.
    const q = recoveryPosture(policy, [
      rehearsal(1, { id: "failed", outcome: "fail" }),
      rehearsal(29, { id: "old" }),
    ]);
    expect(q.level).toBe("failing");
  });

  it("honours a changed interval", () => {
    const weekly: DrPolicy = { ...policy, rehearsalIntervalDays: 7 };
    expect(recoveryPosture(weekly, [rehearsal(10)]).level).toBe("overdue");
    expect(recoveryPosture(weekly, [rehearsal(2)]).level).toBe("due_soon");
  });
});

describe("RTO is reported from evidence, not intent", () => {
  it("distinguishes untimed from within-target", () => {
    // "Unknown" and "met the target" must never look alike on a compliance page.
    expect(meetsRto(rehearsal(1, { minutesToRestore: null }), policy)).toBeNull();
    expect(meetsRto(rehearsal(1, { minutesToRestore: 95 }), policy)).toBe(true);
    expect(meetsRto(rehearsal(1, { minutesToRestore: 400 }), policy)).toBe(false);
  });

  it("reports the WORST measured restore, not the best", () => {
    const m = measuredRto([
      rehearsal(1, { minutesToRestore: 30 }),
      rehearsal(2, { minutesToRestore: 300 }),
    ]);
    expect(m).toEqual({ worstMinutes: 300, measured: 2 });
  });

  it("ignores failed and untimed rehearsals in the measurement", () => {
    expect(
      measuredRto([
        rehearsal(1, { outcome: "fail", minutesToRestore: 999 }),
        rehearsal(2, { minutesToRestore: null }),
      ]),
    ).toBeNull();
  });

  it("formats durations an operator reads at a glance", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(95)).toBe("1 h 35 min");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — BUILD GATES
// ════════════════════════════════════════════════════════════════════════════

describe("Nothing is wired up half-way", () => {
  it("both pages are mounted from their own modules", () => {
    const routes = read("src/features/platform/routes.tsx");
    expect(routes).toContain('import("./pages/InvoicesPage")');
    expect(routes).toContain('import("./pages/BackupsPage")');
    // The reserved stubs are gone, not merely shadowed.
    expect(read("src/features/platform/pages/CommercePages.tsx")).not.toContain(
      "export const InvoicesPage",
    );
    expect(read("src/features/platform/pages/OperationsPages.tsx")).not.toContain(
      "export const BackupsPage",
    );
  });

  it("invoices are never inserted from the client", () => {
    // A number written outside `issue_invoice()` draws nothing from the
    // counter, and a hand-written number is exactly the gap GST forbids.
    const svc = read("src/features/platform/services/platform.service.ts");
    const block = svc.slice(svc.indexOf("// ── Invoices ──"), svc.indexOf("// ── Backups"));
    expect(block).toContain('supabase.rpc("issue_invoice"');
    expect(block).not.toMatch(/from\("invoices"[\s\S]{0,200}\.insert\(/);
    // …and never deleted: an issued invoice is a statutory record.
    expect(block).not.toMatch(/from\("invoices"[\s\S]{0,200}\.delete\(/);
  });

  it("a status write proves it actually happened", () => {
    // An RLS-filtered UPDATE returns 204 with a null error, so without the
    // select an unauthorised change reports success.
    const svc = read("src/features/platform/services/platform.service.ts");
    expect(svc).toMatch(/setInvoiceStatus[\s\S]{0,900}\.select\("id"\)/);
  });

  it("the export migration exists and is not reachable by a tenant", () => {
    const path = "supabase/migrations/20261011_organization_export.sql";
    expect(existsSync(join(ROOT, path)), `${path} is missing`).toBe(true);
    const sql = read(path);
    // SECURITY DEFINER + STABLE: Postgres itself rejects a write inside it.
    expect(sql).toMatch(/STABLE\s+SECURITY DEFINER/);
    // CREATE FUNCTION grants EXECUTE to PUBLIC by default. Leaving that would
    // make a whole-tenant dump callable by any authenticated session.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.platform_export_organization\(uuid\)\s+FROM PUBLIC/);
    expect(sql).toMatch(/FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.platform_export_organization\(uuid\)\s+TO service_role/);
  });

  it("export shares the purge's definition of the tenant's data", () => {
    // Divergence here is asymmetric and silent: export would omit a table that
    // purge still erases, so a "complete" export would be missing records that
    // were then destroyed.
    const exp = read("supabase/migrations/20261011_organization_export.sql");
    const purge = read("supabase/migrations/20261010_organization_purge.sql");
    for (const clause of [
      "c.column_name = 'organization_id'",
      "t.table_type = 'BASE TABLE'",
    ]) {
      expect(exp, `export lost: ${clause}`).toContain(clause);
      expect(purge, `purge lost: ${clause}`).toContain(clause);
    }
  });

  it("the export action is owner-gated and audited even on a preview", () => {
    const fn = read("supabase/functions/platform-admin/index.ts");
    const block = fn.slice(fn.indexOf('action === "export_organization"'));
    expect(block).toContain('need("organizations.purge")');
    // "Who looked at how much data this tenant has" is worth recording — a
    // manifest is reconnaissance for the real thing.
    expect(block).toContain("organization.export_preview");
    expect(block).toContain("organization.export");
    // The disclosing call must be asked for, never the default.
    expect(block).toContain("dryRun !== false");
  });

  it("the invoice PDF is drawn, not rasterised", () => {
    // A tax invoice must be selectable text: a customer files it, an
    // accountant reads it, a portal may parse it for input tax credit. It is
    // also the difference between ~40 KB and the ~4.8 MB that stopped emailed
    // receipts sending at all.
    //
    // Comments are stripped first — this file DISCUSSES html2canvas in its
    // header, and a gate that cannot tell prose from code is a gate that fires
    // on the explanation of why the code is right.
    const pdf = stripComments(read("src/features/billing/documents/invoicePdf.ts"));
    expect(pdf).not.toContain("html2canvas");
    expect(pdf).not.toContain("addImage");
    expect(pdf).toContain("documentPdfOptions");
  });

  it("both audiences render the invoice through one path", () => {
    // The tenant's billing summary carries a REDUCED invoice shape with none
    // of the GST detail, so rendering from whatever each caller held would
    // produce two different documents under one invoice number.
    const console_ = read("src/features/platform/pages/InvoicesPage.tsx");
    const tenant = read("src/features/billing/pages/BillingPage.tsx");
    expect(console_).toContain("invoiceDownloadService.download");
    expect(tenant).toContain("invoiceDownloadService.download");
    // The old dead link is gone: it only rendered when `pdf_path` was set, and
    // nothing has ever set it.
    expect(tenant).not.toMatch(/href=\{i\.pdf_path\}/);
  });
});
