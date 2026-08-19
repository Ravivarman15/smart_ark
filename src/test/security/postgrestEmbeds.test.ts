// ──────────────────────────────────────────────────────────────────────────────
// AMBIGUOUS POSTGREST EMBEDS
//
// ┌── THE BUG THIS EXISTS TO KILL ─────────────────────────────────────────┐
// │ A parent opened Documents and got                                      │
// │                                                                        │
// │   "Could not embed because more than one relationship was found        │
// │    for 'student_documents' and 'students'"                             │
// │                                                                        │
// │ `student_documents` has TWO foreign keys to `students`: the plain      │
// │ `student_id` one, and the composite `(organization_id, student_id)`    │
// │ tenant-integrity key the multi-tenancy work added. PostgREST will not  │
// │ guess between them — it answers HTTP 300 / PGRST201.                   │
// │                                                                        │
// │ That constraint was added to TEN tables, so ten relationships broke at │
// │ once. Documents was simply the first one anybody opened. Every one was │
// │ confirmed against the live database.                                   │
// │                                                                        │
// │ The failure is invisible until runtime: it type-checks, it builds, and │
// │ nothing about `students(name)` looks wrong. This gate is the only      │
// │ thing that can see it before a parent does.                            │
// └────────────────────────────────────────────────────────────────────────┘
//
// The pair list in `fixtures/ambiguousEmbeds.json` is GENERATED from the live
// schema (see docs/POSTGREST_AMBIGUOUS_EMBEDS.md). It is data, not judgement:
// adding a second foreign key between two tables adds a pair, and every embed
// across it must then name its constraint.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import fixture from "../fixtures/ambiguousEmbeds.json";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

interface Pair {
  child: string;
  parent: string;
  constraints: string[];
}
const PAIRS = fixture.pairs as Pair[];

const byChild = new Map<string, Set<string>>();
for (const p of PAIRS) {
  if (!byChild.has(p.child)) byChild.set(p.child, new Set());
  byChild.get(p.child)!.add(p.parent);
}

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && !/\.test\.|[\\/]testing[\\/]/.test(p)) out.push(p);
    }
  };
  walk(SRC);
  return out;
};

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * How far from a `.from("table")` an embed still counts as belonging to it.
 *
 * Selects are written two ways here — inline in the chain, and as a `const`
 * declared just above it — so the window has to reach backwards as well as
 * forwards. Wide enough for both, narrow enough that an unrelated query later
 * in the same file is not blamed.
 */
const WINDOW = 700;

interface Finding {
  file: string;
  child: string;
  parent: string;
  snippet: string;
}

const scan = (): Finding[] => {
  const findings: Finding[] = [];

  for (const file of sourceFiles()) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/\.from\(\s*["'`](\w+)["'`]/g)) {
      const child = m[1];
      const parents = byChild.get(child);
      if (!parents) continue;

      const start = Math.max(0, m.index - WINDOW);
      const zone = src.slice(start, m.index + WINDOW);

      for (const e of zone.matchAll(/(?:(\w+)\s*:\s*)?(\w+)(![\w]+)?\(/g)) {
        const [, , name, bang] = e;
        if (!parents.has(name)) continue;
        // `!inner` / `!left` are join MODIFIERS, not constraint names — they
        // disambiguate nothing. Anything else after `!` names the relationship.
        if (bang && bang !== "!inner" && bang !== "!left") continue;
        findings.push({
          file: file.replace(ROOT, "").replace(/\\/g, "/"),
          child,
          parent: name,
          snippet: zone.slice(Math.max(0, e.index - 40), e.index + 80).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return findings;
};

describe("No query embeds across an ambiguous relationship", () => {
  it("names the constraint on every embed PostgREST cannot resolve", () => {
    const findings = scan();
    const report = findings
      .map((f) => `  ${f.file}: ${f.child} → ${f.parent}\n      …${f.snippet}…`)
      .join("\n");
    expect(
      findings,
      findings.length === 0
        ? ""
        : `\nThese embeds return HTTP 300 (PGRST201) at runtime because the two ` +
          `tables are joined by more than one foreign key.\nWrite ` +
          `\`parent:parent!<constraint_name>(...)\` — the constraint names are in ` +
          `src/test/fixtures/ambiguousEmbeds.json.\n\n${report}\n`,
    ).toEqual([]);
  });
});

describe("The generated pair list is usable", () => {
  it("carries a constraint list for every pair", () => {
    // The failure message hands the developer the exact name to use. Without
    // it the gate says "this is wrong" and leaves them to find out why.
    for (const p of PAIRS) {
      expect(p.constraints.length, `${p.child} → ${p.parent}`).toBeGreaterThan(1);
    }
  });

  it("still covers the ten relationships the tenancy work broke", () => {
    // Pinned by name: these are the pairs whose SECOND key is the composite
    // `(organization_id, …)` tenant-integrity constraint. If a regeneration
    // silently drops one, the gate would stop watching the exact tables that
    // produced the outage.
    const sameOrg = PAIRS.filter((p) => p.constraints.some((c) => c.endsWith("_same_org")))
      .map((p) => `${p.child}→${p.parent}`)
      .sort();
    expect(sameOrg).toEqual(
      [
        "class_students→students",
        "exam_results→students",
        "leave_requests→profiles",
        "parent_student_links→students",
        "payroll_items→profiles",
        "staff_attendance→profiles",
        "student_attendance→students",
        "student_auth_accounts→students",
        "student_documents→students",
        "student_fees→students",
      ].sort(),
    );
  });

  it("scans the files that actually hold the fixed queries", () => {
    // Guards the scanner itself: a walk that silently stopped finding source
    // files would make this whole suite pass by looking at nothing.
    const files = sourceFiles();
    for (const f of [
      "features/students/services/documents.service.ts",
      "features/attendance/services/studentAttendance.service.ts",
      "features/auth-accounts/services/authAccounts.service.ts",
      "features/communication/services/commsRecipients.service.ts",
      "features/reports/services/reportAggregator.service.ts",
    ]) {
      expect(
        files.some((s) => s.replace(/\\/g, "/").endsWith(f)),
        `scanner never visited ${f}`,
      ).toBe(true);
    }
  });
});
