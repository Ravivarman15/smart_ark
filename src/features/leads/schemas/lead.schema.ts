import { z } from "zod";

export const LEAD_SOURCES = ["meta_ads", "landing", "walk_in", "call", "referral", "manual"] as const;
export const LEAD_PRIORITIES = ["high", "medium", "low"] as const;

const phoneRe = /^[0-9+\-\s()]{7,20}$/;

export const createLeadSchema = z.object({
  studentName: z.string().min(2, "Student name is required"),
  parentName: z.string().optional(),
  phone: z.string().regex(phoneRe, "Enter a valid phone number").optional().or(z.literal("")),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES).optional(),
  course: z.string().optional(),
  standard: z.string().optional(),
  campus: z.string().optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  estimatedValue: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});
export type CreateLeadFormValues = z.infer<typeof createLeadSchema>;

export const publicLeadSchema = z.object({
  studentName: z.string().min(2, "Please enter the student's name"),
  parentName: z.string().optional(),
  phone: z.string().regex(phoneRe, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  course: z.string().optional(),
  standard: z.string().optional(),
  campus: z.string().optional(),
  message: z.string().optional(),
});
export type PublicLeadFormValues = z.infer<typeof publicLeadSchema>;

export const scheduleDemoSchema = z.object({
  facultyId: z.string().optional(),
  scheduledAt: z.string().min(1, "Pick a date & time"),
  batch: z.string().optional(),
  subject: z.string().optional(),
  mode: z.enum(["offline", "online"]).optional(),
});
export type ScheduleDemoFormValues = z.infer<typeof scheduleDemoSchema>;

export const convertAdmissionSchema = z.object({
  feeAmount: z.coerce.number().min(0).optional(),
  scholarshipAmount: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(["pending", "partial", "paid"]).optional(),
  batch: z.string().optional(),
  campus: z.string().optional(),
  course: z.string().optional(),
});
export type ConvertAdmissionFormValues = z.infer<typeof convertAdmissionSchema>;

export const counselorMappingSchema = z.object({
  counselorId: z.string().min(1, "Select a counselor"),
  course: z.string().optional(),
  standard: z.string().optional(),
  campus: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type CounselorMappingFormValues = z.infer<typeof counselorMappingSchema>;
