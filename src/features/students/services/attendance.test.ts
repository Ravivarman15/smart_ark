import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// assertBatchAccess is the gate that decides whether a teacher may mark a
// batch's attendance. It failed in production the only way that matters: the
// teacher could open the sheet, mark everyone, and be refused on submit —
// because `batches.teacher_id` is a legacy field class scheduling never writes
// and `teacher_students` is empty on timetable-driven installs. Each route is
// pinned here so no future edit quietly removes one.
// ─────────────────────────────────────────────────────────────────────────────

type Result = { data: unknown[] | Record<string, unknown> | null; error: unknown };

/** What each table answers with, per test. Absent ⇒ "no rows". */
let responses: Record<string, Result> = {};
/** Filters PostgREST was asked for, per table — used to pin the query shape. */
let filters: Record<string, [string, string, string][]> = {};

const builder = (table: string) => {
  const empty: Result = { data: [], error: null };
  const res = () => responses[table] ?? empty;
  const chain = {
    select: () => chain,
    eq: (k: string, v: string) => {
      (filters[table] ??= []).push(["eq", k, v]);
      return chain;
    },
    neq: (k: string, v: string) => {
      (filters[table] ??= []).push(["neq", k, v]);
      return chain;
    },
    limit: () => Promise.resolve(res()),
    maybeSingle: () => Promise.resolve({ ...res(), data: (res().data as unknown[])?.[0] ?? null }),
  };
  return chain;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

import { attendanceService } from "./attendance.service";

const TEACHER = { profileId: "teacher-1", userId: "u1", name: "Archana", role: "teacher" };
const BATCH = "batch-9a";

const attempt = () => attendanceService.assertBatchAccess(BATCH, TEACHER as never);

beforeEach(() => {
  responses = {};
  filters = {};
});

describe("assertBatchAccess", () => {
  it("allows management roles without touching the database", async () => {
    for (const role of ["admin", "management", "coordinator"]) {
      await expect(
        attendanceService.assertBatchAccess(BATCH, { ...TEACHER, role } as never),
      ).resolves.toBeUndefined();
    }
    expect(filters).toEqual({});
  });

  it("allows the batch's own teacher", async () => {
    responses.batches = { data: [{ id: BATCH, teacher_id: "teacher-1" }], error: null };
    await expect(attempt()).resolves.toBeUndefined();
  });

  it("allows a teacher linked through the teacher_students junction", async () => {
    responses.teacher_students = { data: [{ teacher_id: "teacher-1" }], error: null };
    await expect(attempt()).resolves.toBeUndefined();
  });

  // The route that was missing. Scheduling a class for a batch is how work is
  // handed out here; batches.teacher_id stays null forever.
  it("allows a teacher who has a scheduled class for the batch", async () => {
    responses.class_schedules = { data: [{ id: "class-1" }], error: null };
    await expect(attempt()).resolves.toBeUndefined();
    expect(filters.class_schedules).toEqual([
      ["eq", "batch_id", BATCH],
      ["eq", "teacher_id", "teacher-1"],
      ["neq", "status", "cancelled"],
    ]);
  });

  // Cancelling the class has to take the access with it, otherwise "remove the
  // teacher from the class" would never actually remove anything.
  it("does not count a cancelled class", async () => {
    // The `neq` filter is what excludes it, so an empty result stands in for
    // "the only class is cancelled".
    responses.class_schedules = { data: [], error: null };
    await expect(attempt()).rejects.toThrow(/not assigned to this batch/i);
  });

  // A multi-standard class draws students from batches other than its own, so
  // the roster grants access to each of those batches too.
  it("allows a teacher whose class contains students of this batch", async () => {
    responses.class_students = { data: [{ id: "cs-1" }], error: null };
    await expect(attempt()).resolves.toBeUndefined();
  });

  it("denies a teacher with none of the four links", async () => {
    responses.batches = { data: [{ id: BATCH, teacher_id: "someone-else" }], error: null };
    await expect(attempt()).rejects.toThrow(/not assigned to this batch/i);
  });

  it("denies a marker with no identity", async () => {
    await expect(
      attendanceService.assertBatchAccess(BATCH, { ...TEACHER, profileId: "" } as never),
    ).rejects.toThrow(/identity/i);
  });
});
