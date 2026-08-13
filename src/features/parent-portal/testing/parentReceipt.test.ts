// ── Regression: the parent's receipt IS the institution's receipt ────────────
//
// THE DRIFT THIS PINS
// ParentFeesPage hand-built its own receipt HTML: a plain table with its own
// field list, its own footer and its own amount tile. It was tenant-branded, so
// it was not *wrong* — but it was a SECOND design. The proof of payment a parent
// downloaded looked nothing like the receipt the front desk issues for the very
// same payment, and every improvement to the real receipt (logo, signatory,
// amount-in-words, the meta grid) silently skipped the parent-facing one.
//
// The receipt now renders the canonical `ReceiptBody` — the same component
// behind the staff dialog and the emailed PDF — through
// `receiptToBrandedPrintHtml`. Three delivery routes, one document.
//
// Pinned at source level because the renderer mounts React off-screen and rasters
// through html2canvas; asserting on the DOM would test jsdom, not the design.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PAGE = read("src/features/parent-portal/pages/ParentFeesPage.tsx");
const RECEIPT_UTIL = read("src/features/fee/utils/receipt.ts");
const DIALOG = read("src/features/fee/components/FeeReceiptDialog.tsx");

describe("the parent portal renders the canonical branded receipt", () => {
  it("calls the shared renderer", () => {
    expect(PAGE).toMatch(/receiptToBrandedPrintHtml\(/);
  });

  it("does not hand-roll a second receipt document", () => {
    // The tells of the old bespoke builder. Any of them reappearing means a
    // parallel design is back.
    expect(PAGE).not.toMatch(/<!doctype html>/i);
    expect(PAGE).not.toMatch(/Computer-generated receipt/);
    expect(PAGE).not.toMatch(/buildReceiptTheme/);
  });

  it("opens the print window synchronously, before awaiting the render", () => {
    // A popup opened after an await is blocked by the browser — the app-wide
    // blank-print bug that openReportWindow exists to prevent.
    const fn = PAGE.slice(PAGE.indexOf("const printReceipt"), PAGE.indexOf("if (!activeChild"));
    expect(fn.indexOf("openReportWindow()")).toBeGreaterThan(-1);
    expect(fn.indexOf("openReportWindow()")).toBeLessThan(fn.indexOf("await receiptToBrandedPrintHtml"));
  });

  it("closes the window and tells the parent when the render fails", () => {
    // Otherwise the parent is left staring at "Preparing your report…" forever.
    const fn = PAGE.slice(PAGE.indexOf("const printReceipt"), PAGE.indexOf("if (!activeChild"));
    expect(fn).toMatch(/catch/);
    expect(fn).toMatch(/closeReportWindow\(/);
  });

  it("still audits the download", () => {
    // The receipt is a record of a payment; who fetched it stays logged.
    expect(PAGE).toMatch(/download_receipt/);
  });
});

describe("one receipt design across every delivery route", () => {
  it("the branded renderer mounts ReceiptBody itself", () => {
    const fn = RECEIPT_UTIL.slice(
      RECEIPT_UTIL.indexOf("export const receiptToBrandedPrintHtml"),
      RECEIPT_UTIL.indexOf("export const receiptToPdfBlob"),
    );
    expect(fn).toMatch(/ReceiptBody/);
    expect(fn).toMatch(/waitForImages\(/);
    // Unmounted and removed, or a print leaks a detached React root per click.
    expect(fn).toMatch(/root\.unmount\(\)/);
    expect(fn).toMatch(/host\.remove\(\)/);
  });

  it("takes branding as a required parameter rather than resolving it inside", () => {
    // An optional prop with a default is exactly how a hardcoded tenant name
    // survives a refactor — the failure this whole document family had before.
    const sig = RECEIPT_UTIL.slice(
      RECEIPT_UTIL.indexOf("export const receiptToBrandedPrintHtml"),
      RECEIPT_UTIL.indexOf("): Promise<string> => {"),
    );
    expect(sig).toMatch(/branding:/);
    expect(sig).not.toMatch(/branding\?:/);
    expect(sig).not.toMatch(/branding\s*=/);
  });

  it("the staff dialog and the parent portal share one page shell", () => {
    expect(DIALOG).toMatch(/receiptPrintDocument\(/);
    expect(RECEIPT_UTIL).toMatch(/export const receiptPrintDocument/);
    // The dialog must not carry its own inline print document any more.
    expect(DIALOG).not.toMatch(/<!doctype html>/i);
  });

  it("the shell prints itself and keeps brand colours in print", () => {
    const shell = RECEIPT_UTIL.slice(
      RECEIPT_UTIL.indexOf("export const receiptPrintDocument"),
      RECEIPT_UTIL.indexOf("export const receiptToBrandedPrintHtml"),
    );
    expect(shell).toMatch(/window\.print\(\)/);
    // Without this browsers strip the tenant's header colour from the printout.
    expect(shell).toMatch(/print-color-adjust:exact/);
  });
});
