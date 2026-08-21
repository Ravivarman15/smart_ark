import { describe, it, expect } from "vitest";
import {
  describeTargeting,
  isTargeted,
  normaliseDrafts,
  summarise,
  targetsEveryone,
} from "../utils/assignmentTargeting";
import { readTs } from "./sourceGate";
import type { AssignmentDraft } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// WHO GETS THE TEST
//
// These rules decide who sees a test in a portal AND, mirrored in the edge
// function, who the server admits. The failures they guard against are the
// quiet kind: a test that reaches nobody, a test that reaches everybody, and a
// sibling seeing another sibling's paper.
// ─────────────────────────────────────────────────────────────────────────────

const s = (id: string, batchId?: string, standardId?: string, isActive = true) => ({
  id,
  batchId,
  standardId,
  isActive,
});

const draft = (
  scopeType: AssignmentDraft["scopeType"],
  scopeId = "",
  scopeName = "",
): AssignmentDraft => ({ scopeType, scopeId, scopeName });

// ═════════════════════════════════════════════════════════════════════════════
describe("an unassigned test", () => {
  it("reaches everyone, because that is what it already meant", () => {
    // Narrowing this would silently close exams that are running today.
    expect(targetsEveryone([])).toBe(true);
    expect(isTargeted([], s("a"))).toBe(true);
  });

  it("is the same audience as an explicit 'all'", () => {
    expect(targetsEveryone([draft("all")])).toBe(true);
    expect(isTargeted([draft("all")], s("a"))).toBe(true);
  });

  it("is NOT everyone once something narrows it", () => {
    expect(targetsEveryone([draft("batch", "b1")])).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("scopes are a union, never an intersection", () => {
  const drafts = [draft("standard", "std10"), draft("student", "kid9")];

  it("admits a student matched by EITHER scope", () => {
    expect(isTargeted(drafts, s("kid1", "b1", "std10"))).toBe(true);
    expect(isTargeted(drafts, s("kid9", "b7", "std12"))).toBe(true);
  });

  it("excludes a student matched by neither", () => {
    // The intersection reading would assign this test to nobody at all.
    expect(isTargeted(drafts, s("kid4", "b7", "std12"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("each scope targets what it says", () => {
  it("batch matches on batch", () => {
    expect(isTargeted([draft("batch", "b1")], s("k", "b1", "std1"))).toBe(true);
    expect(isTargeted([draft("batch", "b1")], s("k", "b2", "std1"))).toBe(false);
  });

  it("standard matches on standard", () => {
    expect(isTargeted([draft("standard", "s1")], s("k", "b9", "s1"))).toBe(true);
    expect(isTargeted([draft("standard", "s1")], s("k", "b9", "s2"))).toBe(false);
  });

  it("student matches exactly one child", () => {
    // The sibling case: two children of the same batch, one named.
    const drafts = [draft("student", "kidA")];
    expect(isTargeted(drafts, s("kidA", "b1", "s1"))).toBe(true);
    expect(isTargeted(drafts, s("kidB", "b1", "s1"))).toBe(false);
  });

  it("subject targets nobody, because it is not a target", () => {
    // It records which subject the exam belongs to. Treating it as an audience
    // would assign the test to zero students and look like a bug in the roster.
    expect(isTargeted([draft("subject", "sub1")], s("k", "b1", "s1"))).toBe(false);
  });

  it("ignores a scope with no id", () => {
    expect(isTargeted([draft("batch", "")], s("k", "b1", "s1"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the count a teacher sees before publishing", () => {
  const roster = [
    s("k1", "b1", "s1"),
    s("k2", "b1", "s1"),
    s("k3", "b2", "s2"),
    s("k4", "b2", "s2", false), // deactivated
  ];

  it("counts distinct students, not scopes", () => {
    // Overlapping scopes must not double-count: this is one student, twice
    // matched.
    const drafts = [draft("batch", "b1"), draft("standard", "s1")];
    expect(summarise(drafts, roster).eligible).toBe(2);
  });

  it("separates deactivated students instead of dropping them silently", () => {
    // A teacher looking at a class list of 2 needs to know why the number says 1.
    const out = summarise([draft("batch", "b2")], roster);
    expect(out.eligible).toBe(1);
    expect(out.inactive).toBe(1);
  });

  it("flags a named student already covered by a class", () => {
    // The commonest confusion: select the class, then also search for three of
    // its students, and wonder why the count did not move.
    const out = summarise([draft("batch", "b1"), draft("student", "k1")], roster);
    expect(out.eligible).toBe(2);
    expect(out.redundant).toBe(1);
  });

  it("counts the whole active roster for everyone", () => {
    const out = summarise([draft("all")], roster);
    expect(out.everyone).toBe(true);
    expect(out.eligible).toBe(3);
    expect(out.inactive).toBe(1);
  });

  it("says 'no students match' in words rather than showing a 0", () => {
    // A bare 0 reads like a loading state; this is the failure most worth
    // noticing before publishing.
    const out = summarise([draft("batch", "nope")], roster);
    expect(out.eligible).toBe(0);
    expect(describeTargeting(out)).toMatch(/no students match/i);
  });

  it("never claims a number for everyone", () => {
    expect(describeTargeting(summarise([draft("all")], roster))).toMatch(/everyone/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("what gets stored", () => {
  it("collapses to 'all' and drops the rest", () => {
    // Keeping the others would persist dead config a later reader has to
    // reason about.
    const out = normaliseDrafts([
      draft("batch", "b1"),
      draft("all"),
      draft("student", "k1"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].scopeType).toBe("all");
  });

  it("removes duplicates", () => {
    expect(normaliseDrafts([draft("batch", "b1"), draft("batch", "b1")])).toHaveLength(1);
  });

  it("drops half-filled scopes", () => {
    expect(normaliseDrafts([draft("batch", "")])).toHaveLength(0);
  });

  it("keeps distinct scopes of the same type", () => {
    expect(
      normaliseDrafts([draft("batch", "b1"), draft("batch", "b2")]),
    ).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the browser and the server agree", () => {
  // The count on screen is a preview; the server decides. They cannot share
  // code — one is TypeScript in a bundle, the other runs in Deno against SQL —
  // so the RULES are pinned in both directions instead.
  const ENGINE = readTs("supabase/functions/_shared/testEngine.ts");
  const eligible = ENGINE.slice(
    ENGINE.indexOf("export async function isEligible"),
    ENGINE.indexOf("export function remainingSeconds"),
  );

  it("treats no assignments as everyone, on the server too", () => {
    expect(eligible).toContain("if (assignments.length === 0) return true");
  });

  it("honours an explicit 'all', on the server too", () => {
    expect(eligible).toContain('a.scope_type === "all"');
  });

  it("honours a named student, on the server too", () => {
    expect(eligible).toContain('a.scope_type === "student"');
  });

  it("honours batch and standard, on the server too", () => {
    expect(eligible).toContain('a.scope_type === "batch"');
    expect(eligible).toContain('a.scope_type === "standard"');
  });

  it("scopes the student lookup to one organization", () => {
    expect(eligible).toContain('.eq("organization_id", organizationId)');
  });

  it("refuses a guest when the test is narrowed", () => {
    // A public-link guest has no student row, so assignment cannot apply to
    // them; the link is their authorisation, and only for an unnarrowed test.
    expect(eligible).toContain("if (!studentId) return false");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("the portal list is per student, not per batch", () => {
  const SERVICE = readTs("src/features/exams/services/mcqExam.service.ts");
  const HOOK = readTs("src/features/exams/hooks/useMcqExams.ts");

  it("resolves visibility with the shared rules", () => {
    expect(SERVICE).toContain("isTargeted(");
  });

  it("caches on the student id", () => {
    // Keyed on the batch, two siblings in one batch would be served each
    // other's list — and a test assigned to just one of them would leak.
    expect(HOOK).toContain("queryKeys.exams.mcqStudentExams(studentId");
  });
});
