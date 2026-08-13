// ── Regression: the parent's receipt IS the institution's receipt ────────────
//
// TWO DEFECTS ARE PINNED HERE, because the fix for the first created the second.
//
// 1. A SECOND DESIGN.
//    ParentFeesPage hand-built its own receipt HTML: a plain table with its own
//    field list, its own footer and its own amount tile. It was tenant-branded,
//    so it was not *wrong* — but the proof of payment a parent downloaded looked
//    nothing like the receipt the front desk issues for the very same payment,
//    and every improvement to the real receipt (logo, signatory, amount in
//    words, the meta grid) silently skipped the parent-facing one.
//
// 2. THE WRONG DELIVERY.
//    Replacing it with the canonical receipt rendered into a POPUP WINDOW fixed
//    the document and broke the interaction: a parent tapping "Receipt" on a
//    phone got a new tab, and often a pop-up blocker warning instead of their
//    receipt.
//
// The page now opens `FeeReceiptDialog` INLINE — the same component the staff
// receipt uses — so the receipt appears in place, with Print and Download on it.
//
// Pinned at source level: the dialog is lazy-loaded and rasterises through
// html2canvas, so asserting on the rendered DOM would test jsdom, not the design.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PAGE = read("src/features/parent-portal/pages/ParentFeesPage.tsx");
const RECEIPT_UTIL = read("src/features/fee/utils/receipt.ts");
const DIALOG = read("src/features/fee/components/FeeReceiptDialog.tsx");

describe("the parent sees the receipt immediately, in place", () => {
  it("mounts the shared FeeReceiptDialog", () => {
    expect(PAGE).toMatch(/FeeReceiptDialog/);
    expect(PAGE).toMatch(/<FeeReceiptDialog\s+receipt=/);
  });

  it("never sends the parent to another tab or window", () => {
    // The whole point: no popup, nothing to unblock, no navigation away.
    expect(PAGE).not.toMatch(/openReportWindow/);
    expect(PAGE).not.toMatch(/renderReportWindow/);
    expect(PAGE).not.toMatch(/window\.open/);
  });

  it("does not hand-roll a second receipt document", () => {
    // The tells of the original bespoke builder.
    expect(PAGE).not.toMatch(/<!doctype html>/i);
    expect(PAGE).not.toMatch(/Computer-generated receipt/);
    expect(PAGE).not.toMatch(/buildReceiptTheme/);
  });

  it("closes by clearing the receipt, so the dialog can reopen", () => {
    // `onOpenChange` that never nulls the state leaves a dialog that opens once
    // and then refuses to open again for the same payment.
    expect(PAGE).toMatch(/onOpenChange=\{\(o\)\s*=>\s*!o\s*&&\s*setReceipt\(null\)\}/);
  });

  it("still audits the download", () => {
    // The receipt is a record of a payment; who opened it stays logged.
    expect(PAGE).toMatch(/download_receipt/);
  });
});

describe("the heavy PDF vendors stay out of the parent's bundle", () => {
  it("loads the dialog lazily", () => {
    // FeeReceiptDialog pulls html2canvas + jsPDF for its download actions. A
    // static import would ship ~600 kB to a page parents open on mobile data
    // just to check a balance.
    expect(PAGE).toMatch(/lazy\(loadReceiptDialog\)/);
    expect(PAGE).toMatch(/import\("@\/features\/fee\/components\/FeeReceiptDialog"\)/);
    expect(PAGE).toMatch(/<Suspense/);
  });

  it("prefetches the chunk only when receipts exist", () => {
    // Warmed so the tap feels instant, but never fetched for a child with no
    // payments recorded.
    expect(PAGE).toMatch(/hasReceipts/);
    expect(PAGE).toMatch(/if \(hasReceipts\) void loadReceiptDialog\(\)/);
  });

  it("mounts the dialog only once a receipt is chosen", () => {
    expect(PAGE).toMatch(/\{receipt && \(/);
  });
});

describe("one receipt design across every delivery route", () => {
  it("the staff dialog and any print surface share one page shell", () => {
    expect(DIALOG).toMatch(/receiptPrintDocument\(/);
    expect(RECEIPT_UTIL).toMatch(/export const receiptPrintDocument/);
    // The dialog must not carry its own inline print document any more.
    expect(DIALOG).not.toMatch(/<!doctype html>/i);
  });

  it("the shell prints itself and keeps brand colours in print", () => {
    const shell = RECEIPT_UTIL.slice(
      RECEIPT_UTIL.indexOf("export const receiptPrintDocument"),
      RECEIPT_UTIL.indexOf("export const receiptToPdfBlob"),
    );
    expect(shell).toMatch(/window\.print\(\)/);
    // Without this browsers strip the tenant's header colour from the printout.
    expect(shell).toMatch(/print-color-adjust:exact/);
  });

  it("ReceiptBody stays exported for reuse", () => {
    // Three surfaces depend on it: the dialog, the emailed PDF, and this page
    // through the dialog. Un-exporting it would fork the design again.
    expect(DIALOG).toMatch(/export const ReceiptBody/);
  });
});
