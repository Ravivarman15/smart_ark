import { z } from "zod";

export const ENQUIRY_STATUSES = ["interested", "follow-up", "converted", "not-interested"] as const;
export const ENQUIRY_PRIORITIES = ["high", "medium", "low"] as const;
export const ENQUIRY_SOURCES = ["call", "walk-in"] as const;

// ── Create enquiry form ───────────────────────────────────────────────────────
export const createEnquirySchema = z.object({
  name: z.string().min(2, "Name required").max(120),
  phone: z
    .string()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Phone may contain digits, +, -, () and spaces"),
  date: z.string().min(8, "Date required"),
  status: z.enum(ENQUIRY_STATUSES).default("interested"),
  notes: z.string().max(2000).default(""),
  type: z.enum(ENQUIRY_SOURCES).default("call"),
  priority: z.enum(ENQUIRY_PRIORITIES).default("medium"),
  interestedStandard: z.string().optional(),
  interestedCourse: z.string().optional(),
  campus: z.string().optional(),
});
export type CreateEnquiryFormValues = z.infer<typeof createEnquirySchema>;

// ── Public admission form (/admissions/apply) ─────────────────────────────────
// Submitted by prospects themselves — kept lenient: only name + phone are
// required so a lead is never lost to over-strict validation.
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const publicEnquirySchema = z.object({
  studentName: z.string().trim().min(2, "Please enter the student's name").max(120),
  parentName: optionalText(120),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Phone may contain digits, +, -, () and spaces"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(160)
    .optional()
    .or(z.literal("")),
  interestedStandard: optionalText(80),
  interestedCourse: optionalText(120),
  message: optionalText(1000),
});
export type PublicEnquiryFormValues = z.infer<typeof publicEnquirySchema>;

// ── Followup / note ───────────────────────────────────────────────────────────
export const followupSchema = z.object({
  note: z.string().min(2, "Add at least 2 characters").max(2000),
  newStatus: z.enum(ENQUIRY_STATUSES).optional(),
  followUpDate: z.string().optional(),
});
export type FollowupFormValues = z.infer<typeof followupSchema>;

// ── Lead assignment ───────────────────────────────────────────────────────────
export const leadAssignmentSchema = z.object({
  staffId: z.string().uuid("Choose a staff member"),
});
export type LeadAssignmentFormValues = z.infer<typeof leadAssignmentSchema>;

// ── Conversion (approve admission) ────────────────────────────────────────────
export const conversionSchema = z.object({
  studentName: z.string().min(2).optional(),
  batch: z.string().optional(),
  campus: z.string().optional(),
  initialFeeAmount: z.coerce.number().nonnegative().optional(),
  initialFeeDueSince: z.string().optional(),
});
export type ConversionFormValues = z.infer<typeof conversionSchema>;
