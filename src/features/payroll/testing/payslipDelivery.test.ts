import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarisePayslipDelivery } from "../services/payrollEmail.service";
import type { PayslipEmailResult } from "../services/payrollEmail.service";
import { waitForImages } from "../utils/payslipPdf";

// ════════════════════════════════════════════════════════════════════════════
// "DOWNLOAD PAYSLIP" OPENED A LOGIN SCREEN
//
// ┌── THE DEFECT ──────────────────────────────────────────────────────────┐
// │ The payslip email's CTA was a signed storage URL — when, and only      │
// │ when, a browser-side render + upload succeeded at send time. Every     │
// │ failure in that chain was swallowed:                                   │
// │                                                                        │
// │     } catch { return null; }                                           │
// │                                                                        │
// │ and the caller substituted a link to /admin/payroll/my-salary. To the  │
// │ recipient — a signed-out employee reading mail on a phone — a button   │
// │ labelled "Download Payslip" opened a login screen, beside copy that    │
// │ said "Click the button above to download your detailed payslip (PDF)". │
// │                                                                        │
// │ Confirmed against the live database: the `payslips` bucket has not     │
// │ received a single object since the tenant-prefixed storage paths       │
// │ landed, across all three organizations. The link path had been dead    │
// │ for weeks and every send still reported success.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// The fix is to stop making the employee's copy of their own payslip depend on
// a browser render succeeding in someone else's tab: the PDF is ATTACHED to
// the message, exactly as the fee receipt already is. An attachment needs no
// login, cannot expire and survives forwarding.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const SERVICE = stripComments(read("src/features/payroll/services/payrollEmail.service.ts"));
const TEMPLATE = stripComments(read("supabase/functions/_shared/email-templates.ts"));

const result = (over: Partial<PayslipEmailResult> = {}): PayslipEmailResult => ({
  staffId: "s1",
  staffName: "Test Employee",
  email: "e@example.com",
  status: "sent",
  pdf: "attached",
  ...over,
});

describe("The payslip travels with the email", () => {
  it("attaches the PDF to the message", () => {
    expect(SERVICE).toMatch(/attachment: artifact\.attachment/);
    expect(SERVICE).toMatch(/name: fileName, content: artifact\.attachment/);
  });

  it("renders the slip once and derives both deliverables from it", () => {
    // Rendering twice would double the cost of a 200-employee run for nothing.
    const renders = SERVICE.match(/generatePayslipPdfBlob\(/g) ?? [];
    expect(renders).toHaveLength(1);
  });

  it("a storage failure no longer costs the employee the file", () => {
    // The old order discarded a perfectly good in-memory PDF when the upload
    // failed. The attachment must be produced BEFORE the upload is attempted.
    const attachAt = SERVICE.indexOf("blobToBase64");
    const uploadAt = SERVICE.indexOf('.from("payslips")');
    expect(attachAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(attachAt, "the upload runs before the attachment is taken").toBeLessThan(uploadAt);
  });

  it("caps the attachment rather than failing the send", () => {
    expect(SERVICE).toMatch(/MAX_ATTACHMENT_BYTES/);
    expect(SERVICE).toMatch(/blob\.size <= MAX_ATTACHMENT_BYTES/);
  });

  it("reuses the shared base64 helper instead of a second copy", () => {
    // Two copies of a chunked encoder eventually become two chunk sizes, one
    // of which overflows the stack on a large document.
    expect(SERVICE).toMatch(/from "@\/lib\/base64"/);
    const fee = stripComments(read("src/features/fee/services/feeReceiptDelivery.service.ts"));
    expect(fee).toMatch(/from "@\/lib\/base64"/);
    expect(fee, "the fee service still declares its own encoder")
      .not.toMatch(/const blobToBase64 =/);
  });
});

describe("Nothing fails silently any more", () => {
  it("no bare catch discards the reason", () => {
    // This exact construct is what hid a dead feature for weeks.
    expect(SERVICE).not.toMatch(/catch\s*\{\s*return null;?\s*\}/);
  });

  it("every failure path records a reason", () => {
    for (const reason of [
      "payslip PDF could not be generated",
      "payslip download link unavailable",
      "too large to attach",
    ]) {
      expect(SERVICE, `no message for: ${reason}`).toContain(reason);
    }
    expect(SERVICE).toMatch(/console\.error\("\[payrollEmail\]"/);
  });

  it("a zero-error upload response is still checked", () => {
    // supabase-js reports a denied write in `error`, not by throwing.
    expect(SERVICE).toMatch(/if \(up\.error\) throw new Error\(up\.error\.message\)/);
  });

  it("a signing failure is an error, not an empty link", () => {
    expect(SERVICE).toMatch(/if \(!url\) throw new Error/);
  });
});

describe("The approver is told when a payslip did not travel", () => {
  it("says nothing when every recipient got their PDF", () => {
    expect(summarisePayslipDelivery([result(), result({ staffId: "s2" })])).toBeNull();
  });

  it("reports the degraded ones with the reason", () => {
    const msg = summarisePayslipDelivery([
      result(),
      result({ staffId: "s2", pdf: "unavailable", pdfError: "storage denied" }),
    ]);
    expect(msg).toContain("1 email");
    expect(msg).toContain("storage denied");
  });

  it("counts a linked-but-not-attached payslip as degraded", () => {
    // "linked" means the employee must click, be online, and beat a 30-day
    // expiry. That is worth telling the approver about.
    const msg = summarisePayslipDelivery([result({ pdf: "linked" })]);
    expect(msg).not.toBeNull();
  });

  it("ignores emails that never sent — those are already reported", () => {
    // A failed send is counted by the "sent N of M" toast; repeating it here
    // as a PDF problem would double-report one failure as two.
    expect(
      summarisePayslipDelivery([result({ status: "failed", pdf: "unavailable" })]),
    ).toBeNull();
  });

  it("both send paths surface it", () => {
    for (const f of [
      "src/features/payroll/components/ApprovalSummaryDialog.tsx",
      "src/features/payroll/components/ResendPayslipsDialog.tsx",
    ]) {
      expect(read(f), `${f} swallows the degraded case`).toMatch(
        /summarisePayslipDelivery/,
      );
    }
  });
});

describe("A backgrounded tab cannot park the whole payroll run", () => {
  // Restored here rather than in a `finally`: if the assertion below ever hangs
  // again, vitest abandons the test mid-await and a `finally` never runs — so
  // the fake timers and the stubbed rAF would leak into the next test and fail
  // it for an unrelated reason. Found by mutation-testing this very fix.
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("honours the deadline when requestAnimationFrame never fires", async () => {
    // Exactly what a browser does to a background tab. The old loop checked its
    // own deadline INSIDE the rAF callback, so no frames meant no deadline
    // either — the promise never settled, the send loop awaited it forever, and
    // the approval dialog spun with nothing to report.
    vi.useFakeTimers();
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      () => 0 as unknown as number,
    );

    const host = document.createElement("div"); // never gets a #payroll-slip
    let resolved = false;
    void waitForImages(host, 4000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(3999);
    expect(resolved, "settled before its deadline").toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    expect(resolved, "never settled — the run would hang here").toBe(true);
  });

  it("still resolves as soon as the slip is ready", async () => {
    // The timer must be a backstop, not the normal path — waiting the full
    // four seconds per employee would add minutes to a large run.
    const host = document.createElement("div");
    host.innerHTML = '<div id="payroll-slip"></div>';
    await waitForImages(host, 4000);
  });
});

describe("The email never mislabels its own button", () => {
  it("labels the CTA by what it actually does", () => {
    expect(TEMPLATE).toMatch(/p\.downloadIsFile/);
    expect(TEMPLATE).toMatch(/ctaButton\("Download Payslip"/);
    expect(TEMPLATE).toMatch(/ctaButton\("View in Smart ARK"/);
  });

  it("no longer asserts the button downloads a PDF unconditionally", () => {
    // The old copy was a bare string in the body. It is now chosen per state.
    const body = TEMPLATE.slice(
      TEMPLATE.indexOf("const renderSalarySlip"),
      TEMPLATE.indexOf("const renderFeeReceipt"),
    );
    expect(body.length).toBeGreaterThan(500);
    const claims = body.match(/Click the button above to download/g) ?? [];
    // Present exactly once, and inside the branch that is true of it.
    expect(claims).toHaveLength(1);
    expect(body).toMatch(/p\.downloadIsFile\s*\n?\s*\?\s*"Click the button above/);
  });

  it("tells the recipient the PDF is attached when it is", () => {
    expect(TEMPLATE).toMatch(/attached to this email as a PDF/);
  });

  it("says a sign-in is needed when the link is the app", () => {
    expect(TEMPLATE).toMatch(/Sign in with your staff account/);
  });

  it("the plain-text part tells the same story", () => {
    // Mail clients that render text/plain must not show the HTML's promise.
    expect(TEMPLATE).toMatch(/View your detailed payslip \(sign-in required\)/);
  });

  it("escapes the note like every other interpolated string", () => {
    expect(TEMPLATE).toMatch(/\$\{esc\(note\)\}/);
  });
});
