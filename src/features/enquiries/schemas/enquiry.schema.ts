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
