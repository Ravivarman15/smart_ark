import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// PER-CLASS STUDENT ASSIGNMENT — the rules that decide who a teacher sees.
//
// Two failures here are silent and expensive:
//   • a roster written to only the FIRST occurrence of a weekly class → every
//     later week opens an empty (or batch-wide) attendance sheet;
//   • a multi-batch class saved under one batch → students filed against a
//     batch they are not in, quietly corrupting the batch register.
// Both are pinned below.
// ════════════════════════════════════════════════════════════════════════════

// A minimal PostgREST-shaped stub. Each table records what it was asked to do
// so the assertions can read the actual writes rather than a mock's shape.
interface Recorded {
  inserted: Record<string, unknown>[];
  deletedIn?: unknown[];
}

const recorded: Record<string, Recorded> = {};
const tableData: Record<string, Record<string, unknown>[]> = {};

const builder = (table: string) => {
  recorded[table] ??= { inserted: [] };
  const rows = () => tableData[table] ?? [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gt: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows(), error: null }),
    insert: (payload: Record<string, unknown>[]) => {
      recorded[table].inserted.push(...(Array.isArray(payload) ? payload : [payload]));
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => ({
      in: (_col: string, values: unknown[]) => {
        recorded[table].deletedIn = values;
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return chain;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

import { classStudentsService } from "./classStudents.service";
import { groupRowsByBatch } from "./classAttendance.service";
import type { ClassRosterRow } from "../types/allocation.types";

beforeEach(() => {
  for (const k of Object.keys(recorded)) delete recorded[k];
  for (const k of Object.keys(tableData)) delete tableData[k];
});

describe("classStudentsService.setRoster", () => {
  const students = [
    { id: "s1", name: "Aarav", roll_number: "01", standard_id: "std9", batch_id: "b1" },
    { id: "s2", name: "Diya", roll_number: "02", standard_id: "std10", batch_id: "b2" },
  ];

  it("applies the same roster to EVERY occurrence of a recurring class", async () => {
    tableData.students = students;
    await classStudentsService.setRoster(["c1", "c2", "c3"], ["s1", "s2"], "coord-1");

    // 3 classes × 2 students — a weekly class is one intent, not three rosters.
    expect(recorded.class_students.inserted).toHaveLength(6);
    expect(
      [...new Set(recorded.class_students.inserted.map((r) => r.class_schedule_id))].sort(),
    ).toEqual(["c1", "c2", "c3"]);
  });

  it("clears the previous roster before writing, so it replaces rather than adds", async () => {
    tableData.students = students;
    await classStudentsService.setRoster(["c1"], ["s1"], "coord-1");
    expect(recorded.class_students.deletedIn).toEqual(["c1"]);
  });

  it("denormalises name/roll/standard/batch from the DATABASE, not the caller", async () => {
    tableData.students = students;
    await classStudentsService.setRoster(["c1"], ["s1"], "coord-1");

    expect(recorded.class_students.inserted[0]).toMatchObject({
      class_schedule_id: "c1",
      student_id: "s1",
      student_name: "Aarav",
      roll_number: "01",
      standard_id: "std9",
      batch_id: "b1",
      assigned_by: "coord-1",
    });
  });

  it("an empty selection clears the roster instead of writing rows", async () => {
    tableData.students = students;
    await classStudentsService.setRoster(["c1"], [], "coord-1");
    expect(recorded.class_students.deletedIn).toEqual(["c1"]);
    expect(recorded.class_students.inserted).toHaveLength(0);
  });

  it("does nothing at all when there are no classes to assign to", async () => {
    await classStudentsService.setRoster([], ["s1"]);
    expect(recorded.class_students).toBeUndefined();
  });
});

describe("classStudentsService.candidates", () => {
  it("returns nothing until a standard is chosen (never the whole school)", async () => {
    tableData.students = [{ id: "s1", name: "Aarav" }];
    expect(await classStudentsService.candidates({ standardIds: [] })).toEqual([]);
  });

  it("labels each candidate with their standard and batch", async () => {
    tableData.students = [
      { id: "s1", name: "Aarav", roll_number: "01", standard_id: "std9", batch_id: "b1" },
    ];
    tableData.standards = [{ id: "std9", name: "Std 9" }];
    tableData.batches = [{ id: "b1", name: "Morning" }];

    const [c] = await classStudentsService.candidates({ standardIds: ["std9"] });
    expect(c).toEqual({
      studentId: "s1",
      studentName: "Aarav",
      rollNumber: "01",
      standardId: "std9",
      standardName: "Std 9",
      batchId: "b1",
      batchName: "Morning",
    });
  });

  it("narrows each standard by ITS OWN batch, not one batch for the class", async () => {
    // A teacher taking 2nd STD out of Batch A and 3rd STD out of Batch C in the
    // same period. A single `.eq("batch_id", …)` would filter one of the two
    // standards down to nobody, and the picker would report "no active
    // students" for a standard that is full of them.
    tableData.students = [
      { id: "s1", name: "Aarav", standard_id: "std2", batch_id: "bA" },
      { id: "s2", name: "Diya", standard_id: "std2", batch_id: "bB" },
      { id: "s3", name: "Kabir", standard_id: "std3", batch_id: "bC" },
    ];

    const rows = await classStudentsService.candidates({
      standardIds: ["std2", "std3"],
      batchByStandard: { std2: "bA", std3: "bC" },
    });
    expect(rows.map((r) => r.studentId)).toEqual(["s1", "s3"]);
  });

  it("keeps every student of a standard whose batch was left as 'all'", async () => {
    tableData.students = [
      { id: "s1", name: "Aarav", standard_id: "std2", batch_id: "bA" },
      { id: "s2", name: "Diya", standard_id: "std2", batch_id: "bB" },
      { id: "s3", name: "Kabir", standard_id: "std3", batch_id: "bC" },
    ];

    const rows = await classStudentsService.candidates({
      standardIds: ["std2", "std3"],
      batchByStandard: { std2: undefined, std3: "bC" },
    });
    expect(rows.map((r) => r.studentId)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("groupRowsByBatch", () => {
  const row = (id: string, batchId?: string): ClassRosterRow => ({
    studentId: id,
    studentName: id,
    status: "present",
    feeDue: false,
    batchId,
  });

  it("splits a cross-batch class so each student is filed under their OWN batch", () => {
    const groups = groupRowsByBatch([row("s1", "b1"), row("s2", "b2"), row("s3", "b1")]);
    expect([...groups.keys()].sort()).toEqual(["b1", "b2"]);
    expect(groups.get("b1")?.map((r) => r.studentId)).toEqual(["s1", "s3"]);
    expect(groups.get("b2")?.map((r) => r.studentId)).toEqual(["s2"]);
  });

  it("uses the class's batch only for students that have none of their own", () => {
    const groups = groupRowsByBatch([row("s1"), row("s2", "b2")], "class-batch");
    expect(groups.get("class-batch")?.map((r) => r.studentId)).toEqual(["s1"]);
    expect(groups.get("b2")?.map((r) => r.studentId)).toEqual(["s2"]);
  });

  it("drops a student with no batch anywhere rather than guessing one", () => {
    // Stamping a guessed batch onto the day row would put them in a register
    // they don't belong to — a wrong record is worse than a missing one.
    expect(groupRowsByBatch([row("s1")]).size).toBe(0);
  });
});
