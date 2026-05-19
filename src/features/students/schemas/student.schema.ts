import { z } from "zod";

// Validation schema for the create/edit student form.
// Keep this aligned with the DB constraints + the service mapper.
// Frontend validation is UX only; RLS + DB constraints are authoritative.

export const studentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  batch: z.string().min(1, "Batch is required"),
  spi: z.coerce.number().min(0).max(100).default(0),
  risk: z.enum(["safe", "watch", "critical"]).default("safe"),
  campus: z.string().optional(),
  subject: z.string().optional(),
  parentName: z.string().optional(),
  parentContact: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[0-9+\-\s()]{7,20}$/.test(v),
      "Enter a valid phone number"
    ),
  parentContact1: z.string().optional(),
  parentContact2: z.string().optional(),
  parentEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  dateOfJoining: z.string().optional(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
