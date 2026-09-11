import { describe, it, expect } from "vitest";
import type { Batch, Subject } from "@/features/setup/types/setup.types";
import type { ClassSchedule, Section } from "../types/allocation.types";
import {
  ALL_BATCHES,
  batchByStandard,
  batchesForStandard,
  draftsToInput,
  effectivePlan,
  firstIncompleteDraft,
  isDraftComplete,
  isPlanComplete,
  isSplitSubject,
  newDraft,
  ownSubjectsForStandard,
  sectionsForStandard,
  splitSubjectTitle,
  subjectsForStandard,
  type PlanDraft,
} from "./standardPlan";
import { classLabel, classTitle } from "./scheduleView";

// ─────────────────────────────────────────────────────────────────────────────
// The rules a combined class turns on. All of them are decisions rather than
// rendering, and every one of them is a case nobody can conveniently reproduce
// against a live timetable: a standard with no subjects, an institute with no
// batches, a class written before the column existed.
// ─────────────────────────────────────────────────────────────────────────────

const subject = (p: Partial<Subject> & { id: string }): Subject => ({
  name: p.id,
  isOptional: false,
  isActive: true,
  displayOrder: 0,
  ...p,
});

const batch = (p: Partial<Batch> & { id: string }): Batch =>
  ({ name: p.id, ...p }) as Batch;

const section = (p: Partial<Section> & { id: string }): Section => ({
  name: p.id,
  sortOrder: 0,
  isActive: true,
  ...p,
});

const cls = (p: Partial<ClassSchedule>): ClassSchedule =>
  ({
    id: "c1",
    standardIds: [],
    standardNames: [],
    standardPlan: [],
    scheduleDate: "2026-08-20",
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    mode: "offline",
    repeatWeekly: false,
    holidaySkip: true,
    isExtra: false,
    status: "scheduled",
    repeatPattern: "none",
    repeatDays: [],
    lateMinutes: 0,
    earlyMinutes: 0,
    ...p,
  }) as ClassSchedule;

describe("what each standard may be given", () => {
  const subjects = [
    subject({ id: "m2", name: "Maths", standardId: "s2" }),
    subject({ id: "m3", name: "Maths", standardId: "s3" }),
    subject({ id: "sci3", name: "Science", standardId: "s3" }),
    subject({ id: "pt", name: "PT" }), // institute-wide
    subject({ id: "old", name: "Retired", standardId: "s2", isActive: false }),
  ];

  it("offers a standard only its OWN subjects, plus institute-wide ones", () => {
    expect(subjectsForStandard(subjects, "s2").map((s) => s.id)).toEqual(["m2", "pt"]);
    expect(subjectsForStandard(subjects, "s3").map((s) => s.id)).toEqual(["m3", "sci3", "pt"]);
  });

  it("never offers another standard's subject", () => {
    // The reported bug: picking 2nd STD then 3rd STD listed 2nd STD's subjects.
    // Each standard is asked independently now, so there is no union to leak.
    expect(subjectsForStandard(subjects, "s2").map((s) => s.id)).not.toContain("m3");
    expect(subjectsForStandard(subjects, "s3").map((s) => s.id)).not.toContain("m2");
  });

  it("excludes deactivated subjects", () => {
    expect(subjectsForStandard(subjects, "s2").map((s) => s.id)).not.toContain("old");
  });

  it("counts institute-wide subjects as offered but not as OWN", () => {
    // The distinction is what lets the UI say "no subjects for 2nd STD — add
    // them in Setup" while still offering PT.
    expect(ownSubjectsForStandard(subjects, "s2").map((s) => s.id)).toEqual(["m2"]);
    expect(ownSubjectsForStandard(subjects, "s9")).toEqual([]);
  });

  it("offers a standard its own batches plus unscoped ones", () => {
    const batches = [
      batch({ id: "b2", standardId: "s2" }),
      batch({ id: "b3", standardId: "s3" }),
      batch({ id: "any" }),
    ];
    expect(batchesForStandard(batches, "s2").map((b) => b.id)).toEqual(["b2", "any"]);
  });

  it("scopes sections strictly to one standard", () => {
    const sections = [
      section({ id: "a", standardId: "s2" }),
      section({ id: "b", standardId: "s3" }),
      section({ id: "loose" }),
    ];
    // A section with no standard is not shared the way a subject is — it
    // belongs to a standard by definition, so an unscoped one is bad data and
    // is offered to nobody rather than to everybody.
    expect(sectionsForStandard(sections, "s2").map((s) => s.id)).toEqual(["a"]);
  });
});

describe("when a standard is finished", () => {
  const full = { hasSubjects: true, hasBatches: true };

  it("needs a subject", () => {
    expect(isDraftComplete(newDraft("s2"), full)).toBe(false);
    expect(isDraftComplete({ ...newDraft("s2"), subjectId: "m2" }, full)).toBe(false);
  });

  it("needs the batch DECIDED, and 'all batches' is a decision", () => {
    const d: PlanDraft = { ...newDraft("s2"), subjectId: "m2", batchId: ALL_BATCHES };
    expect(isDraftComplete(d, full)).toBe(true);
    expect(isDraftComplete({ ...d, batchId: "b2" }, full)).toBe(true);
  });

  it("does not demand a batch where the institute has none", () => {
    // Otherwise an institute that has never created a batch could not schedule
    // a single class.
    const d: PlanDraft = { ...newDraft("s2"), subjectId: "m2" };
    expect(isDraftComplete(d, { hasSubjects: true, hasBatches: false })).toBe(true);
  });

  it("lets an unconfigured standard through rather than trapping the form", () => {
    // A standard with no subjects at all is a Setup problem. Blocking here
    // would leave the operator unable to finish OR abandon the standard they
    // just added; the UI names the gap instead.
    expect(isDraftComplete(newDraft("s9"), { hasSubjects: false, hasBatches: true })).toBe(
      true,
    );
  });
});

describe("which standard is blocking", () => {
  const optionsFor = () => ({ hasSubjects: true, hasBatches: true });
  const done = (id: string): PlanDraft => ({
    standardId: id,
    subjectId: `sub-${id}`,
    batchId: ALL_BATCHES,
    sectionId: "",
  });

  it("names the first unfinished standard, not just 'incomplete'", () => {
    const drafts = [done("s2"), newDraft("s3"), newDraft("s4")];
    expect(firstIncompleteDraft(drafts, optionsFor)?.standardId).toBe("s3");
  });

  it("reports an empty plan as complete", () => {
    // An extra/revision class with no standard at all has always been legal.
    expect(isPlanComplete([], optionsFor)).toBe(true);
  });

  it("is complete only when every standard is", () => {
    expect(isPlanComplete([done("s2"), done("s3")], optionsFor)).toBe(true);
    expect(isPlanComplete([done("s2"), newDraft("s3")], optionsFor)).toBe(false);
  });
});

describe("collapsing the builder into a class", () => {
  it("takes the scalars from the PRIMARY standard, not from a merge", () => {
    const input = draftsToInput([
      { standardId: "s2", subjectId: "m2", batchId: "b2", sectionId: "a" },
      { standardId: "s3", subjectId: "sci3", batchId: "b3", sectionId: "" },
    ]);
    expect(input.standardIds).toEqual(["s2", "s3"]);
    expect(input.subjectId).toBe("m2");
    expect(input.batchId).toBe("b2");
    expect(input.sectionId).toBe("a");
    expect(input.standardPlan).toHaveLength(2);
    expect(input.standardPlan[1]).toMatchObject({
      standardId: "s3",
      subjectId: "sci3",
      subjectIds: ["sci3"],
      batchId: "b3",
    });
  });

  it("strips the ALL_BATCHES sentinel — it must never reach the database", () => {
    // Downstream, an absent batch already means the whole standard. The
    // sentinel exists only so an empty select cannot be mistaken for a choice.
    const input = draftsToInput([
      { standardId: "s2", subjectId: "m2", batchId: ALL_BATCHES, sectionId: "" },
    ]);
    expect(input.batchId).toBe("");
    expect(input.standardPlan[0].batchId).toBeUndefined();
  });

  it("drops entries with no standard", () => {
    expect(draftsToInput([newDraft("")]).standardPlan).toEqual([]);
  });

  it("maps each standard to its own batch for the roster query", () => {
    const map = batchByStandard([
      { standardId: "s2", batchId: "b2" },
      { standardId: "s3", batchId: undefined },
    ]);
    expect(map).toEqual({ s2: "b2", s3: undefined });
  });
});

describe("reading a stored class back", () => {
  it("derives a plan for rows written before the column existed", () => {
    // Those rows genuinely DID mean one subject for every standard — that was
    // the model — so repeating it is reporting them, not inventing detail.
    const plan = effectivePlan(
      cls({
        standardIds: ["s2", "s3"],
        standardNames: ["2nd STD", "3rd STD"],
        subjectId: "m",
        subjectName: "Maths",
        batchId: "b",
        batchName: "Morning",
      }),
    );
    expect(plan).toHaveLength(2);
    expect(plan.map((e) => e.subjectName)).toEqual(["Maths", "Maths"]);
    expect(plan[1].standardName).toBe("3rd STD");
  });

  it("prefers a stored plan over the scalars", () => {
    const plan = effectivePlan(
      cls({
        standardIds: ["s2"],
        subjectName: "Stale",
        standardPlan: [{ standardId: "s2", subjectName: "Maths" }],
      }),
    );
    expect(plan).toEqual([{ standardId: "s2", subjectName: "Maths" }]);
  });

  it("does not call a derived legacy plan 'split'", () => {
    // isSplitSubject reads the STORED plan, never the derived one: a legacy row
    // has one subject by construction, and treating it as split would relabel
    // every historical class in the timetable.
    const legacy = cls({ standardIds: ["s2", "s3"], subjectId: "m", subjectName: "Maths" });
    expect(isSplitSubject(legacy)).toBe(false);
    expect(classTitle(legacy)).toBe("Maths");
  });

  it("is split only when the subjects actually differ", () => {
    const same = cls({
      standardPlan: [
        { standardId: "s2", subjectId: "m" },
        { standardId: "s3", subjectId: "m" },
      ],
    });
    expect(isSplitSubject(same)).toBe(false);

    const differ = cls({
      standardPlan: [
        { standardId: "s2", subjectId: "m2" },
        { standardId: "s3", subjectId: "sci3" },
      ],
    });
    expect(isSplitSubject(differ)).toBe(true);
  });
});

describe("what a split class is called", () => {
  const split = cls({
    standardNames: ["2nd STD", "3rd STD"],
    subjectName: "Maths",
    standardPlan: [
      { standardId: "s2", standardName: "2nd STD", subjectId: "m2", subjectName: "Maths" },
      {
        standardId: "s3",
        standardName: "3rd STD",
        subjectId: "sci3",
        subjectName: "Science",
      },
    ],
  });

  it("names each standard with the subject IT is doing", () => {
    expect(splitSubjectTitle(split)).toBe("2nd STD · Maths  +  3rd STD · Science");
  });

  it("stops the timetable printing one standard's subject for the whole room", () => {
    // The compact form would read "2nd STD + 3rd STD · Maths" — a subject half
    // the class is not taking.
    expect(classTitle(split)).not.toContain("+ 3rd STD ·  ");
    expect(classTitle(split)).toContain("3rd STD · Science");
  });

  it("keeps the compact form when the room really is doing one subject", () => {
    expect(
      classTitle(cls({ standardNames: ["Std 2", "Std 4"], sectionName: "A", subjectName: "Maths" })),
    ).toBe("Std 2 + Std 4 · A · Maths");
  });

  it("honours the caller's separator for the unsplit case only", () => {
    // A split title is already made of " · " segments joined by " + ", so a
    // caller-supplied separator would make it unreadable rather than adapt it.
    expect(classLabel(cls({ standardNames: ["Std 5"], subjectName: "Science" }), " / ")).toBe(
      "Std 5 / Science",
    );
    expect(classLabel(split, " / ")).toBe("2nd STD · Maths  +  3rd STD · Science");
  });
});
