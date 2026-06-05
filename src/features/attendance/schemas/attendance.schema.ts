import { z } from "zod";

// ── Staff manual / correction entry ──────────────────────────────────────────
export const staffManualSchema = z
  .object({
    staffId: z.string().uuid({ message: "Select a staff member" }),
    date: z.string().min(1, "Date is required"),
    status: z.enum(["present", "absent", "half_day", "leave", "late"]),
    inTime: z.string().optional(),   // "HH:MM"
    outTime: z.string().optional(),  // "HH:MM"
    remarks: z.string().max(500).optional(),
  })
  .refine(
    (v) => !(v.inTime && v.outTime) || v.outTime >= v.inTime,
    { message: "Out time must be after in time", path: ["outTime"] },
  );

export type StaffManualForm = z.infer<typeof staffManualSchema>;

// ── Correction reason (student or staff) ─────────────────────────────────────
export const correctionSchema = z.object({
  reason: z.string().min(3, "Give a short reason for the correction").max(500),
});

export type CorrectionForm = z.infer<typeof correctionSchema>;

// ── Attendance settings ──────────────────────────────────────────────────────
export const attendanceSettingsSchema = z.object({
  instituteStartTime: z.string().min(1),
  instituteEndTime: z.string().min(1),
  lateThresholdMinutes: z.coerce.number().int().min(0).max(240),
  expectedDailyMinutes: z.coerce.number().int().min(0).max(1440),
  expectedWeeklyMinutes: z.coerce.number().int().min(0).max(10080),
  attendanceMinPct: z.coerce.number().min(0).max(100),
  autoNotifications: z.boolean(),
  correctionApprovalRequired: z.boolean(),
});

export type AttendanceSettingsForm = z.infer<typeof attendanceSettingsSchema>;
