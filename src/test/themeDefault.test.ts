import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_THEME, THEMES, THEME_LIST } from "@/core/theme/themes";

// ════════════════════════════════════════════════════════════════════════════
// THE DEFAULT THEME IS WRITTEN IN FOUR PLACES
//
// It has to be. Each one covers a moment the others cannot:
//
//   <html data-theme>      no-JS visitors and prerendered marketing pages
//   boot script fallback   first paint, before React exists
//   DEFAULT_THEME          application code
//   <meta theme-color>     the mobile address bar
//
// Nothing makes them agree except care, and the failure is quiet: the page
// paints one theme and swaps to another a frame later, which reads as a bug in
// the product rather than a mismatched constant. So it is asserted.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const css = readFileSync(join(ROOT, "src", "index.css"), "utf8");

/**
 * The declaration body of a theme block.
 *
 * Located by the selector followed by `{`, NOT by a bare `indexOf` of the
 * selector text: index.css opens with a doc comment that names every selector,
 * so a bare search lands in the prose and silently reads the wrong palette —
 * which is how the first version of this test "found" a navy --secondary that
 * was actually the dark theme's.
 */
const themeBlock = (id: string): string => {
  const m = new RegExp(`\\[data-theme="${id}"\\]\\s*\\{`).exec(css);
  if (!m) throw new Error(`no CSS block for ${id}`);
  const start = m.index + m[0].length;
  const end = css.indexOf("\n  }", start);
  return css.slice(start, end);
};

/** hsl triple for a token, from a block body. */
const hsl = (block: string, token: string): [number, number, number] => {
  const m = new RegExp(`${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(block);
  if (!m) throw new Error(`${token} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe("The default theme is white with navy accents", () => {
  it("DEFAULT_THEME is the light palette", () => {
    expect(DEFAULT_THEME).toBe("ark-light");
    expect(THEMES[DEFAULT_THEME].mode).toBe("light");
  });

  it("its surface really is white, not merely called light", () => {
    // Guards the case where someone edits the palette but not the label.
    expect(THEMES[DEFAULT_THEME].preview.background.toLowerCase()).toBe("#ffffff");
  });

  it("the brand accent is navy", () => {
    // The other half of the request: white base, navy brand.
    const accent = THEMES[DEFAULT_THEME].preview.accent.toLowerCase();
    expect(accent).toBe("#0f3b8a");
    const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(accent)!;
    // Blue dominant and dark overall — the definition of navy, checked rather
    // than trusted, because a hex string can be renamed to anything.
    expect(parseInt(b, 16)).toBeGreaterThan(parseInt(r, 16));
    expect(parseInt(b, 16)).toBeGreaterThan(parseInt(g, 16));
    expect(parseInt(r, 16) + parseInt(g, 16) + parseInt(b, 16)).toBeLessThan(0x80 * 3);
  });
});

describe("All four declarations agree", () => {
  it("the static <html data-theme> matches", () => {
    // Covers prerendered marketing pages and no-JS crawlers, which never run
    // the boot script.
    expect(html).toMatch(new RegExp(`<html[^>]*data-theme="${DEFAULT_THEME}"`));
  });

  it("the no-flash boot script falls back to the same theme", () => {
    const boot = html.slice(html.indexOf("No-flash theme boot"), html.indexOf("</head>"));
    expect(boot.length).toBeGreaterThan(50);
    // ASSIGNMENTS only. The guard `t !== 'ark-light' && t !== 'ark-dark'`
    // legitimately names both ids; counting those as fallbacks makes the
    // assertion depend on the order they appear in, which is not a fact about
    // the default at all.
    const assigned = [
      ...boot.matchAll(/(?:t|dataset\.theme)\s*=\s*'(ark-light|ark-dark)'/g),
    ].map((m) => m[1]);
    // Two paths: an unrecognised stored value, and localStorage throwing.
    expect(assigned.length).toBeGreaterThanOrEqual(2);
    for (const f of assigned) expect(f).toBe(DEFAULT_THEME);
  });

  it("the mobile chrome colour matches the default surface", () => {
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(html);
    expect(meta).not.toBeNull();
    expect(meta![1].toLowerCase()).toBe(
      THEMES[DEFAULT_THEME].preview.background.toLowerCase(),
    );
  });

  it("DETECTS a drift between them", () => {
    // Mutation check: the comparison above must be real, not vacuous.
    const drifted = html.replace(`data-theme="${DEFAULT_THEME}"`, 'data-theme="ark-dark"');
    expect(drifted).not.toMatch(new RegExp(`<html[^>]*data-theme="${DEFAULT_THEME}"`));
  });
});

describe("Switching the default did not change the palettes", () => {
  it("both themes still exist and remain switchable", () => {
    // The request was to change which theme is default, NOT to remove the
    // other one. Anyone who has toggled keeps their choice.
    expect(THEME_LIST.map((t) => t.id).sort()).toEqual(["ark-dark", "ark-light"]);
    expect(THEMES["ark-dark"].mode).toBe("dark");
  });

  it("every palette block is still defined in the stylesheet", () => {
    for (const t of THEME_LIST) {
      // ark-dark is declared as a :root alias; ark-light as its own block.
      expect(css, `no palette for ${t.id}`).toMatch(
        new RegExp(`\\[data-theme="${t.id}"\\]`),
      );
    }
  });

  it("--secondary was NOT repainted navy", () => {
    // "Secondary should be navy" describes the BRAND, and in this codebase the
    // brand colour is --primary/--accent (both navy in ark-light).
    //
    // --secondary is a SURFACE token, paired with --secondary-foreground, which
    // is near-black. Painting it navy would put dark text on a dark field for
    // every secondary button, badge and progress bar — three components, all
    // unreadable, none of them obviously related to a "brand colour" change.
    const [, saturation, lightness] = hsl(themeBlock("ark-light"), "--secondary");
    // A light surface: high lightness, low saturation.
    expect(lightness).toBeGreaterThan(80);
    expect(saturation).toBeLessThan(30);
  });

  it("the navy brand tokens are what carry the colour", () => {
    const light = themeBlock("ark-light");
    for (const token of ["--primary", "--accent"]) {
      const [hue, , lightness] = hsl(light, token);
      // Blue hue range, and dark enough to carry white text.
      expect(hue, `${token} hue`).toBeGreaterThan(200);
      expect(hue, `${token} hue`).toBeLessThan(240);
      expect(lightness, `${token} lightness`).toBeLessThan(50);
    }
  });
});
