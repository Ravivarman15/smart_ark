import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptBody } from "@/features/fee/components/FeeReceiptDialog";
import { SlipBody } from "@/features/payroll/components/SalarySlip";
import { NEUTRAL_DOCUMENT_BRANDING } from "./documentBranding.service";
import { monogramOf } from "./monogram";
import { readableOn, contrastRatio, AA_CONTRAST } from "./receiptTheme";
import type { DocumentBranding } from "./documentBranding.types";
import type { ReceiptData } from "@/features/fee/types/fee.types";
import type { PayrollItem, PayrollRun } from "@/features/payroll/types/payroll.types";

// ════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT DOCUMENT BRANDING
//
// Salary slips and fee receipts are the documents Smart ARK puts in a human
// being's hands. They carried `ORG = { name: "ARK Learning Arena", … }` as a
// source constant, so every tenant's employees and parents received a
// competitor's letterhead — silently, with nothing to error on.
//
// These tests render the REAL document components (not a mock of them) for
// three different organizations and assert on the produced markup. The source
// gate at the bottom re-runs the original audit on every commit.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── The three tenants ───────────────────────────────────────────────────────

/** ARK as its seeded row resolves — the production tenant that must not move. */
const ARK: DocumentBranding = {
  organizationName: "ARK Learning Arena",
  legalName: "ARK Learning Arena",
  logoUrl: "/ark-logo.jpeg",
  address: "No 2/31, Mugappair West, Chennai",
  phone: "7358199217",
  email: "",
  website: "www.arklearning.com",
  taxId: "",
  authorizedSignatory: "ARK Learning Arena",
  footerNote: "",
  receiptPrimaryColor: "",
  receiptSecondaryColor: "",
  receiptAccentColor: "",
};

/** A fully configured second tenant, colours and all. */
const ABC: DocumentBranding = {
  organizationName: "ABC Academy",
  legalName: "ABC Academy Pvt Ltd",
  logoUrl: "https://cdn.example.com/abc-logo.png",
  address: "12 Park Road, Bengaluru",
  phone: "9876543210",
  email: "hello@abcacademy.in",
  website: "www.abcacademy.in",
  taxId: "29ABCDE1234F1Z5",
  authorizedSignatory: "R. Sharma",
  footerNote: "",
  receiptPrimaryColor: "#123456",
  receiptSecondaryColor: "#654321",
  receiptAccentColor: "#F59E0B",
};

/** A brand-new tenant that has configured nothing at all. */
const XYZ: DocumentBranding = {
  ...NEUTRAL_DOCUMENT_BRANDING,
  organizationName: "XYZ School",
};

// ── Sample records (shape only — no figure is asserted as branding) ─────────

const RECEIPT: ReceiptData = {
  receiptNo: "REC-MSH515L0",
  studentName: "Dhikshan S",
  batchName: "10th STD (SB) - All",
  amount: 5000,
  paymentMethod: "Cash",
  date: "2026-08-06",
  amountReceivedToDate: 5000,
  amountPending: 50000,
};

const RUN: PayrollRun = {
  id: "run-1",
  title: "Payroll — June 2 2026",
  periodType: "monthly",
  periodStart: "2026-05-01",
  periodEnd: "2026-05-30",
  status: "draft",
  staffCount: 1,
  totalGross: 19500,
  totalOvertime: 0,
  totalIncentive: 0,
  totalDeductions: 0,
  totalNet: 19500,
} as PayrollRun;

const ITEM: PayrollItem = {
  id: "item-1",
  runId: "run-1",
  staffId: "staff-1",
  staffName: "Akbar _",
  role: "teacher",
  hourlyRate: 0,
  workedMinutes: 0,
  overtimeMinutes: 0,
  expectedMinutes: 0,
  attendancePct: 0,
  lateCount: 0,
  presentDays: 0,
  basicSalary: 0,
  hourlyEarnings: 0,
  overtimeEarnings: 0,
  incentives: 0,
  allowances: 0,
  grossEarnings: 19500,
  deductions: 0,
  penalties: 0,
  netSalary: 19500,
  bonus: 0,
  reimbursements: 0,
  loanDeduction: 0,
  pf: 0,
  esi: 0,
  tax: 0,
  otherDeductions: 0,
  manualAdjustment: 0,
  status: "pending",
  createdAt: "2026-06-02",
} as PayrollItem;

const receiptFor = (b: DocumentBranding) =>
  renderToStaticMarkup(<ReceiptBody receipt={RECEIPT} branding={b} />);
const slipFor = (b: DocumentBranding) =>
  renderToStaticMarkup(<SlipBody item={ITEM} run={RUN} branding={b} />);

// Every string that identifies ARK. A tenant document containing ANY of these
// is the bug this whole change exists to fix.
const ARK_MARKERS = [
  "ARK Learning Arena",
  "ARK LEARNING ARENA",
  "arklearning",
  "7358199217",
  "Mugappair",
  "ARK ERP",
  "ark-logo",
];

// ════════════════════════════════════════════════════════════════════════════

describe("TEST 1 — ARK renders exactly what it renders today", () => {
  const html = receiptFor(ARK);

  it("carries every field from the production receipt", () => {
    expect(html).toContain("ARK Learning Arena");
    expect(html).toContain("No 2/31, Mugappair West, Chennai");
    expect(html).toContain("Phone: 7358199217");
    expect(html).toContain("www.arklearning.com");
    expect(html).toContain("/ark-logo.jpeg");
  });

  it("keeps the navy palette it shipped with", () => {
    // ARK has configured no receipt colours, so it takes the ordinary
    // unconfigured-tenant path to the system default — which IS this navy.
    // No ARK special case anywhere in the resolver.
    expect(html).toContain("#0B2D56");
    expect(html).toContain("#13406F");
    expect(html).toContain("#479EF5");
  });

  it("keeps the signature block and the structure of the reference document", () => {
    expect(html).toContain("Authorized Signatory");
    expect(html).toContain("Payment Receipt");
    expect(html).toContain("Amount Paid");
    expect(html).toContain("Five Thousand Rupees Only");
    expect(html).toContain("Student Details");
    expect(html).toContain("Payment Information");
    expect(html).toContain("Fee Payment Details");
    expect(html).toContain("Balance Information");
  });

  it("no longer attributes the PRODUCT to a tenant", () => {
    // The one intentional visual change. "Generated by ARK ERP · Fees" appeared
    // on every organization's receipt; the attribution is the platform's, so it
    // names the platform.
    expect(html).toContain("Generated by Smart ARK · Fees");
    expect(html).not.toContain("ARK ERP");
  });
});

describe("TEST 2 — ABC Academy gets the same document with its own branding", () => {
  const html = receiptFor(ABC);

  it("shows ABC identity", () => {
    expect(html).toContain("ABC Academy");
    expect(html).toContain("12 Park Road, Bengaluru");
    expect(html).toContain("9876543210");
    expect(html).toContain("www.abcacademy.in");
    expect(html).toContain("abc-logo.png");
  });

  it("shows ABC colours", () => {
    expect(html).toContain("#123456");
    expect(html).toContain("#654321");
    expect(html).toContain("#F59E0B");
  });

  it("shows ABC's own signatory, not its organization name", () => {
    expect(html).toContain("R. Sharma");
  });

  it("renders GSTIN because ABC has one", () => {
    expect(html).toContain("GSTIN: 29ABCDE1234F1Z5");
  });

  it("has the SAME structure as ARK's receipt", () => {
    // Same document, different tenant — not a second template.
    for (const section of [
      "Payment Receipt", "Student Details", "Payment Information",
      "Fee Payment Details", "Balance Information", "Amount Paid",
      "Authorized Signatory",
    ]) {
      expect(html, `ABC receipt is missing ${section}`).toContain(section);
    }
  });

  it("contains NO trace of ARK", () => {
    for (const marker of ARK_MARKERS) {
      expect(html, `ABC receipt leaks "${marker}"`).not.toContain(marker);
    }
  });
});

describe("TEST 3 — a tenant with no branding gets a neutral fallback", () => {
  const html = receiptFor(XYZ);

  it("names XYZ and nobody else", () => {
    expect(html).toContain("XYZ School");
    for (const marker of ARK_MARKERS) {
      expect(html, `unbranded receipt falls back to "${marker}"`).not.toContain(marker);
    }
  });

  it("renders a monogram rather than any default logo", () => {
    // The only default image available would be another tenant's, so there is
    // no default image. Initials are tenant-correct by construction.
    expect(html).not.toContain("<img");
    expect(html).toContain("XS");
  });

  it("omits absent fields instead of printing empty labels", () => {
    // "Phone: " with nothing after it, or a dangling "|", looks like a broken
    // document rather than an unconfigured one.
    expect(html).not.toContain("Phone: <");
    expect(html).not.toMatch(/Phone:\s*\|/);
    expect(html).not.toContain("GSTIN:");
  });

  it("signs off with the organization's own name", () => {
    const sig = html.slice(html.indexOf("Authorized Signatory"));
    expect(sig).toContain("XYZ School");
  });

  it("uses the system palette, not another tenant's", () => {
    expect(html).toContain("#0B2D56");
  });
});

describe("TEST 4 — tenant isolation", () => {
  it("B's receipt contains nothing of A's", () => {
    const b = receiptFor(XYZ);
    for (const marker of ["ABC Academy", "12 Park Road", "9876543210", "R. Sharma", "#123456"]) {
      expect(b, `XYZ receipt leaks ABC's "${marker}"`).not.toContain(marker);
    }
  });

  it("A's receipt contains nothing of B's", () => {
    const a = receiptFor(ABC);
    expect(a).not.toContain("XYZ School");
  });

  it("rendering one tenant does not contaminate the next", () => {
    // The components hold no module-level state, but a future memo keyed on the
    // wrong thing would break exactly this and nothing else.
    receiptFor(ABC);
    const after = receiptFor(XYZ);
    expect(after).toContain("XYZ School");
    expect(after).not.toContain("ABC Academy");
  });

  it("the resolver cannot be ASKED for another tenant", () => {
    // The isolation guarantee is structural: resolveDocumentBranding takes no
    // organizationId, so there is no parameter for a URL or a request body to
    // reach. A signature change here would reintroduce the hole.
    const src = read("src/features/branding/documents/documentBranding.service.ts");
    expect(src).toMatch(/resolveDocumentBranding\s*=\s*\(\s*\)\s*:/);
    expect(src, "resolve() must take no arguments").toMatch(/resolve\(\s*\)\s*:\s*Promise/);
  });

  it("the resolver does not filter by a client-supplied organization id", () => {
    // RLS scopes these tables already. A client-side .eq() would be a second,
    // weaker check that can disagree with the first.
    //
    // Comments are stripped first: the service explains in prose why there is
    // no `.eq("organization_id", …)` here, and searching the raw text made this
    // gate fail on its own documentation.
    const src = read("src/features/branding/documents/documentBranding.service.ts")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/\.eq\(\s*["']organization_id["']/);
    // And the stripper must not have emptied the file.
    expect(src).toContain("organization_branding");
  });
});

describe("TEST 5 — salary slips resolve per tenant too", () => {
  it("ARK's slip is ARK's", () => {
    const html = slipFor(ARK);
    expect(html).toContain("ARK Learning Arena");
    expect(html).toContain("No 2/31, Mugappair West, Chennai");
    expect(html).toContain("Salary Slip");
    expect(html).toContain("Net Salary Payable");
    expect(html).toContain("Nineteen Thousand Five Hundred Rupees Only");
  });

  it("ABC's slip is ABC's, with no ARK residue", () => {
    const html = slipFor(ABC);
    expect(html).toContain("ABC Academy");
    expect(html).toContain("R. Sharma");
    for (const marker of ARK_MARKERS) {
      expect(html, `ABC payslip leaks "${marker}"`).not.toContain(marker);
    }
  });

  it("the product attribution is tenant-neutral", () => {
    expect(slipFor(ABC)).toContain("Generated by Smart ARK · Payroll");
  });

  it("payroll figures are untouched by the branding change", () => {
    // Branding must never reach a number. Every figure still comes off
    // PayrollItem exactly as the payroll engine computed it.
    const html = slipFor(ARK);
    expect(html).toContain("19,500");
    expect(html).toContain("No deductions");
    expect(html).toContain("PENDING");
  });
});

describe("TEST 6 — colour changes reach the document", () => {
  it("a changed primary changes the rendered gradient", () => {
    const before = receiptFor({ ...ABC, receiptPrimaryColor: "#123456" });
    const after = receiptFor({ ...ABC, receiptPrimaryColor: "#7C3AED" });
    expect(before).toContain("#123456");
    expect(after).toContain("#7C3AED");
    expect(after).not.toContain("#123456");
  });

  it("each of the three roles is independently visible", () => {
    const html = receiptFor({
      ...ABC,
      receiptPrimaryColor: "#111111",
      receiptSecondaryColor: "#222222",
      receiptAccentColor: "#333333",
    });
    expect(html).toContain("#111111");
    expect(html).toContain("#222222");
    expect(html).toContain("#333333");
  });
});

describe("TEST 7 — contrast holds for any palette, provably", () => {
  it("no background in the whole sRGB space defeats readableOn", () => {
    // The maths says the worst case is 4.58:1 — the luminance at which black
    // and white are equally poor. This sweeps a wide sample to confirm the
    // implementation matches the proof rather than merely passing the obvious
    // cases.
    let worst = Infinity;
    let worstAt = "";
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const hex =
            "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
          const ratio = contrastRatio(readableOn(hex), hex);
          if (ratio < worst) {
            worst = ratio;
            worstAt = hex;
          }
        }
      }
    }
    expect(worst, `worst background was ${worstAt} at ${worst.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(AA_CONTRAST);
  });

  it("a light receipt gets dark text and a dark receipt gets light text", () => {
    const light = receiptFor({ ...XYZ, receiptPrimaryColor: "#FFF9C4" });
    const dark = receiptFor({ ...XYZ, receiptPrimaryColor: "#0B2D56" });
    expect(light).toContain("#111827");
    expect(dark).toContain("#ffffff");
  });
});

describe("TEST 8 & 9 — existing records still render", () => {
  it("a receipt with only the required fields renders", () => {
    // Historical rows predate batch names, notes and running totals. A receipt
    // that throws on an old row is a receipt a parent cannot reprint.
    const minimal: ReceiptData = {
      receiptNo: "OLD-1",
      amount: 100,
      paymentMethod: "Cash",
      date: "2024-01-01",
    };
    const html = renderToStaticMarkup(<ReceiptBody receipt={minimal} branding={ARK} />);
    expect(html).toContain("OLD-1");
    expect(html).toContain("One Hundred Rupees Only");
    expect(html).toContain("No balance details available");
    expect(html).toContain("—");
  });

  it("a payslip with no breakdown lines renders", () => {
    const html = renderToStaticMarkup(
      <SlipBody item={{ ...ITEM, breakdown: undefined }} run={RUN} branding={ARK} />,
    );
    expect(html).toContain("No deductions");
    expect(html).toContain("Gross Earnings");
  });

  it("a payslip with breakdown lines renders each one", () => {
    // `deductions` must agree with the breakdown: the slip prints "No
    // deductions" from the TOTAL, not from the line count — pre-existing
    // payroll display logic, deliberately not changed by a branding task. A
    // fixture where the total says 0 and the lines say 200 is not a shape the
    // payroll engine produces.
    const html = renderToStaticMarkup(
      <SlipBody
        item={{
          ...ITEM,
          incentives: 500,
          deductions: 200,
          breakdown: [
            { type: "incentive", label: "Referral bonus", amount: 500 },
            { type: "deduction", label: "PF", amount: 200 },
          ],
        } as PayrollItem}
        run={RUN}
        branding={ARK}
      />,
    );
    expect(html).toContain("Referral bonus");
    expect(html).toContain("PF");
    expect(html).not.toContain("No deductions");
  });
});

describe("TEST 10 — the audit re-runs on every commit", () => {
  // These are the files a document can be rendered from. If ARK's name
  // reappears in any of them, the bug is back.
  const REUSABLE_DOCUMENT_PATHS = [
    "src/features/branding/documents/documentBranding.types.ts",
    "src/features/branding/documents/documentBranding.service.ts",
    "src/features/branding/documents/receiptTheme.ts",
    "src/features/branding/documents/amountInWords.ts",
    "src/features/branding/documents/DocumentShell.tsx",
    "src/features/branding/documents/ReceiptBrandingPreview.tsx",
    "src/features/branding/documents/useDocumentBranding.ts",
    "src/features/payroll/components/SalarySlip.tsx",
    "src/features/payroll/utils/payslipPdf.ts",
    "src/features/fee/components/FeeReceiptDialog.tsx",
    "src/features/fee/utils/receipt.ts",
    "src/features/parent-portal/pages/ParentFeesPage.tsx",
  ];

  // Comments legitimately DESCRIBE the bug — quoting the old constant is how
  // the reason survives. Only executable code is searched.
  const stripComments = (s: string) =>
    // Line comments first: a block-comment pass that runs first can be tricked
    // by a `//` comment containing `/*`, and would eat the rest of the file —
    // making the gate pass against code it never read.
    s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("no reusable document file hardcodes a tenant", () => {
    for (const path of REUSABLE_DOCUMENT_PATHS) {
      const code = stripComments(read(path));
      for (const marker of ["ARK Learning Arena", "ARK LEARNING ARENA", "arklearning", "7358199217", "Mugappair", "ARK ERP", "ARK School"]) {
        expect(code, `${path} hardcodes "${marker}"`).not.toContain(marker);
      }
    }
  });

  it("no reusable document file imports the bundled ARK logo", () => {
    for (const path of REUSABLE_DOCUMENT_PATHS) {
      expect(read(path), `${path} still imports the ARK logo asset`)
        .not.toContain("assets/ark-logo");
    }
  });

  it("the gate actually reads the files it claims to", () => {
    // A path typo would make every assertion above pass vacuously against an
    // empty string. Each file must be non-trivial and must be a document file.
    for (const path of REUSABLE_DOCUMENT_PATHS) {
      const src = read(path);
      expect(src.length, `${path} is suspiciously short — wrong path?`).toBeGreaterThan(400);
    }
  });

  it("stripComments does not swallow the file", () => {
    // Mutation-checking the gate itself: if the comment stripper is broken the
    // searched text is empty and every assertion passes for the wrong reason.
    const sample = read("src/features/fee/components/FeeReceiptDialog.tsx");
    const stripped = stripComments(sample);
    expect(stripped).toContain("ReceiptBody");
    expect(stripped.length).toBeGreaterThan(sample.length / 3);
  });

  it("ReceiptGenerator is excluded because it is DEAD, and still is", () => {
    // It hardcodes ARK throughout and is imported by nothing — it reads from
    // the legacy AppDataContext and could not render live data if mounted.
    // Excluding it is only honest while that stays true, so this checks.
    const importers = [
      "src/pages/admin/FeesAdmission.tsx",
      "src/pages/shared/FeeManagement.tsx",
      "src/features/students/components/StudentProfileDrawer.tsx",
      "src/features/parent-portal/pages/ParentFeesPage.tsx",
    ];
    for (const f of importers) {
      expect(read(f), `${f} now imports the dead ReceiptGenerator — it must be branded or removed`)
        .not.toContain("ReceiptGenerator");
    }
  });
});

describe("TEST 11 — branding is required, never defaulted", () => {
  it("both document bodies take branding as a REQUIRED prop", () => {
    // An optional prop with a fallback is how this class of bug survives a
    // refactor: every call site that forgets it silently gets the default.
    for (const path of [
      "src/features/payroll/components/SalarySlip.tsx",
      "src/features/fee/components/FeeReceiptDialog.tsx",
    ]) {
      const src = read(path);
      expect(src, `${path} makes branding optional`).toContain("branding: DocumentBranding;");
      expect(src, `${path} makes branding optional`).not.toContain("branding?: DocumentBranding");
    }
  });

  it("receiptToHtml has no default organization name", () => {
    // It defaulted to "ARK School", so every caller that omitted the argument
    // stamped one tenant's name onto another's receipt.
    const src = read("src/features/fee/utils/receipt.ts");
    expect(src).toContain("orgName: string");
    expect(src).not.toContain('orgName = "');
  });

  it("no headless renderer mounts before branding is available", () => {
    // A hook fetching after mount would race waitForImages and intermittently
    // rasterise an unbranded document — a bug that reproduces about half the
    // time, which is the worst kind.
    //
    // Checked PER RENDERER, not per file. A file-wide indexOf comparison held
    // only while each file had exactly ONE off-screen renderer; the moment
    // receipt.ts gained a second (receiptToBrandedPrintHtml, which prints the
    // parent's copy) the first `root.render(` belonged to a different function
    // than the first `resolveDocumentBranding()` and the check compared two
    // unrelated call sites.
    //
    // There are two legitimate ways to have branding in hand before mounting:
    //   1. await the resolver inside the function, or
    //   2. take it as a REQUIRED parameter, so the caller already resolved it.
    // Anything else is a render that can paint an unbranded document.
    for (const path of [
      "src/features/payroll/utils/payslipPdf.ts",
      "src/features/fee/utils/receipt.ts",
    ]) {
      const src = read(path);
      // Anchor each mount to the NEAREST PRECEDING exported function, not the
      // first one in the file — a greedy match would attribute every render to
      // whichever export happens to appear first.
      const mounts = [...src.matchAll(/root\.render\(/g)].map((m) => m.index!);
      expect(mounts.length, `${path} has no off-screen renderer`).toBeGreaterThan(0);

      for (const mountAt of mounts) {
        const before = src.slice(0, mountAt);
        const owner = [...before.matchAll(/export const (\w+)/g)].pop();
        expect(owner, `${path} has a root.render() outside any exported function`).toBeTruthy();

        const name = owner![1];
        const block = src.slice(owner!.index!, mountAt);
        const signature = block.slice(0, block.indexOf("=> {") + 4);

        const resolvesInside = /await resolveDocumentBranding\(\)/.test(block);
        // A required `branding: DocumentBranding` / `branding: import(...)`
        // parameter — explicitly NOT `branding?:` and NOT `branding =`.
        const takesBranding =
          /\bbranding:\s*(?!.*\?)/.test(signature) &&
          !/branding\?:/.test(signature) &&
          !/branding\s*=/.test(signature);

        expect(
          resolvesInside || takesBranding,
          `${path} → ${name}() mounts a React root without branding guaranteed to be ` +
            "available: it neither awaits resolveDocumentBranding() nor takes branding " +
            "as a required parameter. It can rasterise an unbranded document.",
        ).toBe(true);

        // `block` ends AT the mount, so a resolver appearing anywhere in it is
        // by construction before the render. Assert it is actually present
        // rather than re-deriving an ordering that the slice already proves.
        if (!takesBranding) {
          expect(
            resolvesInside,
            `${path} → ${name}() renders before it resolves branding`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("TEST 12 — visual structure matches the reference documents", () => {
  // Compared against the supplied screenshots: header band, 56px mark, two
  // 1fr columns, the filled amount band, the 170px signature rule.
  it("the receipt keeps its measured geometry", () => {
    const html = receiptFor(ARK);
    expect(html).toContain("linear-gradient(135deg");   // header band
    expect(html).toContain("width:56px");                // logo tile
    expect(html).toContain("grid-template-columns:1fr 1fr"); // meta + money grids
    expect(html).toContain("border-radius:14px");        // outer card
    expect(html).toContain("padding:20px 26px");         // header padding
    expect(html).toContain("width:170px");               // signature rule
    expect(html).toContain("font-size:26px");            // amount figure
  });

  it("the payslip keeps the same geometry — one design, two documents", () => {
    const html = slipFor(ARK);
    expect(html).toContain("linear-gradient(135deg");
    expect(html).toContain("width:56px");
    expect(html).toContain("grid-template-columns:1fr 1fr");
    expect(html).toContain("border-radius:14px");
    expect(html).toContain("width:170px");
    expect(html).toContain("font-size:26px");
  });

  it("both documents keep the DOM ids the print and raster paths select on", () => {
    // payslipPdf and receiptToPdfBlob do querySelector("#payroll-slip") /
    // ("#fee-receipt") and fall back to the whole host on a miss — which would
    // rasterise the off-screen wrapper instead of the document, silently.
    expect(slipFor(ARK)).toContain('id="payroll-slip"');
    expect(receiptFor(ARK)).toContain('id="fee-receipt"');
  });
});

describe("Monogram", () => {
  it("uses initials of the first words", () => {
    expect(monogramOf("ABC Academy")).toBe("AA");
    expect(monogramOf("XYZ School")).toBe("XS");
    expect(monogramOf("ARK Learning Arena")).toBe("ALA");
  });

  it("handles a single word and stray whitespace", () => {
    expect(monogramOf("Greenwood")).toBe("GR");
    expect(monogramOf("  Delta   Public  School ")).toBe("DPS");
  });

  it("never renders empty", () => {
    // An empty tile reads as a broken image; a bullet reads as "no logo yet".
    expect(monogramOf("")).toBe("•");
    expect(monogramOf("   ")).toBe("•");
  });
});
