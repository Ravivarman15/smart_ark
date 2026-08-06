import { describe, it, expect } from "vitest";
import { objectPath, SIGNED_URL_TTL_SHORT, SIGNED_URL_TTL_EMAIL } from "./storageUrl";

// ─────────────────────────────────────────────────────────────────────────────
// objectPath() is the piece of Phase 0 that carries real data risk.
//
// Flipping `finance-attachments` and `support-attachments` private turned every
// previously-stored public URL into a dead link. Rather than migrate those rows
// (the URL is the only record of the object path), reads recover the path from
// whatever shape the column holds. If this function is wrong, historical
// attachments silently stop opening — and `remove()` uses it too, so a wrong
// answer there means orphaned objects or a delete against the wrong key.
// ─────────────────────────────────────────────────────────────────────────────

describe("objectPath", () => {
  const BUCKET = "finance-attachments";

  it("returns a bare path unchanged (the shape NEW rows store)", () => {
    expect(objectPath(BUCKET, "abc-123/1712345678_bill.pdf")).toBe(
      "abc-123/1712345678_bill.pdf",
    );
  });

  it("recovers the path from a legacy public URL (the shape OLD rows store)", () => {
    const legacy =
      "https://vxyshcucwdbpxrhddaeh.supabase.co/storage/v1/object/public/" +
      "finance-attachments/abc-123/1712345678_bill.pdf";
    expect(objectPath(BUCKET, legacy)).toBe("abc-123/1712345678_bill.pdf");
  });

  it("strips a query string — legacy download links carried ?download=", () => {
    const legacy =
      "https://x.supabase.co/storage/v1/object/public/payslips/run-1/item-2.pdf" +
      "?download=Payslip-May-2026.pdf";
    expect(objectPath("payslips", legacy)).toBe("run-1/item-2.pdf");
  });

  it("handles a signed-URL shape too, so re-signing an already-signed value works", () => {
    const signed =
      "https://x.supabase.co/storage/v1/object/sign/receipts/a/b.pdf?token=eyJhbGciOi";
    expect(objectPath("receipts", signed)).toBe("a/b.pdf");
  });

  it("returns empty string for null/undefined/empty so callers skip signing", () => {
    expect(objectPath(BUCKET, null)).toBe("");
    expect(objectPath(BUCKET, undefined)).toBe("");
    expect(objectPath(BUCKET, "")).toBe("");
  });

  it("does not confuse a different bucket's marker", () => {
    // A path that merely CONTAINS another bucket name must not be truncated.
    expect(objectPath("receipts", "receipts-archive/x.pdf")).toBe(
      "receipts-archive/x.pdf",
    );
  });

  it("strips leading slashes — Supabase rejects a path that starts with /", () => {
    expect(objectPath(BUCKET, "/abc/b.pdf")).toBe("abc/b.pdf");
  });

  it("keeps nested folder structure intact", () => {
    const legacy =
      "https://x.supabase.co/storage/v1/object/public/student-documents/" +
      "stu-1/2026/term-1/report.pdf";
    expect(objectPath("student-documents", legacy)).toBe(
      "stu-1/2026/term-1/report.pdf",
    );
  });
});

describe("signed URL TTLs", () => {
  it("short TTL is an hour — enough to click through a list on screen", () => {
    expect(SIGNED_URL_TTL_SHORT).toBe(3600);
  });

  it("email TTL is 30 days — payroll mail is opened days or weeks late", () => {
    expect(SIGNED_URL_TTL_EMAIL).toBe(2592000);
    // The whole point is that it is finite. A regression to a huge value would
    // recreate the permanent exposure Phase 0 removed.
    expect(SIGNED_URL_TTL_EMAIL).toBeLessThanOrEqual(60 * 60 * 24 * 90);
  });
});
