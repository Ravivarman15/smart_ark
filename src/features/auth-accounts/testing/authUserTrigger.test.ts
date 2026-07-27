// ── Regression gate: handle_new_user() must not block non-staff signups ──────
//
// THE FAILURE THIS LOCKS DOWN
// `app_role` is ENUM('teacher','admin','management','coordinator'). The
// student-parent-accounts edge function creates logins with
// user_metadata { role: 'parent' | 'student' }. The original trigger cast that
// value to app_role unconditionally, so the cast raised, the trigger aborted,
// the auth.users INSERT rolled back, and GoTrue returned HTTP 500 —
// surfacing client-side as AuthRetryableFetchError. No student or parent login
// could be provisioned at all.
//
// THE SECURITY TRAP
// The tempting fix — let COALESCE default the role to 'teacher' — would give
// every parent a `profiles` row, and `is_staff()` is defined as "holds a
// profiles row". Every parent would then pass the deny-by-default gate that
// scopes the Parent Portal to their own children.
//
// Structural assertions over the SQL: this suite has no Postgres to run against.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FIX = readFileSync(join(MIGRATIONS_DIR, "20260729_auth_user_trigger_fix.sql"), "utf8");

/** The function body as it stands after every migration has been applied. */
const latestHandleNewUser = (): string => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let body = "";
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    const m = sql.match(
      /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?\$\$;/,
    );
    if (m) body = m[0]; // later migrations win
  }
  return body;
};

describe("handle_new_user — non-staff signups", () => {
  const body = latestHandleNewUser();

  it("is redefined by the fix migration", () => {
    expect(body).not.toBe("");
    expect(FIX).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
  });

  it("returns early for parent and student metadata roles", () => {
    expect(body).toMatch(/meta_role IN \('parent',\s*'student'\)[\s\S]{0,120}RETURN NEW/);
  });

  it("does NOT create a profiles row for a parent", () => {
    // The early return must come BEFORE the INSERT, or a parent gets a staff
    // credential and is_staff() starts returning true for them.
    const parentBranch = body.indexOf("'parent'");
    const insert = body.indexOf("INSERT INTO public.profiles");
    expect(parentBranch).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(parentBranch).toBeLessThan(insert);
  });

  it("never casts an unvalidated metadata role to app_role", () => {
    // The original `(NEW.raw_user_meta_data->>'role')::app_role` is the exact
    // expression that raised on 'parent'.
    expect(body).not.toMatch(/\(NEW\.raw_user_meta_data->>'role'\)::app_role/);
  });

  it("validates the role against the enum's members before casting", () => {
    expect(body).toMatch(/staff_roles[\s\S]*?'teacher',\s*'admin',\s*'management',\s*'coordinator'/);
    expect(body).toMatch(/meta_role = ANY \(staff_roles\)/);
  });

  it("swallows profile-creation failures instead of aborting the signup", () => {
    // An un-creatable auth user is unrecoverable; a missing profile is not.
    expect(body).toMatch(/EXCEPTION WHEN others THEN[\s\S]{0,200}RAISE WARNING/);
  });

  it("rebinds the trigger — CREATE OR REPLACE alone does not", () => {
    expect(FIX).toMatch(/DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users/);
    expect(FIX).toMatch(/CREATE TRIGGER on_auth_user_created[\s\S]{0,200}handle_new_user/);
  });
});

describe("privilege-escalation guards", () => {
  it("audits existing parent/student accounts that hold a profiles row", () => {
    expect(FIX).toContain("PRIVILEGE ESCALATION");
    expect(FIX).toMatch(/JOIN public\.parent_auth_accounts/);
    expect(FIX).toMatch(/JOIN public\.student_auth_accounts/);
  });

  it("REPORTS overlaps rather than deleting them", () => {
    // A real staff member may also be a parent; silently deleting their
    // profile would revoke their job access.
    expect(FIX).not.toMatch(/DELETE FROM public\.profiles/i);
    expect(FIX).toMatch(/RAISE WARNING/);
  });

  it("blocks future non-staff profiles at write time", () => {
    expect(FIX).toContain("reject_non_staff_profile");
    expect(FIX).toMatch(/BEFORE INSERT ON public\.profiles/);
    expect(FIX).toMatch(/RAISE EXCEPTION[\s\S]{0,200}registered as a/);
  });

  it("keeps profiles.user_id unique so a retry cannot duplicate a profile", () => {
    expect(FIX).toMatch(/CREATE UNIQUE INDEX uq_profiles_user_id/);
  });
});

describe("migration ordering", () => {
  it("runs after the portal migration whose is_staff() it protects", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(files.indexOf("20260729_auth_user_trigger_fix.sql")).toBeGreaterThan(
      files.indexOf("20260727_parent_portal.sql"),
    );
  });
});
