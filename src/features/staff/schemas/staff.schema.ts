import { z } from "zod";
import { ROLES } from "@/core/constants/roles";

// Phone regex: digits, spaces, +, -, parentheses. 7-15 digits when stripped.
// Deliberately permissive — true international validation lives in the auth
// provider; this is just a smell test for typos.
const phoneRegex = /^[+\d][\d\s\-()]{6,18}$/;

const optStr = () =>
  z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal("").transform(() => undefined));

// ── Create staff form ─────────────────────────────────────────────────────────
export const createStaffSchema = z.object({
  firstName: z.string().trim().min(1, "First name required").max(60),
  middleName: optStr(),
  lastName: z.string().trim().min(1, "Last name required").max(60),
  gender: z.enum(["male", "female", "other"], {
    required_error: "Gender required",
  }),
  mobile: z
    .string()
    .trim()
    .min(7, "Mobile number required")
    .regex(phoneRegex, "Enter a valid mobile number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  address: optStr(),
  profilePictureUrl: optStr(),
  role: z.enum(ROLES),
  department: optStr(),
  designation: optStr(),
  joiningDate: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD"),
  status: z.enum(["active", "invited", "suspended", "inactive"]).default("invited"),
  campus: optStr(),
  campusId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  subject: optStr(),
});
export type CreateStaffFormValues = z.infer<typeof createStaffSchema>;

// ── Update staff form (subset) ────────────────────────────────────────────────
export const updateStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  middleName: optStr(),
  lastName: z.string().trim().min(1).max(60).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  mobile: z.string().trim().regex(phoneRegex).optional().or(z.literal("").transform(() => undefined)),
  email: z.string().trim().toLowerCase().email().optional(),
  address: optStr(),
  profilePictureUrl: optStr(),
  department: optStr(),
  designation: optStr(),
  joiningDate: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD"),
  status: z.enum(["active", "invited", "suspended", "inactive"]).optional(),
  subject: optStr(),
  campusId: z.string().uuid().optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(120).optional(),
});
export type UpdateStaffFormValues = z.infer<typeof updateStaffSchema>;

// ── Check-in approval form (override time + comments) ─────────────────────────
export const approvalSchema = z.object({
  comments: z.string().max(500).optional(),
  /** Local date-time string (yyyy-mm-ddTHH:MM) — converted to ISO by the caller. */
  overrideTime: z.string().optional(),
});
export type ApprovalFormValues = z.infer<typeof approvalSchema>;

// ── Permission editor (PermissionMatrix submit shape) ─────────────────────────
export const permissionEditSchema = z.object({
  staffId: z.string().uuid(),
  modules: z.record(z.string(), z.boolean()),
  actions: z.record(z.string(), z.boolean()),
});
export type PermissionEditFormValues = z.infer<typeof permissionEditSchema>;
