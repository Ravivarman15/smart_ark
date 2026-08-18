import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  KNOWN_TEMPLATES,
  TEMPLATE_SENDERS,
  maySendTemplate,
  renderEmail,
  type EmailTemplateId,
} from "../../../supabase/functions/_shared/email-templates";

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL DELIVERY GATES
//
// Asked to "check the email status", the honest answer was that it could not be
// checked, and that several paths had never delivered a single message. What
// the live database actually showed:
//
//   • message_queue held 108 email rows and every one was a fee receipt —
//     the only path that recorded anything. Staff welcome, password resets,
//     payslips, lead alerts, form acknowledgements, provisioning and billing
//     wrote nothing at all, so their failures were invisible.
//   • organization_settings.welcome_email read {"sent": false} for BOTH
//     organizations ever provisioned. Zero for two.
//   • Nine template ids were being sent that were never registered.
//   • Calling the live send-email with the service-role key returned 401.
//   • Every failed receipt row said "Failed to send a request to the Edge
//     Function" — a ~6.5 MB base64 upload, because a one-page receipt PDF
//     weighed 4.8 MB.
//
// Each gate below pins one of those so it cannot come back.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const SRC = join(ROOT, "src");

const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every .ts/.tsx file under a root, excluding this test's own directory. */
const walk = (dir: string, out: string[] = []): string[] => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === "dist") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(d.name) && statSync(p).isFile()) {
      out.push(p);
    }
  }
  return out;
};

describe("Every template that is sent is a template that exists", () => {
  it("no caller references an unregistered templateId", () => {
    // ┌── THE DEFECT THIS GATE EXISTS FOR ─────────────────────────────────┐
    // │ provisioning-worker sent "organization-ready" and billing-lifecycle│
    // │ sent eight billing ids. None was in KNOWN_TEMPLATES, so send-email │
    // │ answered 400 "Unknown templateId" every single time. Both callers  │
    // │ treat mail as best-effort and only count a `skipped`, so nothing   │
    // │ ever surfaced — and no customer has ever had a welcome email.      │
    // └────────────────────────────────────────────────────────────────────┘
    const files = [...walk(SRC), ...walk(FUNCTIONS)].filter(
      (f) => !f.includes(join("test", "security")),
    );

    const unknown: string[] = [];
    for (const f of files) {
      const src = stripComments(read(f));
      for (const m of src.matchAll(/templateId:\s*"([a-z0-9-]+)"/g)) {
        const id = m[1] as EmailTemplateId;
        if (!KNOWN_TEMPLATES.includes(id)) {
          unknown.push(`${f.replace(ROOT, "")} → "${id}"`);
        }
      }
    }
    expect(unknown, `unregistered template ids being sent:\n${unknown.join("\n")}`).toEqual([]);
  });

  it("every registered template renders a real subject and body", () => {
    // A registered id that is not wired into the dispatcher throws "Unknown
    // email template" — a 500 where the caller expected an email. This is what
    // proves the nine new notices are actually reachable, not just listed.
    //
    // One bag covering every template's required fields; templates ignore what
    // they do not use. It is deliberately not per-template, so adding a
    // template with a NEW required field fails here rather than in production.
    const params: Record<string, unknown> = {
      heading: "Heading",
      paragraphs: ["A paragraph."],
      staffName: "Staff Member",
      roleLabel: "Teacher",
      loginEmail: "staff@example.test",
      loginUrl: "https://example.test/login",
      tempPassword: "temp-pass",
      employeeName: "Employee",
      month: "June 2026",
      netSalary: "₹25,950",
      periodLabel: "01 Jun 2026 – 30 Jun 2026",
      downloadUrl: "https://example.test/payslip.pdf",
      studentName: "Student",
      receiptNo: "R-001",
      amount: "₹1,000",
      paymentMethod: "Cash",
      pendingBalance: "₹0",
      collectionDate: "01 Jun 2026",
      formLabel: "Enquiry",
      fields: [],
      submittedAt: "01 Jun 2026",
      reviewUrl: "https://example.test/review",
      name: "Visitor",
      confirmation: "We have received your enquiry.",
      details: [],
      organizationName: "Example Academy",
      adminName: "Admin",
      billingUrl: "https://example.test/admin/billing",
      detail: "Detail line.",
    };

    for (const id of KNOWN_TEMPLATES) {
      let mail: ReturnType<typeof renderEmail>;
      expect(() => {
        mail = renderEmail(id, params);
      }, `renderEmail("${id}") threw`).not.toThrow();
      mail = renderEmail(id, params);
      expect(mail.subject, `"${id}" rendered an empty subject`).toBeTruthy();
      expect(mail.html, `"${id}" rendered an empty body`).toBeTruthy();
      expect(mail.text, `"${id}" rendered no plain-text part`).toBeTruthy();
    }
  });

  it("the nine notices that had never been deliverable are registered", () => {
    for (const id of [
      "organization-ready",
      "trial-ending",
      "trial-expired",
      "renewal-reminder",
      "payment-failed",
      "subscription-activated",
      "subscription-suspended",
      "subscription-restored",
      "invoice",
    ]) {
      expect(KNOWN_TEMPLATES).toContain(id);
    }
  });

  it("a billing CTA is dropped unless the url is absolute", () => {
    // billing-lifecycle passed "/admin/billing". A relative href resolves
    // against the mail client's own origin, so the button led nowhere from
    // every inbox. No button beats a broken button.
    const relative = renderEmail("payment-failed", { billingUrl: "/admin/billing" });
    expect(relative.html).not.toContain("/admin/billing");

    const absolute = renderEmail("payment-failed", {
      billingUrl: "https://example.test/admin/billing",
    });
    expect(absolute.html).toContain("https://example.test/admin/billing");
  });

  it("billing-lifecycle sends an absolute billing url", () => {
    const src = stripComments(read(join(FUNCTIONS, "billing-lifecycle", "index.ts")));
    expect(src).toMatch(/billingUrl: `\$\{SITE_ORIGIN\}\/admin\/billing`/);
    expect(src).not.toMatch(/billingUrl: "\/admin\/billing"/);
  });
});

describe("Who may send what", () => {
  it("TEMPLATE_SENDERS covers every registered template", () => {
    // A template with no policy entry would be undefined at the gate — which
    // either throws or silently allows, depending on the day.
    for (const id of KNOWN_TEMPLATES) {
      expect(TEMPLATE_SENDERS[id], `no sender policy for "${id}"`).toBeDefined();
    }
    expect(Object.keys(TEMPLATE_SENDERS).sort()).toEqual([...KNOWN_TEMPLATES].sort());
  });

  it("a coordinator can send the receipt for a fee they are allowed to collect", () => {
    // public.is_fee_collector() = (admin, management, coordinator) and the
    // fee-write RLS matches it. The mailer required admin/management, so the
    // database let a coordinator take the payment and then refused to tell the
    // parent about it — a 403 on every coordinator-collected receipt.
    expect(maySendTemplate("fee-receipt", "coordinator", false)).toBe(true);
    expect(maySendTemplate("fee-receipt", "admin", false)).toBe(true);
    expect(maySendTemplate("fee-receipt", "management", false)).toBe(true);
    // A teacher cannot collect a fee, so they cannot send its receipt either.
    expect(maySendTemplate("fee-receipt", "teacher", false)).toBe(false);
  });

  it("a teacher can fire the parent automations their own actions trigger", () => {
    // Marking attendance / entering results dispatches generic-notice.
    expect(maySendTemplate("generic-notice", "teacher", false)).toBe(true);
  });

  it("payroll and staff credentials stay with admin/management", () => {
    for (const role of ["teacher", "coordinator"]) {
      expect(maySendTemplate("salary-slip", role, false)).toBe(false);
      expect(maySendTemplate("staff-welcome", role, false)).toBe(false);
      expect(maySendTemplate("staff-password-reset", role, false)).toBe(false);
    }
  });

  it("no human role can send an operational notice", () => {
    for (const role of ["admin", "management", "coordinator", "teacher", null]) {
      expect(maySendTemplate("organization-ready", role, false)).toBe(false);
      expect(maySendTemplate("invoice", role, false)).toBe(false);
    }
    // Our own server-side code can.
    expect(maySendTemplate("organization-ready", null, true)).toBe(true);
  });

  it("an unauthenticated caller can send nothing", () => {
    for (const id of KNOWN_TEMPLATES) {
      expect(maySendTemplate(id, null, false), `"${id}" was sendable with no role`).toBe(false);
    }
  });
});

describe("The service role can reach send-email", () => {
  const auth = stripComments(read(join(FUNCTIONS, "_shared", "auth.ts")));

  it("isServiceRoleCaller fails closed when the secret is unset", () => {
    // An empty === empty comparison would admit every anonymous caller as
    // "internal" — the same trap kpi-engine and sla-checker document.
    expect(auth).toMatch(/if \(!serviceKey\) return false;/);
  });

  it("it compares the bearer token, not a header the caller can set", () => {
    expect(auth).toMatch(/req\.headers\.get\("Authorization"\)/);
    expect(auth).toMatch(/=== serviceKey/);
  });

  it("the two server-side callers name their tenant", () => {
    // A service-role caller has no membership, so send-email cannot derive the
    // organization. Without it the email is branded as the platform, not the
    // customer.
    const prov = stripComments(read(join(FUNCTIONS, "provisioning-worker", "index.ts")));
    expect(prov).toMatch(/organizationId: orgId/);
    const bill = stripComments(read(join(FUNCTIONS, "billing-lifecycle", "index.ts")));
    expect(bill).toMatch(/organizationId: e\.organization_id/);
  });
});

describe("Every email leaves a record", () => {
  const brevo = read(join(FUNCTIONS, "_shared", "brevo.ts"));

  it("the delivery-log context is REQUIRED, not optional", () => {
    // Optional means forgettable, and being forgotten is the entire defect:
    // fee receipts were the only path that logged, so every other failure was
    // invisible for months.
    expect(brevo).toMatch(/audit: EmailAuditContext/);
    expect(brevo).not.toMatch(/audit\?: EmailAuditContext/);
  });

  it("every exit from sendBrevoEmail is logged", () => {
    const src = stripComments(brevo);
    // Including the "secrets not configured" skip, which is a silent no-send.
    expect(src).toMatch(/const finish = async \(result: BrevoSendResult\)/);
    expect(src).toMatch(/await logEmailDelivery\(audit, recipient, result\)/);
    // No early `return {` that bypasses finish().
    const bareReturns = [...src.matchAll(/\n\s+return \{\s*\n?\s*ok:/g)];
    expect(bareReturns.length, "a send path returns without logging").toBe(0);
  });

  it("a null tenant is skipped, never guessed", () => {
    // message_queue.organization_id is NOT NULL and the column default resolves
    // to NULL under a service role once a second organization exists.
    const log = read(join(FUNCTIONS, "_shared", "email-log.ts"));
    expect(log).toMatch(/if \(!ctx\.organizationId\)/);
    expect(log).toMatch(/not recorded — no tenant to attribute it to/);
  });

  it("the fee receipt's duplicate guard still finds the logged row", () => {
    // The guard looks a sent receipt up by payload->>receipt_no. A row logged
    // without it would re-send the receipt on every collection.
    const log = read(join(FUNCTIONS, "_shared", "email-log.ts"));
    expect(log).toMatch(/\.\.\.\(ctx\.extraPayload \?\? \{\}\)/);
    const fee = stripComments(
      read(join(SRC, "features", "fee", "services", "feeReceiptDelivery.service.ts")),
    );
    expect(fee).toMatch(/logPayload: \{ receipt_no: receiptNo \}/);
    expect(fee).toMatch(/\.eq\("payload->>receipt_no", receiptNo\)/);
  });

  it("the client only logs what the server could not have seen", () => {
    // send-email records everything it handles; a second row from the client
    // would double-count it. A dropped request is the one case the server
    // never saw — and the one that produced every failed receipt row.
    const fee = stripComments(
      read(join(SRC, "features", "fee", "services", "feeReceiptDelivery.service.ts")),
    );
    expect(fee).toMatch(/if \(!out\.reachedServer\) \{[\s\S]{0,200}?this\.logEmail\(/);
  });
});

describe("Transient failures are retried; permanent ones are not", () => {
  it("the client retries a dropped request", () => {
    const src = stripComments(read(join(SRC, "features", "staff", "services", "email.service.ts")));
    expect(src).toMatch(/isTransportError/);
    expect(src).toMatch(/attempt === MAX_ATTEMPTS/);
  });

  it("the client does NOT retry a 4xx from the function", () => {
    // An unknown template or a forbidden role fails identically every time;
    // retrying it just delays the same answer.
    const src = read(join(SRC, "features", "staff", "services", "email.service.ts"));
    expect(src).toMatch(/FunctionsFetchError/);
    expect(src).toMatch(/FunctionsHttpError/); // named in the rationale
    expect(src).toMatch(/is NOT retried/);
  });

  it("the server retries Brevo rate-limits and 5xx only", () => {
    const src = stripComments(read(join(FUNCTIONS, "_shared", "brevo.ts")));
    expect(src).toMatch(/httpStatus === 429 \|\| httpStatus >= 500/);
    expect(src).toMatch(/!isTransient\(httpStatus\)/);
  });
});

describe("Branded documents cannot go back to multi-megabyte pages", () => {
  const DOC_PDF_FILES = [
    join(SRC, "features", "fee", "utils", "receipt.ts"),
    join(SRC, "features", "payroll", "utils", "payslipPdf.ts"),
    join(SRC, "features", "fee", "components", "FeeReceiptDialog.tsx"),
    join(SRC, "features", "payroll", "components", "SalarySlip.tsx"),
  ];

  it("every branded document PDF goes through the shared rasteriser", () => {
    // ┌── WHY SIZE IS A DELIVERY BUG, NOT A TIDINESS ONE ──────────────────┐
    // │ addImage(canvas.toDataURL("image/png"), "PNG", …) on an A4 page at │
    // │ scale 2 produced a 4.8 MB receipt (payslips 5.4 MB) — measured on  │
    // │ the live storage bucket. That blob is attached to the send-email   │
    // │ request as base64, making a ~6.5 MB upload per fee collection, and │
    // │ a dropped upload is exactly the "Failed to send a request to the   │
    // │ Edge Function" that every failed row records.                      │
    // └────────────────────────────────────────────────────────────────────┘
    for (const f of DOC_PDF_FILES) {
      expect(existsSync(f), `${f} moved`).toBe(true);
      const src = read(f);
      expect(src, `${f} does not use addRasterPage`).toMatch(/addRasterPage\(/);
      expect(src, `${f} still builds a lossless PNG page`).not.toMatch(
        /addImage\([^)]*image\/png/,
      );
    }
  });

  it("the rasteriser uses JPEG and asks jsPDF to compress", () => {
    const src = read(join(SRC, "lib", "documentRaster.ts"));
    expect(src).toMatch(/toDataURL\("image\/jpeg", DOCUMENT_RASTER\.quality\)/);
    expect(src).toMatch(/compress: true/);
    // Quality high enough that text stays crisp.
    expect(src).toMatch(/quality: 0\.8[0-9]?/);
  });
});
