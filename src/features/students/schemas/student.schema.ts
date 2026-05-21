import { z } from "zod";

// Frontend validation only — RLS + DB constraints remain authoritative.

const phone = z
  .string()
  .trim()
  .refine((v) => !v || /^[0-9+\-\s()]{7,20}$/.test(v), "Enter a valid phone number");
const optionalEmail = z
  .string()
  .trim()
  .email("Invalid email")
  .optional()
  .or(z.literal(""));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .optional()
  .or(z.literal(""));

// ── Student registration (create + edit) ─────────────────────────────────────
export const registrationSchema = z.object({
  // personal
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  rollNumber: z.string().trim().max(40).optional().or(z.literal("")),
  gender: z.string().optional().or(z.literal("")),
  bloodGroup: z.string().optional().or(z.literal("")),
  dateOfBirth: isoDate,
  dateOfJoining: isoDate,
  address: z.string().trim().max(400).optional().or(z.literal("")),
  studentEmail: optionalEmail,
  studentContact: phone.optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),

  // academic placement (ids)
  standardId: z.string().uuid().optional().or(z.literal("")),
  batchId: z.string().uuid().optional().or(z.literal("")),
  courseTypeId: z.string().uuid().optional().or(z.literal("")),
  academicYearId: z.string().uuid().optional().or(z.literal("")),

  // parent
  parentName: z.string().trim().max(120).optional().or(z.literal("")),
  parentContact: phone.optional().or(z.literal("")),
  parentContact2: phone.optional().or(z.literal("")),
  parentEmail: optionalEmail,

  // guardian
  guardianName: z.string().trim().max(120).optional().or(z.literal("")),
  guardianRelation: z.string().trim().max(60).optional().or(z.literal("")),
  guardianContact: phone.optional().or(z.literal("")),

  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type RegistrationValues = z.infer<typeof registrationSchema>;

// ── Back-compat: lenient student schema kept for existing imports ────────────
export const studentSchema = registrationSchema;
export type StudentFormValues = RegistrationValues;

// ── Leave request ────────────────────────────────────────────────────────────
export const leaveRequestSchema = z
  .object({
    studentId: z.string().uuid("Select a student"),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    leaveType: z.string().min(1, "Select a leave type"),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    path: ["toDate"],
    message: "End date must be on or after the start date",
  });
export type LeaveRequestValues = z.infer<typeof leaveRequestSchema>;

// ── Feedback ─────────────────────────────────────────────────────────────────
export const feedbackSchema = z.object({
  studentId: z.string().uuid("Select a student"),
  category: z.string().min(1, "Select a category"),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(3, "Feedback message is required").max(1000),
});
export type FeedbackValues = z.infer<typeof feedbackSchema>;

// ── Year transfer ────────────────────────────────────────────────────────────
export const transferSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Select at least one student"),
  toAcademicYearId: z.string().uuid("Select the target academic year"),
  toStandardId: z.string().uuid().optional().or(z.literal("")),
  toBatchId: z.string().uuid().optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});
export type TransferValues = z.infer<typeof transferSchema>;

// ── Document metadata ────────────────────────────────────────────────────────
export const documentMetaSchema = z.object({
  studentId: z.string().uuid("Select a student"),
  category: z.string().min(1, "Select a category"),
  title: z.string().trim().min(2, "Title is required").max(160),
});
export type DocumentMetaValues = z.infer<typeof documentMetaSchema>;
