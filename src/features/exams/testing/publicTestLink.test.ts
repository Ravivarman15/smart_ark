import { describe, it, expect } from "vitest";
import { readSource, readSql, readTs } from "./sourceGate";

const MIGRATION = readSql("supabase/migrations/20261016_online_test_public_access.sql");
const PUBLIC_FN = readTs("supabase/functions/public-test/index.ts");
const AUTH_FN = readTs("supabase/functions/online-test/index.ts");
const ENGINE = readTs("supabase/functions/_shared/testEngine.ts");
const CONFIG = readTs("supabase/config.toml").replace(/#.*$/gm, "");
const PAGE = readTs("src/pages/PublicTestPage.tsx");
const CLIENT = readTs("src/features/exams/services/publicTest.service.ts");

// ═════════════════════════════════════════════════════════════════════════════
describe("the token is not guessable and not permanent", () => {
  it("is minted from a CSPRNG, not Math.random", () => {
    expect(AUTH_FN).toContain("crypto.getRandomValues");
    const mint = AUTH_FN.slice(AUTH_FN.indexOf("function mintToken"), AUTH_FN.indexOf("async function requireStaff"));
    expect(mint).not.toContain("Math.random");
    expect(mint).toContain("new Uint8Array(32)"); // 256 bits
  });

  it("is url-safe, because it lives in a link people paste", () => {
    // Read UNSTRIPPED on purpose. `.replace(/\//g, "_")` contains the two
    // characters `//` inside a regex literal, and a line-based comment stripper
    // cannot tell that from a comment — it deletes the very line under test.
    const raw = readSource("supabase/functions/online-test/index.ts");
    const mint = raw.slice(
      raw.indexOf("function mintToken"),
      raw.indexOf("async function requireStaff"),
    );
    expect(mint).toContain('.replace(/\\+/g, "-")');
    expect(mint).toContain('.replace(/\\//g, "_")');
  });

  it("has a length floor in the database, not only in code", () => {
    expect(MIGRATION).toContain("length(public_token) >= 32");
  });

  it("is unique across ALL tenants", () => {
    // The token is resolved BEFORE any organization is known, so a collision
    // between two tenants would resolve one org's link to the other's test.
    expect(MIGRATION).toContain("create unique index if not exists uq_mcq_exams_public_token");
    expect(MIGRATION).toContain("where public_token is not null");
  });

  it("can be revoked and can expire", () => {
    expect(MIGRATION).toContain("public_token_revoked_at");
    expect(MIGRATION).toContain("public_token_expires_at");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("resolving a link exposes almost nothing", () => {
  const resolver = MIGRATION.slice(
    MIGRATION.indexOf("function public.resolve_public_test"),
    MIGRATION.indexOf("function public.public_test_branding"),
  );

  it("returns metadata only — never a question, never a key", () => {
    expect(resolver).not.toContain("mcq_questions");
    expect(resolver).not.toContain("mcq_paper_questions");
    expect(resolver).not.toContain("options");
    expect(resolver).not.toContain("answer");
  });

  it("refuses a revoked, expired or non-public token in SQL", () => {
    expect(resolver).toContain("public_token_revoked_at is null");
    expect(resolver).toContain("public_token_expires_at is null or");
    expect(resolver).toContain("access_mode = 'public_link'");
  });

  it("refuses a suspended tenant's link", () => {
    // Otherwise an organization could be cut off from the product and still be
    // running examinations through it.
    expect(resolver).toContain("is_org_suspended_for");
  });

  it("treats an unknown organization as suspended, never as permitted", () => {
    const helper = MIGRATION.slice(
      MIGRATION.indexOf("function public.is_org_suspended_for"),
      MIGRATION.indexOf("function public.resolve_public_test"),
    );
    expect(helper).toContain("true");   // the COALESCE fallback
    expect(helper).toContain("deleted_at is not null");
  });

  it("is callable ONLY by the service role", () => {
    // Reachable from PostgREST, it would be a token oracle nobody can rate-limit.
    expect(MIGRATION).toContain(
      "revoke all on function public.resolve_public_test(text) from public, anon, authenticated",
    );
    expect(MIGRATION).toContain(
      "grant execute on function public.resolve_public_test(text)   to service_role",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the anonymous endpoint cannot mint what it accepts", () => {
  it("has no token generator of its own", () => {
    expect(PUBLIC_FN).not.toContain("getRandomValues");
    expect(PUBLIC_FN).not.toContain("mintToken");
  });

  it("issues links only from the AUTHENTICATED function, behind a staff check", () => {
    expect(AUTH_FN).toContain('action === "issue_link"');
    expect(AUTH_FN).toContain("requireStaff(db, req)");
    expect(PUBLIC_FN).not.toContain("issue_link");
  });

  it("runs with verify_jwt = false, and says why", () => {
    expect(CONFIG).toContain("[functions.public-test]");
    const block = CONFIG.slice(CONFIG.indexOf("[functions.public-test]"));
    expect(block).toContain("verify_jwt = false");
  });

  it("leaves the authenticated function's verify_jwt alone", () => {
    // Flipping it there would remove the platform's signature check from the
    // staff and parent paths, which have nothing to do with public links.
    const block = CONFIG.slice(CONFIG.indexOf("[functions.online-test]"));
    expect(block.split("\n")[1]).toContain("verify_jwt = true");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a token is not a session", () => {
  it("requires a valid token before ANY action", () => {
    // resolveLink is called once, unconditionally, above the action switch.
    const body = PUBLIC_FN.slice(PUBLIC_FN.indexOf("Deno.serve"));
    const resolveAt = body.indexOf("await resolveLink(db, token)");
    const firstAction = body.indexOf('action === "info"');
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(firstAction);
  });

  it("checks the attempt belongs to the token's own exam AND organization", () => {
    // Without this, any attempt id plus any valid token would be enough to
    // write into a stranger's paper — including across tenants.
    expect(PUBLIC_FN).toContain("attempt.organization_id !== link.organizationId");
    expect(PUBLIC_FN).toContain("attempt.exam_id !== link.examId");
  });

  it("refuses to continue an attempt opened through a different channel", () => {
    expect(PUBLIC_FN).toContain('attempt.access_mode !== "public_link"');
  });

  it("gives one answer for unknown, revoked and expired tokens alike", () => {
    // Telling a stranger a token USED to work confirms they guessed a real one,
    // so the four failure modes — never existed, revoked, expired, not public —
    // all resolve to nothing in SQL and to ONE message here.
    const occurrences =
      PUBLIC_FN.split("This test link is not valid, or is no longer active.").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // And no message anywhere tells the caller WHICH of them happened.
    for (const tell of ["revoked", "expired", "no longer public", "was valid"]) {
      expect(PUBLIC_FN.toLowerCase()).not.toContain(`link has ${tell}`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("an anonymous taker is a guest, and stays one", () => {
  it("never matches a typed email to a real student", () => {
    // Nothing verifies that email. Matching on it would let anyone holding the
    // link record a deliberately bad attempt against a classmate.
    expect(PUBLIC_FN).not.toContain("student_email");
    expect(PUBLIC_FN).not.toContain("student_contact");
    const build = PUBLIC_FN.slice(
      PUBLIC_FN.indexOf("async function buildTaker"),
      PUBLIC_FN.indexOf("Deno.serve"),
    );
    expect(build).toContain("studentId: null");
    expect(build).not.toContain('.from("students")');
  });

  it("hashes the identity into the participant key", () => {
    // participant_key lands in an index and in logs; an email does not need to
    // be in either.
    const key = ENGINE.slice(
      ENGINE.indexOf("export async function guestParticipantKey"),
      ENGINE.indexOf("export const studentParticipantKey"),
    );
    expect(key).toContain('crypto.subtle.digest("SHA-256"');
    expect(key).toContain("examId");   // salted per exam, so keys are not linkable
  });

  it("still counts against the attempt limit", () => {
    expect(MIGRATION).toContain("uq_mcq_attempts_participant_in_progress");
    expect(ENGINE).toContain('.eq("participant_key", taker.participantKey)');
  });

  it("keeps the earlier student index rather than swapping it out", () => {
    // Dropping a live constraint to replace it is a window in which neither
    // holds.
    expect(MIGRATION).not.toContain("drop index");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("one engine, two doors", () => {
  it("both entry points grade through the shared engine", () => {
    for (const fn of [PUBLIC_FN, AUTH_FN]) {
      expect(fn).toContain('from "../_shared/testEngine.ts"');
      expect(fn).toContain("submitAttempt");
    }
  });

  it("neither entry point grades anything itself", () => {
    for (const fn of [PUBLIC_FN, AUTH_FN]) {
      expect(fn).not.toContain("gradeAttempt(");
      expect(fn).not.toContain("total_score:");
    }
  });

  it("the engine still refuses to send an answer key", () => {
    const pub = ENGINE.slice(
      ENGINE.indexOf("export function publicQuestion"),
      ENGINE.indexOf("export function seededShuffle"),
    );
    expect(pub).not.toContain("...q");
    expect(pub).not.toContain("isCorrect");
    expect(pub).not.toContain("explanation");
    expect(pub).not.toContain("answerText");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the public page wears the institution, not the platform", () => {
  it("takes branding from the payload, never from a browser-supplied org", () => {
    expect(PAGE).toContain("branding");
    expect(PAGE).not.toMatch(/organizationId\s*[:=]/);
    expect(PAGE).not.toContain("current_org_id");
  });

  it("hardcodes no tenant name", () => {
    for (const name of ["ARK Learning Arena", "ABC Academi", "Smart ARK"]) {
      expect(PAGE).not.toContain(name);
    }
  });

  it("sends no Authorization header, so a stray session cannot travel", () => {
    expect(CLIENT).toContain("fetch(");
    expect(CLIENT).not.toContain("Authorization");
    expect(CLIENT).not.toContain("supabase.functions.invoke");
  });

  it("remembers a resumable attempt in sessionStorage, not localStorage", () => {
    // A shared or library computer must not offer the next person the previous
    // taker's paper.
    expect(CLIENT).toContain("sessionStorage");
    expect(CLIENT).not.toContain("localStorage");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("existing data is untouched", () => {
  it("writes no rows", () => {
    expect(MIGRATION).not.toMatch(/^\s*(insert into|update |delete from)/m);
  });

  it("adds access_mode with the meaning every existing exam already had", () => {
    expect(MIGRATION).toContain("add column if not exists access_mode text not null default 'assigned'");
  });

  it("does not touch the manual-exam tables", () => {
    expect(MIGRATION).not.toMatch(/alter table public\.exams\b/);
    expect(MIGRATION).not.toMatch(/alter table public\.exam_results\b/);
  });

  it("is re-runnable", () => {
    expect(MIGRATION).toContain("add column if not exists");
    expect(MIGRATION).toContain("create unique index if not exists");
    expect(MIGRATION).toContain("create or replace function");
  });
});
