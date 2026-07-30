import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// PAYROLL PRE-GENERATION VALIDATION — the contract:
//   • flags teachers with completed classes that have NO class_attendance
//   • flags teachers with still-scheduled (unfinished) classes
//   • flags classes overlapping a leave request
//   • attributes substitute minutes to the substitute (teacher_id after swap)
//   • sorts most-flagged first; missing tables → empty
// We mock the three collaborators the service composes so the test asserts the
// pure aggregation, not I/O.
// ════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  hours: new Map<string, unknown>(),
  schedules: [] as Record<string, unknown>[],
  affected: [] as Record<string, unknown>[],
  attendanceScheduleIds: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: hoisted.attendanceScheduleIds.map((id) => ({ class_schedule_id: id })),
            error: null,
          }),
      }),
    }),
  },
}));

vi.mock("./teachingHours.service", () => ({
  teachingHoursService: { aggregate: vi.fn(async () => hoisted.hours) },
}));
vi.mock("./schedule.service", () => ({
  scheduleService: { list: vi.fn(async () => hoisted.schedules) },
}));
vi.mock("./leaveImpact.service", () => ({
  leaveImpactService: { affectedClasses: vi.fn(async () => hoisted.affected) },
}));

import { payrollValidationService } from "@/features/payroll/services/payrollValidation.service";

const th = (over: Record<string, unknown> = {}) => ({
  teacherId: "t1",
  teacherName: "Ravi",
  totalMinutes: 120,
  extraMinutes: 0,
  scheduledMinutes: 0,
  inProgressMinutes: 0,
  inProgressCount: 0,
  cancelledCount: 0,
  missedCount: 0,
  completedCount: 2,
  ...over,
});

describe("payrollValidationService.buildDiscrepancy", () => {
  beforeEach(() => {
    hoisted.hours = new Map();
    hoisted.schedules = [];
    hoisted.affected = [];
    hoisted.attendanceScheduleIds = [];
  });

  it("flags completed classes with no attendance", async () => {
    hoisted.hours = new Map([["t1", th()]]);
    hoisted.schedules = [
      { id: "c1", teacherId: "t1", status: "completed", durationMinutes: 60, attendanceSubmitted: false },
      { id: "c2", teacherId: "t1", status: "completed", durationMinutes: 60, attendanceSubmitted: false },
    ];
    hoisted.attendanceScheduleIds = ["c1"]; // c2 has no attendance
    const [row] = await payrollValidationService.buildDiscrepancy("2026-07-01", "2026-07-31");
    expect(row.missingAttendanceCount).toBe(1);
    expect(row.flags.some((f) => f.includes("missing attendance"))).toBe(true);
  });

  it("attributes substitute minutes to the substitute teacher", async () => {
    hoisted.hours = new Map([["sub1", th({ teacherId: "sub1", teacherName: "Anu", totalMinutes: 60, completedCount: 1 })]]);
    hoisted.schedules = [
      { id: "c1", teacherId: "sub1", originalTeacherId: "t1", status: "completed", durationMinutes: 60, attendanceSubmitted: true },
    ];
    hoisted.attendanceScheduleIds = ["c1"];
    const [row] = await payrollValidationService.buildDiscrepancy("2026-07-01", "2026-07-31");
    expect(row.teacherId).toBe("sub1");
    expect(row.substituteMinutes).toBe(60);
  });

  it("flags leave overlap and unfinished classes", async () => {
    hoisted.hours = new Map([["t1", th({ scheduledMinutes: 60 })]]);
    hoisted.schedules = [
      { id: "c1", teacherId: "t1", status: "scheduled", durationMinutes: 60 },
    ];
    hoisted.affected = [{ schedule: { id: "c1", teacherId: "t1" } }];
    const [row] = await payrollValidationService.buildDiscrepancy("2026-07-01", "2026-07-31");
    expect(row.flags.some((f) => f.includes("leave"))).toBe(true);
    expect(row.flags.some((f) => f.includes("unfinished"))).toBe(true);
  });

  // A class left running is not payable — completed minutes are. Running
  // payroll with one open silently underpays the teacher, so it must be a flag.
  it("flags classes that were started but never ended", async () => {
    hoisted.hours = new Map([["t1", th({ inProgressMinutes: 90, inProgressCount: 2 })]]);
    hoisted.schedules = [
      { id: "c1", teacherId: "t1", status: "in_progress", durationMinutes: 60 },
    ];
    const [row] = await payrollValidationService.buildDiscrepancy("2026-07-01", "2026-07-31");
    expect(row.flags.some((f) => f.includes("2 class(es) started but never ended"))).toBe(true);
  });

  it("returns [] when there is no activity", async () => {
    const rows = await payrollValidationService.buildDiscrepancy("2026-07-01", "2026-07-31");
    expect(rows).toEqual([]);
  });
});
