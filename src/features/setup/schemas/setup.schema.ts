import { z } from "zod";

// ── Academic year ────────────────────────────────────────────────────────────
export const academicYearSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must come after start date",
  });
export type AcademicYearValues = z.infer<typeof academicYearSchema>;

// ── Standard ────────────────────────────────────────────────────────────────
export const standardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type StandardValues = z.infer<typeof standardSchema>;

// ── Subject ─────────────────────────────────────────────────────────────────
export const subjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  standardId: z.string().uuid().optional().nullable().or(z.literal("")),
  isOptional: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type SubjectValues = z.infer<typeof subjectSchema>;

// ── Course type ─────────────────────────────────────────────────────────────
export const courseTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CourseTypeValues = z.infer<typeof courseTypeSchema>;

// ── Tax ─────────────────────────────────────────────────────────────────────
export const taxSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    taxType: z.enum(["percentage", "fixed"]),
    percentage: z.number().min(0).max(100).optional(),
    amount: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => (v.taxType === "percentage" ? typeof v.percentage === "number" : true), {
    path: ["percentage"],
    message: "Percentage required for percentage tax",
  })
  .refine((v) => (v.taxType === "fixed" ? typeof v.amount === "number" : true), {
    path: ["amount"],
    message: "Amount required for fixed tax",
  });
export type TaxValues = z.infer<typeof taxSchema>;

// ── Batch ───────────────────────────────────────────────────────────────────
export const batchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  campusId: z.string().uuid().optional().or(z.literal("")),
  standardId: z.string().uuid().optional().or(z.literal("")),
  courseTypeId: z.string().uuid().optional().or(z.literal("")),
  coordinatorId: z.string().uuid().optional().or(z.literal("")),
  timingStart: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional().or(z.literal("")),
  timingEnd: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional().or(z.literal("")),
  capacity: z.number().int().min(0).max(5000).optional(),
  room: z.string().trim().max(80).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  academicYearId: z.string().uuid().optional().or(z.literal("")),
});
export type BatchValues = z.infer<typeof batchSchema>;

// ── Timetable period ────────────────────────────────────────────────────────
export const timetablePeriodSchema = z.object({
  batchId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  periodNo: z.number().int().min(1).max(12),
  subjectId: z.string().uuid().nullable().optional(),
  teacherProfileId: z.string().uuid().nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  room: z.string().max(80).nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});
export type TimetablePeriodValues = z.infer<typeof timetablePeriodSchema>;
