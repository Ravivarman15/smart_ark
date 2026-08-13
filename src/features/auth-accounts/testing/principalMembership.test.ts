// ── Regression: a provisioned parent/student must be a MEMBER of its tenant ──
//
// THE BUG THIS PINS
// `create_parent` created the auth user, the parent_auth_accounts row and the
// parent_student_links — but no `organization_users` row.
//
// custom_access_token_hook builds the JWT's organization_id claim from
// organization_users. No membership → no claim → jwt_org_id() is NULL →
// current_org_id() falls through to fallback_org_id(), which returns NULL once a
// second organization exists. The policy
//
//   owner_read parent_auth_accounts
//     USING (organization_id = current_org_id() AND user_id = auth.uid())
//
// then denied the parent access to their OWN row. AuthContext found no parent
// identity, `isParentAuthenticated` stayed false, and AuthRedirect fell through
// to `/signup` — the "Tell us about your institution" wizard.
//
// The credentials were always correct. The login always succeeded. The account
// was simply invisible to itself.
//
// It worked while ARK was the only tenant, because fallback_org_id() resolved to
// ARK for a claimless session — so this shipped fine and broke the day ABC
// Academi was created. invite-staff has created this row for staff since Phase
// 1; parents and students were never given the same treatment.
//
// Pinned here because it is a SOURCE-level invariant of an edge function that
// cannot be imported (Deno + remote esm.sh imports), and because the failure is
// invisible in every single-tenant test.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = readFileSync(
  join(ROOT, "supabase", "functions", "student-parent-accounts", "index.ts"),
  "utf8",
);

/** The body of `action === "<name>"` up to the next top-level action block. */
const actionBlock = (name: string): string => {
  const start = SRC.indexOf(`action === "${name}"`);
  expect(start, `${name} action not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const next = rest.slice(1).search(/action === "/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe("every provisioned principal gets a tenant membership", () => {
  it("defines a membership helper that writes organization_users", () => {
    expect(SRC).toMatch(/const grantMembership\s*=/);
    const fn = SRC.slice(SRC.indexOf("const grantMembership"), SRC.indexOf("/** Rotate to a fresh"));
    expect(fn).toMatch(/from\("organization_users"\)/);
    // The unique key is (organization_id, user_id, principal_kind) — upserting
    // on anything else would create a duplicate or clobber a staff row.
    expect(fn).toMatch(/onConflict:\s*"organization_id,user_id,principal_kind"/);
    expect(fn).toMatch(/status:\s*"active"/);
  });

  it.each([
    ["create_parent", "parent"],
    ["create_student", "student"],
  ])("%s grants a '%s' membership", (action, kind) => {
    const block = actionBlock(action);
    expect(
      block,
      `${action} never calls grantMembership — the principal will sign in ` +
        "successfully and land on /signup instead of their portal.",
    ).toMatch(new RegExp(`grantMembership\\([^)]*"${kind}"\\)`));
  });

  it.each(["create_parent", "create_student"])(
    "%s reports a failed membership instead of claiming success",
    (action) => {
      const block = actionBlock(action);
      // Silently swallowing this is the exact shape of the original bug: the
      // UI would show a green result for an account that cannot be used.
      expect(block).toMatch(/membership_failed/);
      const idx = block.indexOf("grantMembership");
      const after = block.slice(idx, idx + 900);
      expect(after).toMatch(/if\s*\(!\w+\.ok\)/);
      expect(after).toMatch(/ok:\s*false/);
    },
  );

  it("grants membership before proving the login, not after", () => {
    // rotateAndProve() returns credentials to the admin to hand over. Doing it
    // first would mean a failed membership is discovered only after the
    // password has already been shown as ready to send.
    const block = actionBlock("create_parent");
    expect(block.indexOf("grantMembership")).toBeLessThan(block.indexOf("rotateAndProve"));
  });

  it("takes the organization from the verified caller, never the request body", () => {
    // A body-supplied organization would let an admin of one tenant provision a
    // login inside another — the service role bypasses RLS entirely.
    expect(SRC).toMatch(/const orgId = gate\.caller\.organizationId/);
    const fn = SRC.slice(SRC.indexOf("const grantMembership"), SRC.indexOf("/** Rotate to a fresh"));
    expect(fn).not.toMatch(/body\??\./);
  });
});

describe("the backfill migration repairs principals provisioned before the fix", () => {
  const SQL = readFileSync(
    join(ROOT, "supabase", "migrations", "20261005_phase11b_principal_memberships.sql"),
    "utf8",
  );

  it("backfills both parents and students", () => {
    expect(SQL).toMatch(/parent_auth_accounts/);
    expect(SQL).toMatch(/student_auth_accounts/);
    expect(SQL).toMatch(/'parent'/);
    expect(SQL).toMatch(/'student'/);
  });

  it("is idempotent", () => {
    expect(
      [...SQL.matchAll(/ON CONFLICT \(organization_id, user_id, principal_kind\) DO NOTHING/g)],
    ).toHaveLength(2);
  });

  it("asserts nobody is left stranded rather than reporting a partial success", () => {
    expect(SQL).toMatch(/RAISE EXCEPTION/);
    expect(SQL).toMatch(/backfill incomplete/);
  });

  it("does not grant a live membership to a disabled account", () => {
    expect([...SQL.matchAll(/status = 'active'/g)].length).toBeGreaterThanOrEqual(2);
  });
});
