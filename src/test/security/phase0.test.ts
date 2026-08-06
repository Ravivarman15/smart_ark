import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 0 SECURITY REGRESSION GATES
//
// These are not unit tests. They are a build-breaking guard against the exact
// vulnerabilities Phase 0 closed being reintroduced by a later commit — the
// same mechanical-gate pattern already used by the RBAC registry audit.
//
// Why source-level rather than against a live database: CI has no Supabase
// project, and the security posture must be provable from the repository alone.
// The runtime half (are the buckets actually private? do the policies exist?)
// is checked by scripts/security-audit.sql, which is run against production as
// part of the deployment checklist. Neither replaces the other, and the
// deployment checklist says so.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const FUNCTIONS = join(ROOT, "supabase", "functions");

const readMigration = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");

/**
 * Strip comments before scanning for banned CODE patterns.
 *
 * Without this the gate flags its own documentation: `_shared/auth.ts` quotes
 * the vulnerable `atob(token.split(".")[1])` line in the comment explaining why
 * it was removed. A security gate that punishes documenting the vulnerability
 * teaches people to delete the explanation — exactly backwards.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PHASE0 = "20260805_phase0_security_hardening.sql";

/** Every migration that runs AFTER Phase 0 — i.e. could undo it. */
const migrationsAfterPhase0 = (): string[] =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !f.includes("rollback"))
    .filter((f) => f > PHASE0);

describe("S2 — a signup must never mint a staff profile", () => {
  const sql = readMigration(PHASE0);

  it("handle_new_user does not default a missing role to 'teacher'", () => {
    // The vulnerable line was:  COALESCE(meta_role::app_role, 'teacher')
    // With is_staff() defined as "holds a profiles row" and 102 policies at
    // USING (true), that turned any signup into institution-wide read access.
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user"));
    expect(fn).not.toMatch(/COALESCE\s*\(\s*meta_role::app_role\s*,\s*'teacher'\s*\)/i);
  });

  it("handle_new_user returns without inserting when no role is supplied", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user"));
    expect(fn).toMatch(/IF\s+meta_role\s+IS\s+NULL\s+THEN/i);
  });

  it("no later migration reintroduces the 'teacher' fallback", () => {
    for (const file of migrationsAfterPhase0()) {
      const body = readMigration(file);
      if (!body.includes("handle_new_user")) continue;
      expect(
        /COALESCE\s*\(\s*meta_role::app_role\s*,\s*'teacher'\s*\)/i.test(body),
        `${file} reintroduces the 'teacher' default in handle_new_user`,
      ).toBe(false);
    }
  });
});

describe("S3 — storage buckets", () => {
  const sql = readMigration(PHASE0);

  it("flips payslips, finance-attachments and support-attachments private", () => {
    // `public = true` means readable by ANYONE on the internet holding the URL:
    // no auth, no RLS evaluation at all.
    expect(sql).toMatch(/UPDATE\s+storage\.buckets\s+SET\s+public\s*=\s*false/i);
    for (const b of ["payslips", "finance-attachments", "support-attachments"]) {
      expect(sql).toContain(`'${b}'`);
    }
  });

  it("drops the world-readable payslips policy", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS payslips_public_read/i);
  });

  it("no later migration marks a bucket public again", () => {
    for (const file of migrationsAfterPhase0()) {
      const body = readMigration(file);
      const makesPublic =
        /storage\.buckets[\s\S]{0,200}?SET\s+public\s*=\s*true/i.test(body) ||
        /INSERT INTO storage\.buckets[\s\S]{0,200}?,\s*true\s*\)/i.test(body);
      expect(makesPublic, `${file} marks a storage bucket public`).toBe(false);
    }
  });

  it("gates every hardened bucket on a role check, not bucket_id alone", () => {
    // The original policies were all `USING (bucket_id = '<name>')`, which any
    // authenticated principal satisfies — including students and parents.
    for (const bucket of [
      "payslips",
      "finance-attachments",
      "support-attachments",
      "question-papers",
      "task-attachments",
    ]) {
      const policies = sql
        .split("CREATE POLICY")
        .slice(1)
        .filter((p) => p.includes(`'${bucket}'`));
      expect(policies.length, `no policy created for ${bucket}`).toBeGreaterThan(0);
      for (const p of policies) {
        expect(
          /has_any_role|current_profile_id|is_staff|is_parent/.test(p),
          `a ${bucket} policy is scoped by bucket_id alone`,
        ).toBe(true);
      }
    }
  });

  it("restricts question-paper DELETE — students could previously destroy exam papers", () => {
    const del = sql.slice(sql.indexOf("CREATE POLICY question_papers_delete"));
    // The role list is inlined rather than held in a PL/pgSQL variable: plpgsql
    // does not substitute variables into utility statements, so `CREATE POLICY
    // … has_any_role(staff_mgmt)` stored `staff_mgmt` as a COLUMN reference and
    // failed 42703. Asserting the literal keeps it from regressing to a variable.
    expect(del.slice(0, 400)).toMatch(
      /has_any_role\s*\(\s*ARRAY\['admin','management'\]\s*\)/,
    );
  });
});

describe("S6 — edge functions must verify JWT signatures", () => {
  const fnDirs = readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => d.name);

  it("finds the edge functions (guards against an empty, vacuously-passing scan)", () => {
    expect(fnDirs.length).toBeGreaterThan(10);
  });

  it("no function decodes a JWT payload with atob and trusts it", () => {
    // `JSON.parse(atob(token.split(".")[1])).sub` reads the payload WITHOUT
    // checking the signature. It is survivable only while config.toml keeps
    // verify_jwt = true — a guarantee that lives outside the code, and one that
    // becomes cross-tenant write access once these functions carry an org.
    const offenders: string[] = [];
    for (const dir of fnDirs) {
      const file = join(FUNCTIONS, dir, "index.ts");
      if (!existsSync(file)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      if (/atob\s*\(/.test(src)) offenders.push(dir);
    }
    expect(offenders, `these functions still decode a JWT unverified: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("the shared helper verifies against GoTrue rather than parsing locally", () => {
    const auth = stripComments(readFileSync(join(FUNCTIONS, "_shared", "auth.ts"), "utf8"));
    expect(auth).toMatch(/auth\.getUser\(\s*token\s*\)/);
    expect(auth).not.toMatch(/atob\s*\(/);
  });

  it("seed-users is disabled unless explicitly enabled", () => {
    // It rewrites ten real staff accounts to hardcoded passwords that also
    // leaked via git-tracked scripts, so those credentials are compromised.
    const src = readFileSync(join(FUNCTIONS, "seed-users", "index.ts"), "utf8");
    expect(src).toMatch(/SEED_USERS_ENABLED/);
    expect(src).toMatch(/!==\s*["']true["']/);
  });
});

describe("S10 — no credentials in the repository", () => {
  it("the credential-bearing root scripts are gone", () => {
    // try_logins.mjs held real staff emails with plaintext passwords.
    for (const f of [
      "try_logins.mjs",
      "add_students.mjs",
      "fetch_profiles.mjs",
      "update_profile.mjs",
      "update_archana_db.mjs",
      "scratch_perms.mjs",
      "scratch_try_all.mjs",
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} is back in the repo root`).toBe(false);
    }
  });

  it("gitignore blocks ad-hoc scripts returning to the root", () => {
    const gi = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\/\*\.mjs$/m);
    expect(gi).toMatch(/^\.env$/m);
  });
});

describe("the SPA fallback actually resolves", () => {
  // This shipped broken and took the entire application offline in production.
  // `cleanUrls: true` makes Vercel redirect every .html path to its
  // extensionless form, so /index.html 308s to / and is no longer a servable
  // rewrite destination. The catch-all fallback then resolved to nothing and
  // Vercel returned NOT_FOUND for every path without a real file behind it:
  // /login, /admin, /management, /parent, /exam, /admissions/apply, every
  // in-app refresh, and every credential link WhatsApp'd to staff and parents.
  // The marketing pages kept working — they are prerendered files on disk —
  // which is exactly why it looked like a broken login button.
  const raw = readFileSync(join(ROOT, "vercel.json"), "utf8");
  const cfg = JSON.parse(raw) as {
    cleanUrls?: boolean;
    rewrites?: { source: string; destination: string }[];
  };

  it("has a catch-all rewrite to the app shell", () => {
    const fallback = cfg.rewrites?.find((r) => r.source === "/(.*)");
    expect(fallback, "no SPA fallback rewrite").toBeDefined();
    expect(fallback!.destination).toBe("/index.html");
  });

  it("does not enable cleanUrls, which would make that destination unservable", () => {
    expect(cfg.cleanUrls ?? false).toBe(false);
  });

  it("keeps every rewrite destination servable under the current settings", () => {
    // Stated as the general rule rather than the one instance: any .html
    // destination is unreachable the moment cleanUrls is on.
    if (!cfg.cleanUrls) return;
    for (const r of cfg.rewrites ?? []) {
      expect(r.destination, `cleanUrls makes ${r.destination} a redirect, not a target`)
        .not.toMatch(/\.html$/);
    }
  });
});

describe("S11 — security response headers", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const global = vercel.headers.find((h) => h.source === "/(.*)");

  it("applies a global header block", () => {
    expect(global).toBeDefined();
  });

  it.each([
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "Permissions-Policy",
  ])("sets %s", (key) => {
    expect(global!.headers.some((h) => h.key === key)).toBe(true);
  });

  it("CSP denies framing and restricts connect-src to self + Supabase", () => {
    const csp = global!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/connect-src [^;]*supabase\.co/);
    // A wildcard connect-src would let a compromised script exfiltrate to any host.
    expect(csp).not.toMatch(/connect-src[^;]*\*\s*;/);
  });
});

describe("Phase 0 ships a rollback", () => {
  it("the paired rollback migration exists", () => {
    expect(
      existsSync(join(ROLLBACKS, "20260805_phase0_security_hardening_rollback.sql")),
    ).toBe(true);
  });

  it("the rollback restores every part the forward migration changed", () => {
    const rb = readFileSync(join(ROLLBACKS, "20260805_phase0_security_hardening_rollback.sql"), "utf8");
    expect(rb).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user/);
    expect(rb).toMatch(/SET public = true/i);
    expect(rb).toMatch(/payslips_public_read/);
    expect(rb).toMatch(/DROP FUNCTION IF EXISTS public\.has_any_role/);
  });
});

describe("migrations/ is safe to deploy", () => {
  // `supabase db push` executes EVERY .sql file in supabase/migrations in
  // filename order. A co-located `*_rollback.sql` sorts directly after the
  // migration it undoes, so a push would apply Phase N and then immediately
  // revert it — and because both files share one numeric version prefix, the
  // two rows also collide in supabase_migrations.schema_migrations. This gate
  // exists because that was the live state of the repo before deployment.
  it("contains no rollback scripts", () => {
    const stray = readdirSync(MIGRATIONS).filter((f) => /_rollback\.sql$/.test(f));
    expect(stray, `rollback scripts must live in supabase/rollback/, not migrations/`)
      .toEqual([]);
  });

  // Supabase keys a migration by its leading digits, and this repo has many
  // files sharing one prefix (four Phase-1 migrations are all `20260806`,
  // and the pre-SaaS history collides the same way). Two files cannot both be
  // recorded under one version, so `supabase db push` is NOT a usable
  // deployment path here and the ordered runner in scripts/ is authoritative.
  //
  // The risk that creates: a migration nobody adds to the runner is never
  // deployed, and the omission is invisible until a table is missing in
  // production. So the runner must account for every phase migration on disk.
  it("the deploy runner covers every phase migration", () => {
    const onDisk = readdirSync(MIGRATIONS)
      .filter((f) => /_phase\d/.test(f) && f.endsWith(".sql"))
      .sort();
    const runner = readFileSync(join(ROOT, "scripts", "deploy-migrations.mjs"), "utf8");
    const missing = onDisk.filter((f) => !runner.includes(f));
    expect(missing, "add these to scripts/deploy-migrations.mjs ORDER").toEqual([]);
  });
});
