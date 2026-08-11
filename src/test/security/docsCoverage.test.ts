import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES, BY_SLUG, searchDocs, neighbours, readingOrder } from "@/features/docs/content";
import { SCREENSHOTS, SCREENSHOTS_BY_ID } from "@/features/docs/screenshots";
import { DOC_CATEGORIES, DOC_ROLES } from "@/features/docs/types";

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENTATION INTEGRITY GATE
//
// The rule is ASYMMETRIC, deliberately:
//
//   a SHIPPED feature with no article   → warning (coverage gap)
//   an article describing a NON-FEATURE → FAILURE (product integrity)
//
// A missing guide is an inconvenience. A guide describing a screen nobody can
// open sends a paying customer hunting for a menu item that was never built,
// and they conclude the product is broken rather than the documentation.
//
// The corrected inventory found 115 ASPIRATIONAL submodules against 87 shipped
// — permission-catalog entries that render nothing. Generating documentation
// from the catalog would have produced a majority of fiction. This gate is what
// stops that happening later, one well-meaning article at a time.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const INVENTORY = join(ROOT, "docs/generated/documentation-inventory.json");

interface Sub { id: string; status: string; route: string | null; label: string }
const inventory: { submodules: Sub[] } = existsSync(INVENTORY)
  ? JSON.parse(readFileSync(INVENTORY, "utf8"))
  : { submodules: [] };

const byId = new Map(inventory.submodules.map((s) => [s.id, s]));
const shipped = inventory.submodules.filter((s) => s.status === "SHIPPED");

describe("The inventory the gate depends on is present", () => {
  it("exists and is non-trivial", () => {
    // Without it every assertion below would pass vacuously — the exact
    // failure mode these gates keep re-learning.
    expect(existsSync(INVENTORY), "run `node scripts/docs-inventory.mjs`").toBe(true);
    expect(inventory.submodules.length).toBeGreaterThan(100);
    expect(shipped.length).toBeGreaterThan(50);
  });
});

describe("No article documents a feature that does not exist", () => {
  it("every referenced permission is a real catalog submodule", () => {
    const bad: string[] = [];
    for (const a of ARTICLES) {
      for (const p of a.permissions) {
        if (!byId.has(p)) bad.push(`${a.slug} → "${p}" is not in the RBAC catalog`);
      }
    }
    expect(bad, "articles reference permissions that do not exist").toEqual([]);
  });

  it("no article claims an ASPIRATIONAL feature is available", () => {
    // THE central rule. An aspirational submodule is permission-only: it has no
    // route and renders nothing, so a step-by-step guide for it is fiction.
    const bad: string[] = [];
    for (const a of ARTICLES) {
      for (const p of a.permissions) {
        const s = byId.get(p);
        if (s && s.status !== "SHIPPED" && s.status !== "LEGACY_ONLY") {
          bad.push(`${a.slug} documents "${p}" which is ${s.status}`);
        }
      }
    }
    expect(bad, "documentation describes features that are not shipped").toEqual([]);
  });

  it("every sourceModules path still exists", () => {
    // The staleness check. A guide pointing at a deleted file is describing
    // code that is gone.
    const missing: string[] = [];
    for (const a of ARTICLES) {
      for (const src of a.sourceModules) {
        if (!existsSync(join(ROOT, src))) missing.push(`${a.slug} → ${src}`);
      }
    }
    expect(missing, "articles cite source files that no longer exist").toEqual([]);
  });
});

describe("Nothing is broken", () => {
  it("slugs are unique", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const a of ARTICLES) {
      if (seen.has(a.slug)) dupes.push(a.slug);
      seen.add(a.slug);
    }
    expect(dupes).toEqual([]);
  });

  it("every related link resolves", () => {
    const broken: string[] = [];
    for (const a of ARTICLES) {
      for (const r of a.related ?? []) {
        if (!BY_SLUG.has(r)) broken.push(`${a.slug} → ${r}`);
      }
    }
    expect(broken, "broken internal documentation links").toEqual([]);
  });

  it("every screenshot reference resolves to a registry entry", () => {
    const broken: string[] = [];
    for (const a of ARTICLES) {
      for (const s of a.screenshots ?? []) {
        if (!SCREENSHOTS_BY_ID.has(s)) broken.push(`${a.slug} → ${s}`);
      }
    }
    expect(broken, "articles reference unregistered screenshots").toEqual([]);
  });

  it("no registry entry claims a file that is not on disk", () => {
    // `file: null` is fine — it renders nothing. A non-null path that does not
    // exist would render a broken image.
    const missing: string[] = [];
    for (const s of SCREENSHOTS) {
      if (s.file && !existsSync(join(ROOT, "public", s.file.replace(/^\//, "")))) {
        missing.push(`${s.id} → ${s.file}`);
      }
    }
    expect(missing, "screenshot registry points at missing files").toEqual([]);
  });

  it("categories and roles are declared values", () => {
    const cats = new Set(DOC_CATEGORIES.map((c) => c.id));
    const roles = new Set(DOC_ROLES.map((r) => r.id));
    for (const a of ARTICLES) {
      expect(cats.has(a.category), `${a.slug} has unknown category ${a.category}`).toBe(true);
      expect(a.roles.length, `${a.slug} serves no role`).toBeGreaterThan(0);
      for (const r of a.roles) expect(roles.has(r), `${a.slug} has unknown role ${r}`).toBe(true);
    }
  });

  it("every article carries a plausible lastVerified date", () => {
    for (const a of ARTICLES) {
      expect(a.lastVerified, `${a.slug} has no lastVerified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(a.lastVerified)), `${a.slug} date unparseable`).toBe(false);
    }
  });
});

describe("The reader experience works", () => {
  it("search finds the obvious questions", () => {
    const cases: [string, string][] = [
      ["import students", "student-import"],
      ["whatsapp automation", "communication-automation"],
      ["parent fees", "role-parent"],
      ["check-in radius", "checkin-setup"],
      ["receipt logo", "troubleshoot-receipt-logo"],
    ];
    for (const [q, expected] of cases) {
      const hits = searchDocs(q).map((h) => h.article.slug);
      expect(hits, `"${q}" did not surface ${expected}`).toContain(expected);
    }
  });

  it("search requires every term, so it does not return everything", () => {
    expect(searchDocs("zzzz nonexistent term")).toEqual([]);
    expect(searchDocs("a")).toEqual([]); // too short to be meaningful
  });

  it("role filtering uses metadata, not titles", () => {
    const parent = searchDocs("fees", "parent").map((h) => h.article.slug);
    for (const slug of parent) {
      expect(BY_SLUG.get(slug)!.roles, `${slug} surfaced for parent`).toContain("parent");
    }
  });

  it("previous/next chains across the whole reading order", () => {
    const order = readingOrder("all");
    expect(order.length).toBe(ARTICLES.length);
    expect(neighbours(order[0].slug, "all").prev).toBeNull();
    expect(neighbours(order[order.length - 1].slug, "all").next).toBeNull();
    // And the middle is actually linked.
    const mid = order[Math.floor(order.length / 2)];
    expect(neighbours(mid.slug, "all").prev).not.toBeNull();
    expect(neighbours(mid.slug, "all").next).not.toBeNull();
  });

  it("every role has at least one guide", () => {
    for (const r of DOC_ROLES) {
      const n = ARTICLES.filter((a) => a.roles.includes(r.id)).length;
      expect(n, `no documentation serves ${r.label}`).toBeGreaterThan(0);
    }
  });
});

describe("The gate cannot pass vacuously", () => {
  // Mutation-testing the rule that matters most.

  it("DETECTS an article claiming an aspirational feature", () => {
    const aspirational = inventory.submodules.find((s) => s.status === "ASPIRATIONAL");
    expect(aspirational, "no aspirational submodule to test against").toBeTruthy();

    const fake = { slug: "fake", permissions: [aspirational!.id] };
    const s = byId.get(fake.permissions[0]);
    const wouldFail = !!s && s.status !== "SHIPPED" && s.status !== "LEGACY_ONLY";
    expect(wouldFail, "the gate would NOT catch a fabricated feature guide").toBe(true);
  });

  it("DETECTS a broken related link", () => {
    expect(BY_SLUG.has("definitely-not-a-real-article")).toBe(false);
  });

  it("DETECTS a missing source file", () => {
    expect(existsSync(join(ROOT, "src/features/docs/NoSuchFile.ts"))).toBe(false);
  });

  it("scans a real corpus", () => {
    // If ARTICLES were empty every assertion above would pass.
    expect(ARTICLES.length).toBeGreaterThan(10);
    expect(ARTICLES.some((a) => (a.steps?.length ?? 0) > 0)).toBe(true);
  });
});

describe("Coverage (warning only — never fails the build)", () => {
  it("reports shipped submodules with no documentation", () => {
    const documented = new Set(ARTICLES.flatMap((a) => a.permissions));
    const gaps = shipped.filter((s) => !documented.has(s.id));
    // Deliberately NOT an assertion. Coverage is a backlog, not a defect —
    // failing the build on it would push people to write thin filler pages
    // just to make CI green, which is worse than an honest gap.
    if (gaps.length) {
      console.info(
        `[docs coverage] ${shipped.length - gaps.length}/${shipped.length} shipped submodules documented; ` +
        `${gaps.length} remaining, e.g. ${gaps.slice(0, 5).map((g) => g.id).join(", ")}`,
      );
    }
    expect(shipped.length).toBeGreaterThan(0);
  });
});

describe("Screenshot provenance (Phase Q)", () => {
  it("a published screenshot must be marked as really captured", () => {
    // The rule that makes fabrication detectable rather than merely
    // discouraged: an image on disk that nobody attested to is refused.
    const bad = SCREENSHOTS.filter((s) => s.file && s.capturedFromRealApp !== true);
    expect(
      bad.map((s) => s.id),
      "these screenshots have a file but are not marked capturedFromRealApp",
    ).toEqual([]);
  });

  it("a published screenshot must have passed privacy review", () => {
    // Real screens carry real names and numbers. Publishing one that nobody
    // checked is how a student's phone number ends up in a public repo.
    const bad = SCREENSHOTS.filter((s) => s.file && s.privacyReviewed !== true);
    expect(bad.map((s) => s.id), "published without privacy review").toEqual([]);
  });

  it("cannot claim a real capture with no file", () => {
    const bad = SCREENSHOTS.filter((s) => !s.file && s.capturedFromRealApp === true);
    expect(bad.map((s) => s.id), "claims a capture but has no image").toEqual([]);
  });

  it("every screenshot names a route that some article's module can reach", () => {
    // A screenshot route that matches nothing in the inventory is either a typo
    // or a screen that no longer exists.
    const routes = new Set(
      inventory.submodules.filter((s) => s.route).map((s) => s.route as string),
    );
    // Portal roots and settings paths are mounted outside the RBAC catalog.
    const KNOWN_OUTSIDE_CATALOG = /^\/(admin|management|coordinator|teacher|parent|settings)(\/|$)/;
    const orphan = SCREENSHOTS.filter(
      (s) => !routes.has(s.route) && !KNOWN_OUTSIDE_CATALOG.test(s.route),
    );
    expect(orphan.map((s) => `${s.id} → ${s.route}`), "screenshot routes not found").toEqual([]);
  });

  it("reports screenshot coverage without failing (warning only)", () => {
    const captured = SCREENSHOTS.filter((s) => s.file).length;
    if (captured < SCREENSHOTS.length) {
      console.info(
        `[docs screenshots] ${captured}/${SCREENSHOTS.length} captured. ` +
        "Capture needs an authenticated session per role — see " +
        "docs/DOCUMENTATION_SCREENSHOT_SHOT_LIST.md",
      );
    }
    expect(SCREENSHOTS.length).toBeGreaterThan(0);
  });
});
