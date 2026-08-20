import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// The multi-role migration decides what ~195 RLS policies believe about the
// caller. Its security properties are not things a UI test can reach, and they
// are the kind that get quietly weakened by a later "cleanup", so they are
// pinned against the migration text itself.
//
// Comments are stripped first. A gate that cannot tell code from the note ABOUT
// the code punishes documenting the decision, and the fix people reach for is
// deleting the explanation.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION = resolve(
  __dirname,
  "../../../../supabase/migrations/20261013_staff_multi_role.sql",
);

const stripComments = (sql: string): string =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

const sql = stripComments(readFileSync(MIGRATION, "utf8"));
const lower = sql.toLowerCase();

/** The body of one CREATE FUNCTION, so assertions cannot match a neighbour. */
const functionBody = (name: string): string => {
  const start = lower.indexOf(`function public.${name}`);
  expect(start, `${name} is not defined in the migration`).toBeGreaterThan(-1);
  const end = lower.indexOf("$function$;", start);
  return lower.slice(start, end === -1 ? undefined : end);
};

describe("switching role cannot be an escalation", () => {
  const body = functionBody("switch_active_role");

  it("is SECURITY DEFINER — it writes a column no staff member may write", () => {
    expect(body).toContain("security definer");
  });

  it("checks the grant BEFORE it writes", () => {
    // Order is the whole property. Validating afterwards would leave a window
    // in which active_role already said 'admin'.
    const check = body.indexOf("staff_available_roles");
    const write = body.indexOf("update public.profiles");
    expect(check).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
  });

  it("raises rather than silently doing nothing when the role is not granted", () => {
    expect(body).toContain("raise exception");
    expect(body).toContain("42501");
  });

  it("validates against the database, never against a caller-supplied list", () => {
    // The only input is the target role. Anything else — an org id, a profile
    // id — would be a value the caller could choose.
    expect(sql).toContain("switch_active_role(_role public.app_role)");
    expect(body).toContain("current_profile_id()");
  });

  it("is callable by any signed-in staff member, not just admins", () => {
    // Admin rights are needed to GRANT a role, never to enter one already
    // granted — otherwise an admin who switched into the teacher portal could
    // not switch back out of it.
    expect(lower).toContain("grant execute on function public.switch_active_role");
    expect(lower).toContain("to authenticated");
  });

  it("audits the switch", () => {
    expect(body).toContain("auth_login_audit");
    expect(body).toContain("role_switch");
    // organization_id is NOT NULL with no usable default since tenant #2.
    expect(body).toContain("organization_id");
  });
});

describe("a forged active_role is worthless", () => {
  const body = functionBody("effective_role");

  it("honours active_role only while a matching grant exists", () => {
    expect(body).toContain("staff_role_grants");
    expect(body).toContain("g.role = p.active_role");
  });

  it("falls back to the primary role instead of trusting the column", () => {
    // This is what makes revocation take effect on the NEXT QUERY rather than
    // whenever someone remembers to clear active_role — and what makes a direct
    // write to the column achieve nothing.
    expect(body).toContain("else p.role");
  });

  it("scopes the grant lookup to the same organization", () => {
    expect(body).toContain("g.organization_id = p.organization_id");
  });
});

describe("the three role functions route through one definition", () => {
  // 195 policies read these. Three copies of the CASE would be three places to
  // get revocation wrong.
  it.each(["get_user_role", "has_any_role", "has_role"])("%s calls effective_role", (fn) => {
    expect(functionBody(fn)).toContain("public.effective_role(");
  });

  it("keeps has_any_role's is_active check", () => {
    // A deactivated account must not pass a role check just because it still
    // holds a role.
    expect(functionBody("has_any_role")).toContain("is_active");
  });

  it("leaves every signature unchanged so no policy needs rewriting", () => {
    expect(sql).toContain("function public.get_user_role(_user_id uuid)");
    expect(sql).toContain("function public.has_any_role(_roles text[])");
    expect(sql).toContain("function public.has_role(_user_id uuid, _role public.app_role)");
  });
});

describe("granting a role is restricted", () => {
  it("puts RLS on the grants table", () => {
    expect(lower).toContain("alter table public.staff_role_grants enable row level security");
  });

  it("limits writes to admin and management", () => {
    const write = lower.slice(lower.indexOf("staff_role_grants_write"));
    expect(write).toContain("has_any_role(array['admin', 'management'])");
    // Both halves: a policy with USING but no WITH CHECK admits any INSERT.
    expect(write.slice(0, write.indexOf("end if"))).toContain("with check");
  });

  it("scopes reads and writes to one organization", () => {
    const policies = lower.slice(lower.indexOf("staff_role_grants_read"));
    expect(policies).toContain("organization_id = public.current_org_id()");
  });

  it("allows one grant per role per person", () => {
    // Without this, revoking a role could leave a duplicate row behind and
    // silently revoke nothing.
    expect(lower).toContain("unique (profile_id, role)");
  });
});

describe("existing installations are untouched", () => {
  it("adds active_role as nullable, with no backfill", () => {
    expect(lower).toContain("add column if not exists active_role public.app_role");
    // NULL is "never switched", which effective_role resolves to profiles.role.
    // A default or an UPDATE would rewrite what every existing staff member is.
    expect(lower).not.toMatch(/active_role[^;]*\bnot null\b/);
    expect(lower).not.toMatch(/update\s+public\.profiles\s+set\s+active_role[^;]*where\s+true/);
  });

  it("is re-runnable", () => {
    expect(lower).toContain("create table if not exists public.staff_role_grants");
    expect(lower).toContain("add column if not exists");
    expect((lower.match(/create or replace function/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("never widens the primary role column", () => {
    // profiles.role stays what the person IS. If a switch rewrote it, the staff
    // directory, teacher dropdowns and payroll grouping would all change for
    // everyone else the moment Magi opened the coordinator portal.
    expect(lower).not.toMatch(/update\s+public\.profiles\s+set\s+role\s*=/);
  });
});
