// ──────────────────────────────────────────────────────────────────────────────
// RECEIPT THEME — CONTRAST-SAFE COLOUR RESOLUTION
//
// A tenant picks three colours. It does NOT pick text colours, and it must not
// be able to produce a receipt a parent cannot read — a receipt is a financial
// record, and "the school chose a pale header" is not an acceptable reason for
// an unreadable amount.
//
// So every text colour in a document is COMPUTED from the background it lands
// on using the WCAG 2.1 relative-luminance formula. The components never see a
// raw tenant colour; they see a resolved `ReceiptTheme`. The unreadable
// combination is unreachable from the component API rather than merely
// discouraged.
//
// Pure module: no imports, no DOM, no network. Every function here is testable
// with a hex string and an expectation.
// ──────────────────────────────────────────────────────────────────────────────

import type { DocumentBranding, ReceiptTheme } from "./documentBranding.types";

// ── System default palette ───────────────────────────────────────────────────
//
// This is the Smart ARK design-system primary (`--primary 213 77% 19%`), which
// is also what the two document files hardcoded. It is the PRODUCT's default,
// not a tenant's: every organization with no configured receipt colours renders
// in it, and ARK is one of those organizations rather than a special case.

export const SYSTEM_RECEIPT_PALETTE = {
  primary: "#0B2D56",
  secondary: "#13406F",
  accent: "#479EF5",
} as const;

/** Page furniture. Not brand expression — fixed across every tenant. */
const NEUTRAL = {
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  danger: "#dc2626",
} as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Accept a colour only in the exact form the database trigger allows.
 *
 * The value is interpolated into an inline `background:` in generated HTML, so
 * anything looser is a CSS-injection surface. The database validates on write;
 * this validates on read, because a row written before the trigger existed is
 * not hypothetical.
 */
export const isHexColor = (value: string): boolean => HEX_RE.test(value);

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** `#rrggbb` → `[r, g, b]`, each 0-255. Assumes `isHexColor` has passed. */
const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((n) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, "0"))
    .join("");

/**
 * WCAG 2.1 relative luminance.
 *
 * Not the naive `(r+g+b)/3` brightness — that reports pure blue as "medium"
 * and picks dark text for a `#0000FF` header, which is unreadable. The
 * sRGB-linearising formula is the one the contrast standard is defined in.
 */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two colours. 1 = identical, 21 = black on white. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** WCAG AA for normal text. */
export const AA_CONTRAST = 4.5;

/** Near-black rather than pure black — softer in print, still ~19:1 on white. */
const DARK_INK = "#111827";
const LIGHT_INK = "#ffffff";

/**
 * The readable text colour for a given background.
 *
 * Returns whichever of near-black / white has the HIGHER contrast ratio, so the
 * answer is correct for every hue rather than only for the obvious ones.
 *
 * ┌── WHY THERE IS AN ESCALATION STEP ─────────────────────────────────────┐
 * │ #111827 is a softened black — easier on the eye in print than #000000. │
 * │ On a saturated mid-tone it is not enough: against pure red it manages  │
 * │ 4.44:1 and misses AA, while true black reaches 5.25:1. Caught by the   │
 * │ contrast sweep, not by inspection.                                     │
 * │                                                                        │
 * │ So the softened ink is the PREFERENCE and the pure extreme is the      │
 * │ FALLBACK: aesthetics until legibility is at stake, then legibility.    │
 * │                                                                        │
 * │ Pure black or white always suffices. The worst possible background is  │
 * │ the luminance where both extremes are equally poor — L + 0.05 = √0.0525│
 * │ — and even there the better of the two gives 4.58:1. No background can │
 * │ defeat this function, which is why the document has no unreadable      │
 * │ state to guard against.                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const readableOn = (background: string): string => {
  const dark = contrastRatio(DARK_INK, background);
  const light = contrastRatio(LIGHT_INK, background);
  const best = Math.max(dark, light);
  if (best >= AA_CONTRAST) return dark >= light ? DARK_INK : LIGHT_INK;
  // Neither softened ink clears AA — escalate to the true extreme.
  return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background)
    ? "#000000"
    : "#ffffff";
};

/** Blend `hex` toward `target` by `amount` (0-1). */
const mix = (hex: string, target: string, amount: number): string => {
  const [r1, g1, b1] = toRgb(hex);
  const [r2, g2, b2] = toRgb(target);
  const t = clamp01(amount);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

/**
 * Darken (or lighten) a colour until it clears AA against `background`.
 *
 * Section titles, rules and highlighted values sit on the white page. A tenant
 * choosing `#FFE95C` as its primary must still get a readable section heading —
 * so text uses this adjusted variant while the header BAND keeps the tenant's
 * actual colour. The brand is preserved where it is legible and corrected only
 * where it would not be.
 *
 * Steps toward black for a light page and toward white for a dark one, so it is
 * correct if the surface ever stops being white. Returns the best value found
 * rather than looping forever.
 */
export const ensureContrast = (
  color: string,
  background = "#ffffff",
  minimum = AA_CONTRAST,
): string => {
  if (contrastRatio(color, background) >= minimum) return color;
  const toward = relativeLuminance(background) > 0.5 ? "#000000" : "#ffffff";
  let best = color;
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, toward, step / 20);
    best = candidate;
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  // Fully mixed and still short: `toward` itself is the maximum available
  // contrast against this background, so return it rather than a value that
  // merely got closer.
  return best;
};

/**
 * Pick a tenant colour, falling back to the system default.
 *
 * A stored value that is not a clean hex is DISCARDED, not passed through.
 * Rendering it would put unvalidated text into a style attribute; refusing it
 * costs the tenant a colour and costs an attacker the injection.
 */
const pick = (value: string, fallback: string): string =>
  value && isHexColor(value) ? value : fallback;

/**
 * Resolve a tenant's three colours into every colour the documents render.
 *
 * Pure and total: any `DocumentBranding` produces a complete, readable theme.
 * There is no input for which this returns something a component must guard.
 */
export const buildReceiptTheme = (branding: DocumentBranding): ReceiptTheme => {
  const primary = pick(branding.receiptPrimaryColor, SYSTEM_RECEIPT_PALETTE.primary);
  const secondary = pick(branding.receiptSecondaryColor, SYSTEM_RECEIPT_PALETTE.secondary);
  const accent = pick(branding.receiptAccentColor, SYSTEM_RECEIPT_PALETTE.accent);

  // Text sits on the PRIMARY, which is the gradient's 0% stop and the colour
  // under the organization name. Deriving from the mid-stop would be wrong at
  // the left edge, which is exactly where the name is.
  const onPrimary = readableOn(primary);
  // Derived from the RESOLVED ink's luminance, not from an identity check
  // against DARK_INK — readableOn may escalate to pure black on a hostile
  // background, and comparing to the constant would then flip every derived
  // tint to its light variant on exactly the palettes that needed dark.
  const dark = relativeLuminance(onPrimary) < 0.5;

  return {
    primary,
    secondary,
    accent,

    // The 160% stop is intentionally past the end of the box: it makes the
    // accent a *tint* across the band rather than a visible third block, which
    // is what produces the single continuous wash in the reference documents.
    headerGradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 60%, ${accent} 160%)`,
    amountGradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 140%)`,

    onPrimary,
    // Emphasis via alpha, not a second hue: it stays readable whichever way
    // `onPrimary` resolved, and cannot drift out of contrast on its own.
    onPrimaryMuted: dark ? "rgba(17,24,39,0.72)" : "rgba(255,255,255,0.85)",
    onPrimaryBorder: dark ? "rgba(17,24,39,0.30)" : "rgba(255,255,255,0.35)",
    onPrimaryFill: dark ? "rgba(17,24,39,0.10)" : "rgba(255,255,255,0.18)",

    primaryOnWhite: ensureContrast(primary),
    accentOnWhite: ensureContrast(accent),

    ...NEUTRAL,
  };
};
