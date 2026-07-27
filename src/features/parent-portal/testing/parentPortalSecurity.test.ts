// ── Parent Portal — security model regression gate ───────────────────────────
//
// WHY A TEST OVER SQL TEXT:
//
// The portal's entire access boundary is RLS. Nothing in TypeScript enforces
// "a parent sees only their own children" — the services deliberately do not
// filter defensively, because a client-side filter would be security theatre
// over a database that had already handed the rows out.
//
// That makes the migration file itself the security-critical artefact, and it
// has exactly the property that makes regressions silent: deleting a policy
// breaks nothing visible in the app (staff still work, the parent portal just
// starts returning MORE data). These assertions fail loudly instead.
//
// They are structural, not behavioural — a real end-to-end proof needs a live
// Postgres with two seeded parents, which this suite has no database for. What
// they do guarantee is that the invariants below cannot be edited away by
// accident.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const PORTAL_MIGRATION = "20260727_parent_portal.sql";

const sql = readFileSync(join(MIGRATIONS_DIR, PORTAL_MIGRATION), "utf8");

describe("parent portal migration — identity helpers", () => {
  it("defines every helper the policies depend on", () => {
    for (const fn of [
      "is_staff",
      "current_parent_account_id",
      "is_parent",
      "parent_child_ids",
      "is_parent_of",
      "parent_has_child_in_batch",
      "parent_has_child_in_standard",
    ]) {
      expect(sql).toContain(`FUNCTION public.${fn}`);
    }
  });

  it("declares the helpers SECURITY DEFINER with a pinned search_path", () => {
    // Without SECURITY DEFINER the helpers cannot read parent_auth_accounts
    // under a parent's own RLS; without a pinned search_path they are a
    // search-path injection target from any schema the caller can create in.
    //
    // Count only real declarations — matching the bare phrase would also count
    // the prose above them and pass on a migration that declared nothing.
    const bodies = [
      ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?AS \$\$/g),
    ].map((m) => ({ name: m[1], body: m[0] }));

    const identity = bodies.filter((b) => b.name !== "pp_col_exists");
    expect(identity).toHaveLength(7);
    for (const { name, body } of identity) {
      expect(body, name).toContain("SECURITY DEFINER");
      expect(body, name).toContain("SET search_path = public");
      expect(body, name).toContain("STABLE");
    }
  });

  it("does NOT give the schema probe elevated privilege", () => {
    // pp_col_exists only reads information_schema, which every role may read
    // for its own objects. SECURITY DEFINER there would be privilege it has no
    // use for — and a DEFINER function taking caller-supplied table/column
    // names is a strictly larger attack surface than one that does not.
    const probe = sql.match(
      /CREATE OR REPLACE FUNCTION public\.pp_col_exists[\s\S]*?AS \$\$/,
    )?.[0] ?? "";
    expect(probe).not.toContain("SECURITY DEFINER");
  });

  it("resolves only ACTIVE parent accounts", () => {
    // A disabled or locked parent must lose every row grant instantly. If this
    // filter is dropped, suspending a parent stops meaning anything.
    expect(sql).toMatch(/current_parent_account_id[\s\S]*?status = 'active'/);
  });

  it("routes every child check through parent_student_links", () => {
    expect(sql).toMatch(/is_parent_of[\s\S]*?parent_student_links/);
  });
});

describe("parent portal migration — deny by default", () => {
  it("rewrites permissive `USING (true)` SELECT policies to is_staff()", () => {
    // THE load-bearing assertion. Every pre-existing broad read policy in this
    // database is `FOR SELECT TO authenticated USING (true)`, which was safe
    // only while staff held the sole auth.users sessions. Once parents log in,
    // that clause exposes every student, mark, fee ledger and finance row in
    // the institution to any parent.
    expect(sql).toContain("qual       = 'true'");
    expect(sql).toContain("USING (public.is_staff())");
  });

  it("limits the rewrite to authenticated-only policies", () => {
    // Policies also addressed to `anon`/`public` back deliberate
    // unauthenticated flows — the public lead-capture form and the proctored
    // exam kiosk. Rewriting those would break admissions and exams.
    expect(sql).toContain("roles      = '{authenticated}'");
  });

  it("closes the parent_student_links enumeration hole", () => {
    // 20260615 shipped this as `USING (true)`, letting ANY authenticated user
    // read the institution's entire parent↔student graph.
    expect(sql).toMatch(
      /CREATE POLICY "parent_read parent_student_links"[\s\S]*?parent_account_id = public\.current_parent_account_id\(\)/,
    );
  });

  it("records every rewritten policy for audit", () => {
    expect(sql).toContain("parent_portal_rls_audit");
    expect(sql).toMatch(/INSERT INTO public\.parent_portal_rls_audit/);
  });
});

describe("parent portal migration — child-scoped grants", () => {
  const scoped: [string, string][] = [
    ["students", "public.is_parent_of(id)"],
    ["student_attendance", "public.is_parent_of(student_id)"],
    ["exam_results", "public.is_parent_of(student_id)"],
    ["student_fees", "public.is_parent_of(student_id)"],
    ["student_documents", "public.is_parent_of(student_id)"],
    ["message_queue", "public.is_parent_of(recipient_student_id)"],
  ];

  it.each(scoped)("scopes %s by %s", (table, predicate) => {
    expect(sql).toContain(`['${table}',`);
    expect(sql).toContain(predicate);
  });

  it("reaches fee receipts through the child's own fee record", () => {
    expect(sql).toMatch(
      /parent_read fee_installments[\s\S]*?student_fees[\s\S]*?is_parent_of\(sf\.student_id\)/,
    );
  });

  it("scopes cohort tables by batch or standard, never openly", () => {
    for (const table of ["exams", "live_classes", "class_schedules"]) {
      const policy = new RegExp(
        `CREATE POLICY "parent_read ${table}"[\\s\\S]{0,700}?parent_has_child_in_(batch|standard)`,
      );
      expect(sql).toMatch(policy);
    }
  });

  it("does NOT re-open the staff directory to parents", () => {
    // profiles carries every employee's name, role and campus. PART 3 closes it
    // to staff; nothing may grant it back to a parent.
    expect(sql).not.toMatch(/CREATE POLICY "parent_read profiles"/);
  });

  it("keeps finance, payroll and support tables closed", () => {
    for (const table of [
      "finance_audit",
      "payroll_items",
      "support_tickets",
      "profiles",
      "staff_rights",
    ]) {
      expect(sql).not.toContain(`CREATE POLICY "parent_read ${table}"`);
    }
  });
});

describe("parent portal migration — schema resilience", () => {
  // Regression: the first live run aborted with
  //   ERROR: 42703: column "standard_id" does not exist
  // because the study_materials policy assumed a column that table never had.
  // A single wrong assumption killed the ENTIRE migration mid-way, leaving the
  // database half-configured. Every optional policy must now probe first.

  it("defines the column probe helper", () => {
    expect(sql).toContain("FUNCTION public.pp_col_exists");
  });

  it("probes every column a parent policy actually references", () => {
    // Table-existence alone is not enough — a table can exist with a different
    // shape, which is exactly what broke the first live run. Each column named
    // in a predicate must be probed somewhere in the migration.
    const mustProbe: [string, string][] = [
      ["students", "id"],
      ["student_attendance", "student_id"],
      ["exam_results", "student_id"],
      ["student_fees", "student_id"],
      ["student_documents", "student_id"],
      ["message_queue", "recipient_student_id"],
      ["fee_installments", "student_fee_id"],
      ["exams", "batch_id"],
      ["exams", "standard_id"],
      ["live_classes", "standard_id"],
      ["live_class_batches", "batch_id"],
      ["live_class_attendance", "student_id"],
      ["class_schedules", "batch_id"],
      ["class_schedules", "standard_id"],
      ["study_materials", "batch_id"],
      ["sections", "standard_id"],
    ];
    for (const [table, column] of mustProbe) {
      const probed =
        sql.includes(`public.pp_col_exists('${table}', '${column}')`) ||
        // The PART 4a loop probes via its spec array rather than inline.
        new RegExp(`\\['${table}',\\s*'${column}'`).test(sql);
      expect(probed, `${table}.${column} is referenced but never probed`).toBe(true);
    }
  });

  it("leaves table-only guards ONLY where no column is referenced", () => {
    // The two legitimate cases: the pure-reference-data loop (predicate is
    // `is_parent()`, no column) and the realtime publication (table-level).
    const tableOnly = sql.match(/IF EXISTS \(SELECT 1 FROM information_schema\.tables/g) ?? [];
    expect(tableOnly.length).toBeLessThanOrEqual(2);
  });

  it("scopes study_materials by batch only — it has no standard_id", () => {
    const policy = sql.match(
      /CREATE POLICY "parent_read study_materials"[\s\S]*?;/,
    )?.[0] ?? "";
    expect(policy).toContain("parent_has_child_in_batch");
    expect(policy).not.toContain("standard_id");
  });

  it("skips loudly rather than silently when a table is absent", () => {
    expect(sql).toContain("RAISE NOTICE");
  });
});

describe("parent portal migration — storage", () => {
  it("scopes the document bucket to the child folder", () => {
    expect(sql).toContain("student_docs_read_parent");
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\][\s\S]*?is_parent_of/);
  });

  it("validates the folder segment before casting it to uuid", () => {
    // A malformed path must mean "no access", not an exception that aborts the
    // parent's entire request.
    expect(sql).toMatch(/\[0-9a-fA-F\]\{8\}-/);
  });

  it("narrows the previously bucket-wide staff read policy", () => {
    expect(sql).toContain("student_docs_read_staff");
    expect(sql).toMatch(/student_docs_read_staff[\s\S]*?public\.is_staff\(\)/);
  });
});

describe("parent portal migration — hygiene", () => {
  it("is idempotent — no unguarded CREATE TABLE", () => {
    const creates = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
    expect(creates).toHaveLength(0);
  });

  it("drops each policy before creating it", () => {
    const created = [...sql.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
    const dropped = new Set(
      [...sql.matchAll(/DROP POLICY IF EXISTS "([^"]+)"/g)].map((m) => m[1]),
    );
    // Policies created inside a format() loop use a %1$s placeholder name.
    const literal = created.filter((n) => !n.includes("%"));
    for (const name of literal) expect(dropped.has(name)).toBe(true);
  });

  it("does not introduce an OTP login path", () => {
    // Parents authenticate exactly like staff: email + password through the
    // existing /login page and the existing student-parent-accounts function.
    expect(sql).not.toContain("parent_login_otps");
    expect(sql.toLowerCase()).not.toContain("otp_hash");
  });

  it("is ordered AFTER the auth platform it depends on", () => {
    // What matters is dependency order, not being last — later migrations are
    // expected and must not fail this suite.
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    const portal = files.indexOf(PORTAL_MIGRATION);
    const authPlatform = files.indexOf("20260615_student_parent_auth.sql");
    expect(portal, `${PORTAL_MIGRATION} is missing`).toBeGreaterThan(-1);
    expect(authPlatform, "20260615_student_parent_auth.sql is missing").toBeGreaterThan(-1);
    expect(portal).toBeGreaterThan(authPlatform);
  });

  it("is ordered BEFORE the account-sync migration that builds on it", () => {
    // 20260728 adds auto_sync columns + triggers that assume the portal's
    // helpers and parent_student_links.relation already exist.
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    const sync = files.indexOf("20260728_parent_account_sync.sql");
    if (sync === -1) return; // not yet added — nothing to order against
    expect(files.indexOf(PORTAL_MIGRATION)).toBeLessThan(sync);
  });
});
