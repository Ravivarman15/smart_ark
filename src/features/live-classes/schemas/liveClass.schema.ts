import { z } from "zod";

export const ASSIGN_TYPES = ["batch", "multiple_batches", "standard"] as const;
export const PLATFORMS = ["google_meet", "zoom", "ms_teams", "other"] as const;
export const REPEAT_RULES = ["none", "daily", "weekly", "monthly"] as const;

const materialSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url("Enter a valid URL"),
});

// ── Add / edit live class ─────────────────────────────────────────────────────
export const liveClassSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    teacherId: z.string().uuid("Select a teacher"),
    subjectId: z.string().uuid("Select a subject").optional().or(z.literal("")),
    standardId: z.string().uuid("Select a standard"),
    campusId: z.string().uuid().optional().or(z.literal("")),
    assignType: z.enum(ASSIGN_TYPES).default("batch"),
    batchIds: z.array(z.string().uuid()).default([]),
    startDate: z.string().min(8, "Start date is required"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid start time"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid end time"),
    platform: z.enum(PLATFORMS).default("google_meet"),
    meetingLink: z.string().trim().url("Enter a valid meeting link").optional().or(z.literal("")),
    meetingPassword: z.string().trim().max(80).optional().or(z.literal("")),
    repeatRule: z.enum(REPEAT_RULES).default("none"),
    repeatUntil: z.string().optional().or(z.literal("")),
    materials: z.array(materialSchema).default([]),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((v) => v.assignType === "standard" || v.batchIds.length > 0, {
    message: "Select at least one batch",
    path: ["batchIds"],
  });
export type LiveClassFormValues = z.infer<typeof liveClassSchema>;

// ── Reschedule ────────────────────────────────────────────────────────────────
export const rescheduleSchema = z
  .object({
    startDate: z.string().min(8, "Date is required"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time"),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });
export type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

// ── Complete a class (recording + notes) ──────────────────────────────────────
export const completeClassSchema = z.object({
  recordingUrl: z.string().trim().url("Enter a valid recording URL").optional().or(z.literal("")),
  classNotes: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type CompleteClassFormValues = z.infer<typeof completeClassSchema>;
