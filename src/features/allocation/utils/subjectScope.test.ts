import { describe, it, expect } from "vitest";
import {
  allowedSubjectIds, isSubjectStillValid, subjectsForStandards,
} from "./subjectScope";
import type { Subject } from "@/features/setup/types/setup.types";

// ════════════════════════════════════════════════════════════════════════════
// SUBJECT SCOPING
//
// The reported bug: a teacher covering Std 2 and Std 4 in one morning picked
// Std 4 and was still shown Std 2's subjects. Two separate causes, both
// covered below — the form asked for `standardIds[0]` (whichever was clicked
// FIRST), and the server-side filter dropped institute-wide subjects entirely.
// ════════════════════════════════════════════════════════════════════════════

const sub = (id: string, name: string, standardId?: string): Subject => ({
  id, name, standardId, isOptional: false, isActive: true, displayOrder: 0,
});

const STD2 = "std-2";
const STD4 = "std-4";

const SUBJECTS: Subject[] = [
  sub("s1", "Maths", STD2),
  sub("s2", "English", STD2),
  sub("s3", "Maths", STD4),        // same NAME, different standard
  sub("s4", "Science", STD4),
  sub("s5", "Library"),             // institute-wide
  sub("s6", "Retired", STD2),
];
SUBJECTS[5].isActive = false;

const names: Record<string, string> = { [STD2]: "Std 2", [STD4]: "Std 4" };
const nameOf = (id: string) => names[id] ?? "Standard";

describe("subjectsForStandards", () => {
  it("returns only the selected standard's subjects", () => {
    const g = subjectsForStandards(SUBJECTS, [STD2], nameOf);
    expect(g.find((x) => x.standardId === STD2)!.subjects.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("follows a CHANGE of standard — the actual reported bug", () => {
    // Old behaviour keyed off standardIds[0], so switching the selection from
    // Std 2 to Std 4 kept listing Std 2's subjects.
    const g = subjectsForStandards(SUBJECTS, [STD4], nameOf);
    const ids = g.flatMap((x) => x.subjects.map((s) => s.id));
    expect(ids).toContain("s3");
    expect(ids).toContain("s4");
    expect(ids).not.toContain("s1");
    expect(ids).not.toContain("s2");
  });

  it("unions BOTH standards for a genuinely combined class", () => {
    const g = subjectsForStandards(SUBJECTS, [STD2, STD4], nameOf);
    expect([...allowedSubjectIds(g)].sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("keeps institute-wide subjects reachable", () => {
    // The old `.eq("standard_id", X)` excluded standard_id IS NULL, so Library,
    // PT and Moral Science were invisible on this form while the batch
    // timetable page showed them. Same data, two screens, two answers.
    const g = subjectsForStandards(SUBJECTS, [STD2], nameOf);
    const shared = g.find((x) => x.standardId === null);
    expect(shared?.subjects.map((s) => s.id)).toEqual(["s5"]);
  });

  it("groups by standard so a duplicated subject NAME is still distinguishable", () => {
    // "Maths" exists under both. A flat list would show it twice with nothing
    // to tell them apart.
    const g = subjectsForStandards(SUBJECTS, [STD2, STD4], nameOf);
    expect(g.map((x) => x.label)).toEqual(["Std 2", "Std 4", "All standards"]);
    const maths = g.flatMap((x) => x.subjects).filter((s) => s.name === "Maths");
    expect(maths).toHaveLength(2);
    expect(maths.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("excludes inactive subjects", () => {
    const g = subjectsForStandards(SUBJECTS, [STD2], nameOf);
    expect(allowedSubjectIds(g).has("s6")).toBe(false);
  });

  it("keeps an EMPTY group for an unconfigured standard", () => {
    // So the UI can name which standard needs subjects, rather than showing one
    // undifferentiated empty list when a teacher covers three.
    const g = subjectsForStandards(SUBJECTS, [STD2, "std-9"], nameOf);
    const empty = g.find((x) => x.standardId === "std-9");
    expect(empty).toBeDefined();
    expect(empty!.subjects).toEqual([]);
  });

  it("shows everything when no standard is chosen yet", () => {
    // An empty dropdown would read as "no subjects exist" rather than "choose
    // a standard first".
    const g = subjectsForStandards(SUBJECTS, [], nameOf);
    expect(allowedSubjectIds(g).size).toBe(5); // all active
  });
});

describe("isSubjectStillValid", () => {
  it("keeps a subject that belongs to a still-selected standard", () => {
    const g = subjectsForStandards(SUBJECTS, [STD2, STD4], nameOf);
    expect(isSubjectStillValid("s1", g)).toBe(true);
  });

  it("REJECTS a subject left over from a deselected standard", () => {
    // The data-integrity half of the bug: pick Std 2 → Maths, switch to Std 4,
    // and the form still held Std 2's Maths while the dropdown had already
    // moved on. The class saved against a subject that standard does not teach,
    // and nothing on screen revealed it.
    const g = subjectsForStandards(SUBJECTS, [STD4], nameOf);
    expect(isSubjectStillValid("s1", g)).toBe(false);
  });

  it("keeps an institute-wide subject across any standard change", () => {
    expect(isSubjectStillValid("s5", subjectsForStandards(SUBJECTS, [STD4], nameOf))).toBe(true);
  });

  it("treats 'no subject chosen' as valid", () => {
    expect(isSubjectStillValid("", subjectsForStandards(SUBJECTS, [STD4], nameOf))).toBe(true);
  });
});
