import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7 — TENANT BRANDING LEAK GATE
//
// Smart ARK is a SaaS platform. Organization A must never see Organization B's
// identity. Phase 6 fixed the two documents; the Phase 7 audit found the leak
// in eleven more places, including the unauthenticated enquiry form and the
// transactional email defaults.
//
// This gate is what stops the twelfth.
//
// ┌── WHY IT IS NOT A GLOBAL GREP ─────────────────────────────────────────┐
// │ "ARK Learning Arena" appears legitimately in migrations that seed      │
// │ ARK's own row, in tests that assert ARK renders correctly, in the      │
// │ marketing site's customer story, and in comments explaining the bug.   │
// │ A naive repo-wide grep fails on all of those, so somebody adds an      │
// │ exception, then another, and within a month it is disabled.            │
// │                                                                        │
// │ So every path is CLASSIFIED. The gate scans exactly the customer-      │
// │ facing category and the allowlist states a reason per entry. An        │
// │ unclassified new file is scanned by default — silence fails closed.    │
// └────────────────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const FUNCTIONS = join(ROOT, "supabase", "functions");

/** Strings that identify the ARK tenant specifically. */
const TENANT_MARKERS = [
  "ARK Learning Arena",
  "ARK LEARNING ARENA",
  "arklearning.com",
  "thearktuition.com",
  "arktuition",
  "7358199217",
  "Mugappair",
  "ARK ERP",
  "ARK CRM",
  "ARK School",
  "The Ark Tuition",
  "assets/ark-logo",
];

// ── Classification ──────────────────────────────────────────────────────────
//
// Category D (documentation) is handled by stripping comments rather than by
// exempting files: a comment explaining "this used to say ARK Learning Arena"
// is the reason the fix survives, and deleting it to satisfy a linter loses
// more than it gains.

/**
 * Category C — TEST FIXTURES. Files whose PURPOSE is asserting that ARK still
 * renders as ARK. Excluding them is not a loophole: a test that cannot name
 * the tenant it is testing cannot test it.
 */
const CATEGORY_C_TESTS = (rel: string) =>
  /\.(test|spec)\.(ts|tsx)$/.test(rel) || rel.includes(`${sep}testing${sep}`);

/**
 * Category A — PLATFORM-OWNED. Smart ARK's own marketing site may state, as a
 * matter of fact, that the product runs ARK Learning Arena. That is a customer
 * story on the vendor's website, not a tenant's ERP rendering the wrong name.
 */
const CATEGORY_A_PLATFORM = new Set([
  join("features", "marketing", "components", "sections.tsx"),
  join("features", "marketing", "pages", "ContentPages.tsx"),
]);

/**
 * Category B — KNOWN, ACCEPTED, NOT CUSTOMER-FACING.
 *
 * Each entry states WHY it is tolerated and what would have to happen to
 * remove it. An entry with no reason is not allowed — the map is typed so
 * omitting one is impossible.
 */
const CATEGORY_B_ACCEPTED: Record<string, string> = {
  [join("components", "ReceiptGenerator.tsx")]:
    "DEAD CODE — zero importers, reads the legacy AppDataContext and could not " +
    "render live data if mounted. Asserted still-dead below, so this exemption " +
    "cannot outlive the fact that justifies it.",

  [join("contexts", "AppDataContext.tsx")]:
    "ARK's two campus GPS coordinates, used by staff check-in geofencing. This " +
    "is a REAL multi-tenancy defect (ABC Academi staff geofence against a " +
    "Chennai address 300km away) but fixing it is not a branding change: the " +
    "campuses table holds different coordinates for ARK than the constant does, " +
    "so switching to it would move ARK's live geofence. Documented in " +
    "docs/TENANT_BRANDING_SURFACE_AUDIT.md as the top non-branding finding.",

  [join("core", "constants", "config.ts")]:
    "Same ARK campus coordinates, feeding features/staff/utils/geo.ts — which " +
    "is dead code. Removed together with the AppDataContext geofence.",

  [join("pages", "Login.tsx")]:
    "Comments only; the page itself resolves branding per host. Retained " +
    "because they explain the bug this file already fixed.",
};

/** Files under supabase/functions that are allowed to mention a tenant. */
const FUNCTIONS_ALLOWED: Record<string, string> = {
  [join("send-daily-report", "index.ts")]:
    "REPORT_RECIPIENT is ARK's management WhatsApp number for a platform " +
    "operations cron. Not rendered to any customer. Becomes per-tenant " +
    "configuration when the daily report is offered to other organizations.",
};

// ── File collection ─────────────────────────────────────────────────────────

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
};

/**
 * Strip comments so prose about the bug does not trip the gate on the code
 * that fixed it.
 *
 * Line comments FIRST. A block-comment pass that runs first can be fooled by a
 * `//` comment containing `/*`, which then eats the rest of the file — and a
 * gate reading an empty string passes every assertion for the wrong reason.
 */
const stripComments = (s: string): string =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

interface Hit {
  file: string;
  marker: string;
  line: number;
}

const scan = (root: string, allowed: Record<string, string>, isTest: (r: string) => boolean): Hit[] => {
  const hits: Hit[] = [];
  for (const abs of walk(root)) {
    const rel = relative(root, abs);
    if (isTest(rel)) continue;
    if (allowed[rel] !== undefined) continue;
    if (CATEGORY_A_PLATFORM.has(rel)) continue;

    const raw = readFileSync(abs, "utf8");
    const code = stripComments(raw);
    for (const marker of TENANT_MARKERS) {
      if (!code.includes(marker)) continue;
      // Report the line in the ORIGINAL file, not in the stripped copy.
      // Stripping removes whole comment blocks, so a stripped-text offset can
      // be dozens of lines off — and a gate that points at the wrong line
      // sends the next person hunting through a file that looks clean.
      const at = raw.indexOf(marker);
      hits.push({ file: rel, marker, line: raw.slice(0, at).split("\n").length });
    }
  }
  return hits;
};

// ════════════════════════════════════════════════════════════════════════════

describe("No customer-facing source hardcodes a tenant", () => {
  it("src/ is clean", () => {
    const hits = scan(SRC, CATEGORY_B_ACCEPTED, CATEGORY_C_TESTS);
    const report = hits.map((h) => `${h.file}:${h.line} → "${h.marker}"`);
    expect(
      report,
      "These files render one tenant's identity to every tenant. Make them " +
        "resolve branding, or classify them in CATEGORY_B_ACCEPTED with a reason.",
    ).toEqual([]);
  });

  it("supabase/functions is clean", () => {
    // Edge functions send EMAIL and WHATSAPP. A hardcoded tenant here reaches
    // a real parent's inbox under a number they trust.
    const hits = scan(FUNCTIONS, FUNCTIONS_ALLOWED, (r) => r.includes(".test."));
    const report = hits.map((h) => `${h.file}:${h.line} → "${h.marker}"`);
    expect(report).toEqual([]);
  });
});

describe("The gate cannot pass vacuously", () => {
  // Mutation-testing the gate. Every assertion above is an `toEqual([])`, which
  // is exactly what an empty scan produces — so the scan must be shown to work.

  it("scans a substantial number of files", () => {
    const scanned = walk(SRC).filter((abs) => {
      const rel = relative(SRC, abs);
      return !CATEGORY_C_TESTS(rel) && CATEGORY_B_ACCEPTED[rel] === undefined;
    });
    expect(scanned.length, "the walker found almost nothing — wrong root?").toBeGreaterThan(300);
  });

  it("DETECTS an injected tenant name in customer-facing code", () => {
    // The mutation the brief asks for: unauthorized customer-facing source.
    const injected = `export const Header = () => <h1>ARK Learning Arena</h1>;`;
    const code = stripComments(injected);
    const found = TENANT_MARKERS.filter((m) => code.includes(m));
    expect(found, "the gate would NOT catch a hardcoded tenant name").toContain(
      "ARK Learning Arena",
    );
  });

  it("DETECTS the ark logo import", () => {
    const injected = `import arkLogo from "@/assets/ark-logo.jpeg";`;
    expect(TENANT_MARKERS.some((m) => injected.includes(m))).toBe(true);
  });

  it("does NOT flag a tenant name inside a comment", () => {
    // Category D. Comments explaining the bug must survive.
    const commented = `// Was "ARK Learning Arena" — see docs.\nexport const x = 1;`;
    const code = stripComments(commented);
    expect(TENANT_MARKERS.some((m) => code.includes(m))).toBe(false);
  });

  it("does NOT flag a fixture tenant name like ABC Academy", () => {
    // Test organizations are not tenant leaks. Flagging them would push people
    // to write tests that cannot name what they assert.
    const fixture = `const ABC = { organizationName: "ABC Academy" };`;
    expect(TENANT_MARKERS.some((m) => fixture.includes(m))).toBe(false);
  });

  it("strips comments without swallowing the file", () => {
    const src = readFileSync(join(SRC, "features/fee/components/FeeReceiptDialog.tsx"), "utf8");
    const stripped = stripComments(src);
    expect(stripped).toContain("ReceiptBody");
    expect(stripped.length).toBeGreaterThan(src.length / 3);
  });

  it("every Category B exemption names a real file", () => {
    // A renamed file would silently turn an exemption into dead config, and
    // the real file would then be scanned — which is safe — but the stale
    // entry would mislead the next reader.
    for (const rel of Object.keys(CATEGORY_B_ACCEPTED)) {
      expect(() => statSync(join(SRC, rel)), `${rel} no longer exists`).not.toThrow();
    }
    for (const rel of Object.keys(FUNCTIONS_ALLOWED)) {
      expect(() => statSync(join(FUNCTIONS, rel)), `${rel} no longer exists`).not.toThrow();
    }
    for (const rel of CATEGORY_A_PLATFORM) {
      expect(() => statSync(join(SRC, rel)), `${rel} no longer exists`).not.toThrow();
    }
  });

  it("every Category B exemption states a reason", () => {
    for (const [rel, why] of Object.entries({ ...CATEGORY_B_ACCEPTED, ...FUNCTIONS_ALLOWED })) {
      expect(why.length, `${rel} is exempted without an explanation`).toBeGreaterThan(60);
    }
  });
});

describe("Exemptions that depend on a fact still hold", () => {
  it("ReceiptGenerator is still dead code", () => {
    // Its exemption is "nobody imports it". The moment somebody does, it must
    // be branded or deleted — and this fails until one of those happens.
    const importers = walk(SRC).filter((abs) => {
      const rel = relative(SRC, abs);
      if (rel === join("components", "ReceiptGenerator.tsx")) return false;
      if (CATEGORY_C_TESTS(rel)) return false;
      return /from\s+["'][^"']*ReceiptGenerator["']/.test(readFileSync(abs, "utf8"));
    });
    expect(importers.map((f) => relative(SRC, f))).toEqual([]);
  }, 30_000);

  it("the dead geo helper still has no callers", () => {
    // features/staff/utils/geo.ts reads ARK's coordinates from config.ts. It is
    // re-exported but never called; if that changes, the config exemption stops
    // being harmless.
    const callers = walk(SRC).filter((abs) => {
      const rel = relative(SRC, abs);
      if (CATEGORY_C_TESTS(rel)) return false;
      const src = readFileSync(abs, "utf8");
      return /from\s+["'].*staff\/utils\/geo["']/.test(src);
    });
    expect(callers.map((f) => relative(SRC, f))).toEqual([]);
    // 30s, not the default 5s: this walks and READS every source file, so its
    // runtime scales with repository size rather than with what it asserts.
    // Phase 8 added enough files to tip it over. No assertion changed.
  }, 30_000);
});

describe("Platform identity is not tenant identity", () => {
  it("the email default names the PLATFORM, not a tenant", () => {
    // DEFAULT_BRANDING was `orgName: "The Ark Tuition"` with an empty override
    // map, so EVERY transactional email the platform sent — for every tenant —
    // was signed with one customer's name.
    const src = readFileSync(join(FUNCTIONS, "_shared", "email-templates.ts"), "utf8");
    const decl = src.slice(src.indexOf("export const DEFAULT_BRANDING"));
    const body = decl.slice(0, decl.indexOf("};"));
    expect(body).toContain('orgName: "Smart ARK"');
    for (const m of TENANT_MARKERS) {
      expect(body, `the email default still carries "${m}"`).not.toContain(m);
    }
  });

  it("the public form falls back to the platform, never to a tenant", () => {
    const src = readFileSync(join(SRC, "features/branding/publicTenant.ts"), "utf8");
    const code = stripComments(src);
    expect(code).toContain("Smart ARK");
    for (const m of TENANT_MARKERS) {
      expect(code, `public tenant resolution can fall back to "${m}"`).not.toContain(m);
    }
  });

  it("the document resolver's neutral identity is the platform's", () => {
    const src = readFileSync(join(SRC, "features/branding/documents/documentBranding.service.ts"), "utf8");
    const code = stripComments(src);
    expect(code).toContain('organizationName: "Smart ARK"');
  });
});

describe("Public pages resolve their tenant, and never trust an id", () => {
  const PUBLIC_PAGES = [
    "features/leads/pages/PublicLeadFormPage.tsx",
    "features/enquiries/pages/PublicAdmissionFormPage.tsx",
  ];

  it("both resolve branding from host/slug", () => {
    for (const rel of PUBLIC_PAGES) {
      const code = stripComments(readFileSync(join(SRC, rel), "utf8"));
      expect(code, `${rel} does not resolve a public tenant`).toContain("usePublicTenant");
    }
  });

  it("neither reads an organization id from the URL", () => {
    // The rule: a public page may be told a SLUG (a public identifier the
    // database resolves) but must never accept an organization_id it would
    // then write with.
    for (const rel of PUBLIC_PAGES) {
      const code = stripComments(readFileSync(join(SRC, rel), "utf8"));
      expect(code, `${rel} reads an organization id from the browser`)
        .not.toMatch(/organization_?[Ii]d.*searchParams|searchParams.*organization_?[Ii]d/);
      expect(code).not.toMatch(/useParams<\{\s*organizationId/);
    }
  });

  it("the lead submission sends a slug, not an organization id", () => {
    const code = stripComments(
      readFileSync(join(SRC, "features/leads/services/leads.service.ts"), "utf8"),
    );
    expect(code).toContain("submit_public_lead");
    expect(code).toContain("_slug: input.orgSlug");
    // If this ever appears, the browser is choosing which tenant a lead
    // lands in.
    expect(code).not.toMatch(/organization_id:\s*input\./);
  });
});
