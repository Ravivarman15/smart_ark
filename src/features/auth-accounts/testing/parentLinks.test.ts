// ── Regression: a parent's linked children must never be silently invented ───
//
// THE BUG THIS PINS
// `listParentAccounts` embedded `students(name, section, …)` in the links
// query. `students.section` only exists once 20260630_student_profile_foundation
// is applied, so on a database without it PostgREST failed the WHOLE query with
// 42703 — and the handler was `if (links.error) return accounts`, which rendered
// every parent as "No children linked — this parent sees an empty portal".
//
// A child WAS linked. Staff were told the opposite, about a security-relevant
// relationship, and went off to re-link an account that was already correct.
//
// Two properties are pinned here:
//   1. a missing optional column degrades to the minimal shape, not to nothing
//   2. a genuinely unreadable list reports itself as UNKNOWN, never as EMPTY

import { describe, expect, it } from "vitest";
import { authAccountsService } from "../services/authAccounts.service";

type QueryResult = { data: unknown; error: { message: string } | null };
type Handler = (table: string, columns: string) => QueryResult;

/** Minimal stand-in for the supabase query builder used by this service. */
const fakeDb = (handler: Handler) => ({
  from: (table: string) => ({
    select: (columns: string) => {
      const result = handler(table, columns);
      const chain: Record<string, unknown> = {
        order: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: (v: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  }),
});

const withDb = async <T>(handler: Handler, run: () => Promise<T>): Promise<T> => {
  const svc = authAccountsService as unknown as { db: unknown };
  const original = svc.db;
  svc.db = fakeDb(handler);
  try {
    return await run();
  } finally {
    svc.db = original;
  }
};

const ACCOUNT = {
  id: "pa-1",
  user_id: "u-1",
  name: "Mani",
  username: "mani.a3f9",
  login_email: "mani@example.com",
  email: "mani@example.com",
  mobile: "9876543210",
  status: "active",
  auto_sync: true,
  last_synced_at: null,
};

const LINK = {
  parent_account_id: "pa-1",
  student_id: "st-1",
  relation: "father",
  is_primary: true,
  students: { name: "Ram" },
};

const MISSING_SECTION = { message: 'column "section" does not exist' };

describe("listParentAccounts — children resolution", () => {
  it("falls back to the minimal shape when students.section is absent", async () => {
    const attempted: string[] = [];
    const accounts = await withDb(
      (table, columns) => {
        if (table === "parent_auth_accounts") return { data: [ACCOUNT], error: null };
        attempted.push(columns);
        // The rich embed names `section`; the fallback must not.
        if (columns.includes("section")) return { data: null, error: MISSING_SECTION };
        return { data: [LINK], error: null };
      },
      () => authAccountsService.listParentAccounts(),
    );

    expect(attempted).toHaveLength(2);
    expect(attempted[1]).not.toContain("section");

    expect(accounts[0].children).toHaveLength(1);
    expect(accounts[0].children[0]).toMatchObject({
      studentId: "st-1",
      name: "Ram",
      relation: "father",
      isPrimary: true,
    });
    expect(accounts[0].linkedStudentIds).toEqual(["st-1"]);
    // The optional columns are simply absent — not faked.
    expect(accounts[0].children[0].section).toBeUndefined();
    expect(accounts[0].childrenError).toBeUndefined();
  });

  it("uses the rich shape, with class and section, when the column exists", async () => {
    const accounts = await withDb(
      (table) =>
        table === "parent_auth_accounts"
          ? { data: [ACCOUNT], error: null }
          : {
              data: [
                {
                  ...LINK,
                  students: {
                    name: "Ram",
                    section: "B",
                    enrolment_no: "EN-7",
                    standards: { name: "Grade 9" },
                  },
                },
              ],
              error: null,
            },
      () => authAccountsService.listParentAccounts(),
    );

    expect(accounts[0].children[0]).toMatchObject({
      name: "Ram",
      section: "B",
      enrolmentNo: "EN-7",
      className: "Grade 9",
    });
  });

  it("reports an unreadable list as unknown — NOT as zero children", async () => {
    const accounts = await withDb(
      (table) =>
        table === "parent_auth_accounts"
          ? { data: [ACCOUNT], error: null }
          : { data: null, error: { message: "permission denied for table students" } },
      () => authAccountsService.listParentAccounts(),
    );

    // The account still lists — one broken join must not blank the page.
    expect(accounts).toHaveLength(1);
    expect(accounts[0].children).toEqual([]);
    // …but the UI is told WHY, so it can say "unknown" instead of "none".
    expect(accounts[0].childrenError).toMatch(/permission denied/);
  });

  it("a parent with genuinely no links is distinguishable from a failed read", async () => {
    const accounts = await withDb(
      (table) =>
        table === "parent_auth_accounts"
          ? { data: [ACCOUNT], error: null }
          : { data: [], error: null },
      () => authAccountsService.listParentAccounts(),
    );

    expect(accounts[0].children).toEqual([]);
    expect(accounts[0].childrenError).toBeUndefined();
  });

  it("sorts primary children first so the switcher is stable", async () => {
    const accounts = await withDb(
      (table) =>
        table === "parent_auth_accounts"
          ? { data: [ACCOUNT], error: null }
          : {
              data: [
                { ...LINK, student_id: "st-2", is_primary: false, students: { name: "Sita" } },
                { ...LINK, student_id: "st-1", is_primary: true, students: { name: "Ram" } },
              ],
              error: null,
            },
      () => authAccountsService.listParentAccounts(),
    );

    expect(accounts[0].children.map((c) => c.name)).toEqual(["Ram", "Sita"]);
  });
});
