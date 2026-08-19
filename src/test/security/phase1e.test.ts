import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1E GATES — COMPOSITE UNIQUE KEYS
//
// The central risk of 1E is DESYNC: the migration changes a unique constraint
// but the matching `onConflict` string is missed, or vice versa. Postgres
// rejects ON CONFLICT unless a unique index matches the named columns exactly,
// so a desync is a RUNTIME failure on a production write path — attendance
// submission, exam entry, RBAC grants — that no compiler and no type check can
// catch.
//
// The gate below therefore derives BOTH sides from the files and cross-checks
// them against each other, rather than asserting a hand-written list twice.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const SRC = join(ROOT, "src");
const P1E = "20260807_phase1e_composite_unique_keys.sql";

const read = (p: string) => readFileSync(p, "utf8");
const sql = read(join(MIGRATIONS, P1E));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

/** Every `onConflict: "..."` string in src/, excluding this test tree. */
/**
 * Comments removed, so a call-site scan cannot match prose.
 *
 * Added when a doc comment EXPLAINING why a call site avoids
 * `onConflict: "key"` was itself reported as a violation. A gate that cannot
 * tell code from the note about the code punishes documenting the decision,
 * and the fix people reach for is deleting the explanation.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function collectOnConflicts(): { file: string; cols: string[] }[] {
  const out: { file: string; cols: string[] }[] = [];
  for (const file of walk(SRC)) {
    if (file.includes(join("test", "security"))) continue;
    const src = stripComments(read(file));
    for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      out.push({ file: file.replace(ROOT, ""), cols: m[1].split(",").map((c) => c.trim()) });
    }
  }
  return out;
}

/**
 * Keys declared with organization_id ALREADY IN THEM, anywhere in the migration
 * history — e.g. `PRIMARY KEY (organization_id, feature_key)`.
 *
 * Tables created AFTER 1E are born tenant-composite and are never "converted",
 * so a prefixed onConflict against one of them is correct and must not be
 * reported as an orphan. Derived from the migrations rather than allow-listed
 * by hand, so a future table gets the same treatment automatically.
 */
function collectNativeCompositeKeys(): string[][] {
  const out: string[][] = [];
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
    const body = read(join(MIGRATIONS, f));

    // Multi-column: PRIMARY KEY (organization_id, key) / UNIQUE (organization_id, …)
    for (const m of body.matchAll(
      /(?:PRIMARY KEY|UNIQUE)\s*\(\s*organization_id\s*,\s*([a-z_,\s]+?)\)/gi,
    )) {
      out.push(["organization_id", ...m[1].split(",").map((c) => c.trim())]);
    }

    // A standalone UNIQUE INDEX is just as valid an ON CONFLICT arbiter as a
    // table constraint — but ONLY when it is total. Postgres can infer a
    // PARTIAL index only if the INSERT carries a WHERE clause implying the
    // predicate, and neither PostgREST's .upsert() nor a plain
    // `INSERT … ON CONFLICT (cols)` emits one. So a partial index deliberately
    // does NOT count here: an upsert aimed at one fails at runtime with
    // "no unique or exclusion constraint matching the ON CONFLICT
    // specification", which is precisely the orphan this gate exists to catch.
    for (const m of body.matchAll(
      /CREATE UNIQUE INDEX[^;]*?\(\s*organization_id\s*,\s*([a-z_,\s]+?)\)([^;]*);/gi,
    )) {
      if (/\bWHERE\b/i.test(m[2])) continue;
      out.push(["organization_id", ...m[1].split(",").map((c) => c.trim())]);
    }

    // Single-column: `organization_id uuid PRIMARY KEY REFERENCES …`.
    // One-row-per-organization tables (billing_profiles, organization_branding)
    // legitimately upsert on organization_id ALONE, and a detector that only
    // understands composite keys reports those correct call sites as orphans.
    if (/organization_id\s+uuid\s+PRIMARY KEY/i.test(body)) {
      out.push(["organization_id"]);
    }
  }
  return out;
}

/** The (table, columns) pairs the migration converts. */
function collectConvertedTargets(): { table: string; cols: string[] }[] {
  const block = sql.slice(
    sql.indexOf("INSERT INTO _org_unique_targets"),
    sql.indexOf("-- DELIBERATELY EXCLUDED"),
  );
  const out: { table: string; cols: string[] }[] = [];
  for (const m of block.matchAll(/\('([a-z_]+)',\s*ARRAY\[([^\]]+)\]/g)) {
    out.push({
      table: m[1],
      cols: m[2].split(",").map((c) => c.trim().replace(/^'|'$/g, "")),
    });
  }
  return out;
}

describe("Migration structure", () => {
  it("converts a non-trivial number of constraints", () => {
    // Guards against a regex change silently making every assertion vacuous.
    expect(collectConvertedTargets().length).toBeGreaterThanOrEqual(15);
  });

  it("every converted constraint gains organization_id as the leading column", () => {
    expect(sql).toMatch(/ADD CONSTRAINT %I UNIQUE \(organization_id, %s\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX %I ON public\.%I \(organization_id, %s\)/);
  });

  it("skips absent tables instead of aborting", () => {
    // Several migrations are known to be unapplied on the live database.
    expect(sql).toMatch(/to_regclass/);
    expect(sql).toMatch(/not present — skipped/);
  });

  it("is idempotent — a converted constraint is not converted twice", () => {
    expect(sql).toMatch(/conname = new_name/);
  });

  it("finds the old constraint by COLUMN SET, not by a guessed name", () => {
    // Postgres auto-names (`campuses_name_key`) and hand-named constraints
    // coexist; matching on the column set handles both.
    //
    // The ::text cast is load-bearing, not style. pg_attribute.attname is type
    // `name`, so without it the comparison is `name[] = text[]` — an operator
    // that does not exist. It raises 42883, the conversion loop's EXCEPTION
    // handler swallows it as a "skip", and the migration reports success having
    // converted NOTHING. That is precisely what happened on the first live
    // deployment, and the app was already sending
    // onConflict:"organization_id,…", so every affected upsert was failing 42P10.
    expect(sql).toMatch(/array_agg\(a\.attname::text ORDER BY a\.attname::text\)/);
  });
});

describe("Constraint ↔ call-site synchronisation", () => {
  const converted = collectConvertedTargets();
  const onConflicts = collectOnConflicts();

  it("no onConflict names a converted constraint without organization_id", () => {
    // THE core 1E regression. If this fails, the named upsert will throw
    // "no unique or exclusion constraint matching the ON CONFLICT
    // specification" the first time a user triggers that write.
    const desynced: string[] = [];
    for (const oc of onConflicts) {
      if (oc.cols.includes("organization_id")) continue;
      const set = [...oc.cols].sort().join(",");
      const hit = converted.find((c) => [...c.cols].sort().join(",") === set);
      if (hit) desynced.push(`${oc.file} → "${oc.cols.join(",")}" (table ${hit.table})`);
    }
    expect(desynced, `onConflict strings left behind by 1E:\n  ${desynced.join("\n  ")}`)
      .toEqual([]);
  });

  it("every organization_id-prefixed onConflict matches a real composite key", () => {
    // The mirror image: a call site that added the prefix where no matching
    // unique index exists fails just as hard as a missed edit, and is easier to
    // overlook. A valid target is EITHER a constraint 1E converted OR one that
    // was declared tenant-composite from birth (Phase 2 tables, and every table
    // created after it).
    const native = collectNativeCompositeKeys().map((c) => [...c].sort().join(","));
    const orphans: string[] = [];
    for (const oc of onConflicts) {
      if (!oc.cols.includes("organization_id")) continue;
      const full = [...oc.cols].sort().join(",");
      const rest = oc.cols.filter((c) => c !== "organization_id").sort().join(",");
      const convertedHit = converted.some((c) => [...c.cols].sort().join(",") === rest);
      const nativeHit = native.includes(full);
      if (!convertedHit && !nativeHit) orphans.push(`${oc.file} → "${oc.cols.join(",")}"`);
    }
    expect(orphans, `onConflict prefixed but no matching composite key:\n  ${orphans.join("\n  ")}`)
      .toEqual([]);
  });

  it("leaves FK-anchored constraints alone", () => {
    // student_attendance UNIQUE(student_id, date) is already correct: a student
    // belongs to exactly one organization, so the tuple cannot collide.
    // Converting it would force needless edits to 14 more call sites, each a
    // chance to break attendance or exam entry.
    const safe = [
      ["student_id", "date"],
      ["staff_id", "date"],
      ["teacher_id", "date"],
      ["exam_id", "student_id"],
      ["attempt_id", "question_id"],
      ["coordinator_id", "staff_id"],
      ["profile_id", "module_name"],
    ];
    for (const cols of safe) {
      const set = [...cols].sort().join(",");
      const hit = converted.find((c) => [...c.cols].sort().join(",") === set);
      expect(hit, `${cols.join(",")} was converted but is already tenant-safe`).toBeUndefined();
    }
  });

  it("the 12 expected call sites carry the prefix", () => {
    const expected: [string, string][] = [
      ["settings/services/smsSettings.service.ts", "organization_id,automation_key"],
      ["attendance/automation/services/alerts.service.ts", "organization_id,dedupe_key"],
      ["communication/services/commsAutomationSettings.service.ts", "organization_id,event_key"],
      ["payroll/services/payrollConfig.service.ts", "organization_id,role"],
      ["rbac/services/actionRights.service.ts", "organization_id,role,action_id"],
      ["rbac/services/rolePermissions.service.ts", "organization_id,role,module_id,submodule_id"],
      ["dashboard/services/dashboard.service.ts", "organization_id,scope"],
      ["attendance/governance/services/closing.service.ts", "organization_id,scope,month"],
      ["attendance/governance/services/locks.service.ts",
        "organization_id,scope,period_type,period_key"],
      ["attendance/services/settings.service.ts", "organization_id,singleton"],
    ];
    for (const [rel, cols] of expected) {
      const src = read(join(SRC, "features", ...rel.split("/")));
      expect(src, `${rel} missing onConflict "${cols}"`).toContain(`onConflict: "${cols}"`);
    }
  });
});

describe("Mechanical detector", () => {
  it("derives unsafe constraints from pg_catalog, not a list", () => {
    expect(sql).toMatch(/FUNCTION public\.unsafe_unique_constraints/);
    expect(sql).toMatch(/FROM pg_constraint con/);
  });

  it("treats an FK to a tenant table as anchoring the tuple", () => {
    expect(sql).toMatch(/fk\.conkey && con\.conkey/);
    expect(sql).toMatch(/is_tenant_scoped_table\(fcl\.relname\)/);
  });

  it("documents the settings_referrals exception rather than hiding it", () => {
    expect(sql).toMatch(/settings_referrals/);
    expect(sql).toMatch(/OUTSIDE the platform/);
  });
});

describe("Readiness flags are earned, not asserted", () => {
  it("composite_unique_keys is set ONLY when the detector returns zero rows", () => {
    // Setting it unconditionally would defeat the second-organization guard
    // entirely — the flag would say "safe" because the migration ran, not
    // because the database is actually safe.
    const part = sql.slice(sql.indexOf("PART 4"));
    expect(part).toMatch(/FROM public\.unsafe_unique_constraints\(\)/);
    expect(part).toMatch(/INTO remaining/);
    expect(part).toMatch(/IF remaining = 0 THEN/);
    expect(part).toMatch(/flag = 'composite_unique_keys'/);
  });

  it("storage_org_partitioned re-counts objects rather than trusting the script", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.mark_storage_partitioned"));
    expect(fn).toMatch(/FROM storage\.objects/);
    expect(fn).toMatch(/RETURN false/);
  });
});

describe("Storage relocation script", () => {
  const script = read(join(ROOT, "scripts", "relocate-storage-to-org.mjs"));

  it("copies and verifies before deleting the original", () => {
    expect(script.indexOf(".copy(")).toBeLessThan(script.indexOf(".remove("));
    expect(script).toMatch(/destination missing after copy/);
  });

  it("rewrites DB path columns before removing the file", () => {
    // Deleting first would strand the row pointing at nothing, with no error
    // until a user clicks the attachment.
    expect(script.indexOf("PATH_COLUMNS")).toBeGreaterThan(-1);
    const copyIdx = script.indexOf("// 3. Rewrite any DB row");
    const rmIdx = script.indexOf("// 4. Remove the original");
    expect(copyIdx).toBeGreaterThan(-1);
    expect(copyIdx).toBeLessThan(rmIdx);
  });

  it("refuses to run once a second organization exists", () => {
    // Legacy objects carry no tenant marker; with several tenants ownership
    // cannot be inferred and a guess would mis-file customer documents.
    expect(script).toMatch(/Refusing to run: \$\{orgs\.length\} organizations exist/);
  });

  it("supports a dry run and is resumable", () => {
    expect(script).toMatch(/--dry-run/);
    expect(script).toMatch(/UUID_PREFIX\.test/);
  });

  it("skips profile-pictures (deliberately public avatars)", () => {
    const bucketBlock = script.slice(script.indexOf("const BUCKETS"), script.indexOf("PATH_COLUMNS"));
    expect(bucketBlock).not.toMatch(/"profile-pictures"/);
  });
});

describe("Cross-tenant probe", () => {
  const probe = read(join(ROOT, "scripts", "cross-tenant-probe.sql"));

  it("rolls back — safe to run against production", () => {
    expect(probe.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(probe).toMatch(/^BEGIN;/m);
  });

  it("gives the probe user FULL privilege inside tenant B", () => {
    // Otherwise every count is zero because is_staff() is false, and the probe
    // would pass on a database with no tenant isolation whatsoever.
    expect(probe).toMatch(/'Probe Admin', 'management'/);
  });

  it("includes a control case so a vacuous pass is detectable", () => {
    expect(probe).toMatch(/CONTROL FAILED/);
    expect(probe).toMatch(/INCONCLUSIVE/);
  });

  it("sweeps every tenant-scoped table, not a sample", () => {
    expect(probe).toMatch(/is_tenant_scoped_table\(c\.relname\)/);
  });

  it("tests WRITE isolation and default stamping, not only reads", () => {
    expect(probe).toMatch(/tenant B successfully wrote a row owned by tenant A/);
    expect(probe).toMatch(/Default stamping OK/);
  });

  it("excludes the probe's own rows so it cannot report a false leak", () => {
    expect(probe).toMatch(/WHERE organization_id <> \$1/);
  });
});

describe("Rollback", () => {
  const rbPath = join(ROLLBACKS, P1E.replace(".sql", "_rollback.sql"));

  it("exists", () => {
    expect(existsSync(rbPath)).toBe(true);
  });

  it("refuses to run on a multi-tenant database", () => {
    expect(read(rbPath)).toMatch(/Refusing to roll back composite unique keys/);
  });

  it("re-arms the second-organization guard", () => {
    expect(read(rbPath)).toMatch(/SET ready = false[\s\S]*?composite_unique_keys/);
  });

  it("warns that the frontend must be reverted in the same deploy", () => {
    // The failure mode is silent and total: every affected upsert throws.
    expect(read(rbPath)).toMatch(/REVERT THE FRONTEND IN THE SAME DEPLOY/);
  });
});

describe("The readiness decision covers BOTH uniqueness mechanisms", () => {
  // Deployment lesson: unique constraints and standalone unique INDEXes enforce
  // the same thing, but only constraints have a pg_constraint row. The original
  // detector read pg_constraint alone and reported "0 unsafe" while five real
  // cross-tenant collisions sat in indexes — including UNIQUE((true)) on
  // settings_whatsapp_config, which limited the ENTIRE PLATFORM to one WhatsApp
  // configuration. A detector that inspects half the mechanism and reports a
  // clean bill is worse than no detector.
  const sql = read(join(MIGRATIONS, P1E));

  it("defines an index-side detector, not only a constraint-side one", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.unsafe_unique_indexes/);
  });

  it("the index detector ignores indexes that merely back a constraint", () => {
    // Otherwise every converted constraint is double-reported and the flag can
    // never be set.
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM pg_constraint c WHERE c\.conindid = x\.indexrelid\)/);
  });

  it("the readiness flag is gated on BOTH detectors", () => {
    const part4 = /SELECT \(SELECT count\(\*\) FROM public\.unsafe_unique_constraints\(\)\)[\s\S]{0,200}?INTO remaining/.exec(sql);
    expect(part4, "PART 4 must sum both detectors into `remaining`").not.toBeNull();
    expect(part4![0]).toMatch(/unsafe_unique_indexes\(\)/);
  });

  it("an unsafe result CLEARS a previously-set flag rather than just declining to set it", () => {
    // A narrower earlier run had already set composite_unique_keys = true. If
    // the ELSE branch only warns, that stale `true` still authorises a second
    // organization on evidence that no longer holds.
    const elseBranch = sql.slice(sql.indexOf("ELSE", sql.indexOf("composite_unique_keys")));
    expect(elseBranch).toMatch(/SET ready = false/);
  });

  it("every expression-index conversion carries its own replacement name", () => {
    // The replacement index does not always keep the old name, so a re-run
    // guard keyed on the OLD name lets CREATE run twice and fails with 42P07.
    expect(sql).toMatch(/AS v\(tbl, old_idx, new_idx, create_sql\)/);
    expect(sql).toMatch(/indexname=t\.new_idx AND indexdef ILIKE '%organization_id%'/);
  });
});
