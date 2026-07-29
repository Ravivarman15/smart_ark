import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// WHOSE STUDENTS DOES THE TEACHER SEE?
//
// The whole point of per-class assignment: the attendance sheet must show the
// students the coordinator put in the class — not everyone who happens to share
// a batch. And a class that predates the feature must keep working off its
// batch, or every historical class silently loses its roster.
// ════════════════════════════════════════════════════════════════════════════

const listAssigned = vi.fn();
const getDay = vi.fn();
const getDayForStudents = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gt: () => chain,
        order: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "class_schedules"
                ? { id: "c1", batch_id: scheduleBatchId, schedule_date: "2026-07-29" }
                : null,
            error: null,
          }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: [], error: null }),
      };
      return chain;
    },
  },
}));

vi.mock("@/features/attendance/services/studentAttendance.service", () => ({
  attendanceStudentService: {
    getDay: (...a: unknown[]) => getDay(...a),
    getDayForStudents: (...a: unknown[]) => getDayForStudents(...a),
  },
}));

vi.mock("./classStudents.service", () => ({
  classStudentsService: { listAssigned: (...a: unknown[]) => listAssigned(...a) },
}));

import { classAttendanceService } from "./classAttendance.service";

let scheduleBatchId: string | null = "batch-1";

beforeEach(() => {
  scheduleBatchId = "batch-1";
  listAssigned.mockReset().mockResolvedValue([]);
  getDay.mockReset().mockResolvedValue([]);
  getDayForStudents.mockReset().mockResolvedValue([]);
});

describe("classAttendanceService.roster", () => {
  it("uses the ASSIGNED students, not the batch, when a roster exists", async () => {
    listAssigned.mockResolvedValue([
      { studentId: "s1", studentName: "Aarav", batchId: "b1", standardId: "std9", standardName: "Std 9" },
      { studentId: "s2", studentName: "Diya", batchId: "b2", standardId: "std10", standardName: "Std 10" },
    ]);
    getDayForStudents.mockResolvedValue([
      { studentId: "s1", studentName: "Aarav", status: "present" },
      { studentId: "s2", studentName: "Diya", status: "absent" },
    ]);

    const res = await classAttendanceService.roster("c1");

    expect(getDay).not.toHaveBeenCalled();
    expect(getDayForStudents).toHaveBeenCalledWith(["s1", "s2"], "2026-07-29");
    expect(res.assigned).toBe(true);
    expect(res.rows.map((r) => r.studentId)).toEqual(["s1", "s2"]);
  });

  it("carries each assigned student's OWN batch and standard onto the row", async () => {
    listAssigned.mockResolvedValue([
      { studentId: "s2", studentName: "Diya", batchId: "b2", standardId: "std10", standardName: "Std 10" },
    ]);
    getDayForStudents.mockResolvedValue([
      { studentId: "s2", studentName: "Diya", status: "present" },
    ]);

    const [row] = (await classAttendanceService.roster("c1")).rows;
    // The submit groups the day-level save by this — the class's own batch-1
    // must not leak onto a student who isn't in it.
    expect(row.batchId).toBe("b2");
    expect(row.standardName).toBe("Std 10");
  });

  it("falls back to the batch roster for a class with no assignment", async () => {
    getDay.mockResolvedValue([{ studentId: "s9", studentName: "Old", status: "present" }]);

    const res = await classAttendanceService.roster("c1");

    expect(getDay).toHaveBeenCalledWith("batch-1", "2026-07-29");
    expect(res.assigned).toBe(false);
    expect(res.rows.map((r) => r.studentId)).toEqual(["s9"]);
    // Falling back means the class's batch is the batch for everyone.
    expect(res.rows[0].batchId).toBe("batch-1");
  });

  it("still loads a roster for a class with assigned students but NO batch", async () => {
    // A multi-standard class need not have a batch at all — requiring one used
    // to return an empty sheet.
    scheduleBatchId = null;
    listAssigned.mockResolvedValue([{ studentId: "s1", studentName: "Aarav", batchId: "b1" }]);
    getDayForStudents.mockResolvedValue([
      { studentId: "s1", studentName: "Aarav", status: "present" },
    ]);

    const res = await classAttendanceService.roster("c1");
    expect(res.rows).toHaveLength(1);
    expect(res.batchId).toBeUndefined();
  });

  it("returns nothing when the class has neither a roster nor a batch", async () => {
    scheduleBatchId = null;
    const res = await classAttendanceService.roster("c1");
    expect(res.rows).toEqual([]);
    expect(getDay).not.toHaveBeenCalled();
  });
});
