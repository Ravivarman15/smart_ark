import { describe, it, expect } from "vitest";
import {
  buildReceiptTheme,
  contrastRatio,
  ensureContrast,
  isHexColor,
  readableOn,
  relativeLuminance,
  SYSTEM_RECEIPT_PALETTE,
  AA_CONTRAST,
} from "./receiptTheme";
import { NEUTRAL_DOCUMENT_BRANDING } from "./documentBranding.service";
import type { DocumentBranding } from "./documentBranding.types";

// ════════════════════════════════════════════════════════════════════════════
// RECEIPT THEME — CONTRAST SAFETY
//
// A receipt is a financial record a parent keeps. "The school picked a pale
// header" is not an acceptable reason for an illegible amount, so a tenant
// picks COLOURS and the system picks the TEXT colours. These tests hold that
// line against every palette a tenant could plausibly choose.
// ════════════════════════════════════════════════════════════════════════════

const brandingWith = (over: Partial<DocumentBranding> = {}): DocumentBranding => ({
  ...NEUTRAL_DOCUMENT_BRANDING,
  organizationName: "Test Academy",
  ...over,
});

describe("Colour parsing rejects anything that is not #rrggbb", () => {
  it("accepts a clean six-digit hex, either case", () => {
    expect(isHexColor("#0B2D56")).toBe(true);
    expect(isHexColor("#0b2d56")).toBe(true);
  });

  it("rejects shorthand, named colours and functional notation", () => {
    // These reach an inline `background:` in generated HTML. Anything looser
    // than a strict hex is a CSS-injection surface, and the database trigger
    // enforces the same rule on write — this is the read-side half.
    for (const bad of ["#fff", "red", "rgb(0,0,0)", "", "#12345g", "#0B2D56;x"]) {
      expect(isHexColor(bad), `${bad} must be rejected`).toBe(false);
    }
  });

  it("a malformed stored colour is DISCARDED, not passed through", () => {
    // A row written before the trigger existed is not hypothetical. Rendering
    // it would put unvalidated text into a style attribute.
    const theme = buildReceiptTheme(
      brandingWith({ receiptPrimaryColor: "red; background:url(//evil)" }),
    );
    expect(theme.primary).toBe(SYSTEM_RECEIPT_PALETTE.primary);
    expect(theme.headerGradient).not.toContain("evil");
  });
});

describe("Luminance uses the WCAG formula, not naive brightness", () => {
  it("black and white sit at the extremes", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("pure blue is treated as DARK", () => {
    // The reason the naive (r+g+b)/3 average is not used: it reports #0000FF as
    // mid-brightness and picks dark text, which is unreadable. The sRGB
    // weighting knows blue contributes almost nothing to perceived luminance.
    expect(readableOn("#0000FF")).toBe("#ffffff");
  });

  it("picks the higher-contrast option, not a fixed threshold", () => {
    expect(readableOn("#FFE95C")).toBe("#111827"); // pale yellow → dark text
    expect(readableOn("#0B2D56")).toBe("#ffffff"); // deep navy   → light text
  });
});

describe("No colour choice can make a document unreadable", () => {
  // Deliberately hostile: near-white, near-black, saturated primaries, and the
  // mid-tones where a naive implementation is most likely to pick wrong.
  const EXTREMES = [
    "#ffffff", "#000000", "#fefefe", "#010101",
    "#FFE95C", "#0000FF", "#FF0000", "#00FF00",
    "#808080", "#7f7f7f", "#123456", "#F59E0B",
    "#654321", "#00FFFF", "#FF00FF", "#2F80ED",
  ];

  it("header text clears AA against the header band for every extreme", () => {
    for (const c of EXTREMES) {
      const t = buildReceiptTheme(brandingWith({ receiptPrimaryColor: c }));
      expect(
        contrastRatio(t.onPrimary, t.primary),
        `text ${t.onPrimary} on header ${c} is only ${contrastRatio(t.onPrimary, t.primary).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it("section headings clear AA against the white page for every extreme", () => {
    // The band can keep the tenant's actual colour because it controls its own
    // text. Section titles sit on the PAGE, so a pale brand colour must be
    // darkened or the heading vanishes.
    for (const c of EXTREMES) {
      const t = buildReceiptTheme(brandingWith({ receiptPrimaryColor: c }));
      expect(
        contrastRatio(t.primaryOnWhite, "#ffffff"),
        `heading ${t.primaryOnWhite} (from ${c}) on white is only ${contrastRatio(t.primaryOnWhite, "#ffffff").toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it("highlighted values clear AA against the white page for every extreme", () => {
    for (const c of EXTREMES) {
      const t = buildReceiptTheme(brandingWith({ receiptAccentColor: c }));
      expect(contrastRatio(t.accentOnWhite, "#ffffff")).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it("ensureContrast returns the input unchanged when it already passes", () => {
    // Correcting a colour that did not need correcting would quietly alter
    // every tenant that chose a dark palette — including ARK.
    expect(ensureContrast("#0B2D56")).toBe("#0B2D56");
  });

  it("ensureContrast terminates on a colour that cannot reach the target", () => {
    // Asking for 21:1 on white is only satisfiable by pure black. The loop must
    // return its best effort rather than spinning.
    const out = ensureContrast("#ffffff", "#ffffff", 21);
    expect(isHexColor(out)).toBe(true);
    expect(out).toBe("#000000");
  });
});

describe("Unconfigured tenants get the system palette", () => {
  it("all three colours fall back independently", () => {
    const t = buildReceiptTheme(brandingWith());
    expect(t.primary).toBe(SYSTEM_RECEIPT_PALETTE.primary);
    expect(t.secondary).toBe(SYSTEM_RECEIPT_PALETTE.secondary);
    expect(t.accent).toBe(SYSTEM_RECEIPT_PALETTE.accent);
  });

  it("a tenant setting ONLY a primary keeps system defaults for the rest", () => {
    const t = buildReceiptTheme(brandingWith({ receiptPrimaryColor: "#123456" }));
    expect(t.primary).toBe("#123456");
    expect(t.secondary).toBe(SYSTEM_RECEIPT_PALETTE.secondary);
  });

  it("the system palette is the navy the documents shipped with", () => {
    // ARK renders through this path — it has configured no receipt colours, so
    // it takes the ordinary unconfigured-tenant route. If this constant ever
    // changes, ARK's live receipt changes with it, which is what this asserts.
    expect(SYSTEM_RECEIPT_PALETTE.primary).toBe("#0B2D56");
    expect(SYSTEM_RECEIPT_PALETTE.secondary).toBe("#13406F");
    expect(SYSTEM_RECEIPT_PALETTE.accent).toBe("#479EF5");
  });
});

describe("Configured colours actually reach the output", () => {
  it("all three appear in the header gradient", () => {
    const t = buildReceiptTheme(
      brandingWith({
        receiptPrimaryColor: "#123456",
        receiptSecondaryColor: "#654321",
        receiptAccentColor: "#F59E0B",
      }),
    );
    expect(t.headerGradient).toContain("#123456");
    expect(t.headerGradient).toContain("#654321");
    expect(t.headerGradient).toContain("#F59E0B");
  });

  it("two different tenants produce two different themes", () => {
    const a = buildReceiptTheme(brandingWith({ receiptPrimaryColor: "#123456" }));
    const b = buildReceiptTheme(brandingWith({ receiptPrimaryColor: "#F59E0B" }));
    expect(a.headerGradient).not.toBe(b.headerGradient);
    // And the text colours diverge too, because one is dark and one is light.
    expect(a.onPrimary).not.toBe(b.onPrimary);
  });
});
