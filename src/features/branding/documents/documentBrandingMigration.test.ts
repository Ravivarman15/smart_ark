import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ════════════════════════════════════════════════════════════════════════════
// MIGRATION GATE — 20260912_phase7a_document_branding.sql
//
// This migration WRITES DATA to a live production tenant's row. That is
// unusual enough to deserve a gate: it is the only way to move ARK's identity
// out of source and into its own tenant record without blanking a live
// document, and it must stay as narrowly scoped as it was written.
//
// Every assertion here corresponds to a promise made in
// docs/DYNAMIC_DOCUMENT_BRANDING.md §8.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const SQL = readFileSync(
  join(ROOT, "supabase/migrations/20260912_phase7a_document_branding.sql"),
  "utf8",
);

/**
 * SQL comments legitimately discuss destructive operations in prose — the
 * whole point of the header is explaining what is NOT done. Only executable
 * statements are searched.
 */
const executable = SQL.replace(/^\s*--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("The migration is additive only", () => {
  it("drops nothing", () => {
    // A DROP here would take a column, a policy or a trigger with it on a
    // database holding a paying customer's history.
    for (const forbidden of [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bDROP\s+POLICY\b/i,
      /\bDROP\s+TRIGGER\b/i,
      /\bTRUNCATE\b/i,
      /\bDELETE\s+FROM\b/i,
    ]) {
      expect(executable, `migration contains ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("adds every column with IF NOT EXISTS", () => {
    const adds = executable.match(/ADD COLUMN[^,;]*/gi) ?? [];
    expect(adds.length).toBe(6);
    for (const a of adds) {
      expect(a, `not idempotent: ${a.trim()}`).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("adds no NOT NULL column", () => {
    // A NOT NULL addition without a default fails on a table with rows, and
    // WITH a default silently backfills every existing tenant.
    const adds = executable.match(/ADD COLUMN[^,;]*/gi) ?? [];
    for (const a of adds) {
      expect(a, `${a.trim()} would rewrite existing rows`).not.toMatch(/NOT NULL/i);
    }
  });

  it("replaces the validation function rather than dropping its trigger", () => {
    // DROP TRIGGER + CREATE TRIGGER leaves a window in which writes are
    // unvalidated. CREATE OR REPLACE FUNCTION keeps the existing binding.
    expect(executable).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_branding/);
    expect(executable).not.toMatch(/DROP TRIGGER/i);
  });

  it("validates the three NEW colour columns", () => {
    // They reach an inline `background:` in generated HTML — strictly a worse
    // injection surface than the theme colours already guarded.
    for (const col of [
      "receipt_primary_color",
      "receipt_secondary_color",
      "receipt_accent_color",
    ]) {
      expect(
        executable.slice(
          executable.indexOf("FOREACH c IN ARRAY"),
          executable.indexOf("END LOOP"),
        ),
        `${col} is not run through the hex check`,
      ).toContain(`NEW.${col}`);
    }
  });
});

describe("The ARK seed is bounded", () => {
  // Anchored on EXECUTABLE text at both ends. An earlier version bounded this
  // on the "PART 4" banner, which is a comment — stripped before the search, so
  // indexOf returned -1 and slice(start, -1) silently swept in the verification
  // block. The gate still passed, for the wrong reason.
  const seedStart = executable.indexOf("DECLARE ark uuid");
  const seedEnd = executable.indexOf("DECLARE missing text");
  const seed = executable.slice(seedStart, seedEnd);

  it("the seed block was actually located and bounded", () => {
    // Otherwise every assertion below passes vacuously against "".
    expect(seedStart).toBeGreaterThan(-1);
    expect(seedEnd).toBeGreaterThan(seedStart);
    expect(seed.length).toBeGreaterThan(400);
    expect(seed).toContain("UPDATE public.organization_branding");
    // And it must NOT have swallowed the verification block that follows it.
    expect(seed).not.toContain("information_schema.columns");
  });

  it("targets exactly one organization, by slug", () => {
    expect(seed).toMatch(/WHERE slug = 'ark'/);
    expect(seed).toMatch(/WHERE organization_id = ark/);
  });

  it("has no unscoped UPDATE", () => {
    // An UPDATE without a WHERE would rewrite every tenant's branding at once.
    const updates = seed.match(/UPDATE public\.organization_branding[\s\S]*?;/g) ?? [];
    expect(updates.length).toBe(1);
    expect(updates[0]).toMatch(/WHERE organization_id = ark/);
  });

  it("overwrites nothing — every assignment is COALESCE", () => {
    // This is what makes the seed safe AND re-runnable: it fills NULLs, so a
    // value ARK later sets through the UI wins over the seed permanently.
    const update = (seed.match(/UPDATE public\.organization_branding[\s\S]*?;/g) ?? [])[0] ?? "";
    const assignments = update
      .split("SET")[1]
      .split("WHERE")[0]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="));
    expect(assignments.length).toBeGreaterThanOrEqual(6);
    for (const a of assignments) {
      expect(a, `assignment is not COALESCE-guarded: ${a}`).toMatch(/=\s*COALESCE\(/);
    }
  });

  it("tolerates a database with no ARK tenant", () => {
    // A fresh database or a preview branch has no such row. Seeding must be a
    // no-op there, not a failed migration.
    expect(seed).toMatch(/IF ark IS NULL THEN/);
    expect(seed).toMatch(/RETURN;/);
  });

  it("does NOT write receipt colours", () => {
    // ARK renders through the ordinary unconfigured-tenant path to the system
    // default. Writing colours here would special-case ARK and would fight any
    // future change to the product default.
    expect(seed).not.toMatch(/receipt_primary_color\s*=/);
    expect(seed).not.toMatch(/receipt_secondary_color\s*=/);
    expect(seed).not.toMatch(/receipt_accent_color\s*=/);
  });

  it("seeds exactly the values the production documents printed", () => {
    // If any of these drifts from what SalarySlip.tsx used to hardcode, ARK's
    // live document changes — which is the one thing this phase must not do.
    expect(seed).toContain("ARK Learning Arena");
    expect(seed).toContain("No 2/31, Mugappair West, Chennai");
    expect(seed).toContain("7358199217");
    expect(seed).toContain("www.arklearning.com");
    expect(seed).toContain("/ark-logo.jpeg");
  });
});

describe("The migration verifies itself", () => {
  it("fails loudly if a column did not land", () => {
    // Reporting success against a half-applied schema is how a deploy looks
    // green while every document renders unbranded.
    const verify = executable.slice(executable.indexOf("DECLARE missing text"));
    expect(verify.length, "verification block not found").toBeGreaterThan(200);
    expect(verify).toMatch(/RAISE EXCEPTION 'phase7a incomplete/);
    expect(verify).toContain("information_schema.columns");
  });
});

describe("ARK's seeded logo is actually servable", () => {
  it("public/ark-logo.jpeg exists", () => {
    // The seed points logo_url at this path. A missing file means ARK's
    // receipt silently degrades to a monogram — correct code, wrong document.
    const buf = readFileSync(join(ROOT, "public/ark-logo.jpeg"));
    expect(buf.length).toBeGreaterThan(1000);
  });
});
