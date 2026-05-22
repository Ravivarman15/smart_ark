// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for the Fee module forms. Validation lives here so every form
// (and any future API boundary) shares one definition of "valid".
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// ── Fee structure ────────────────────────────────────────────────────────────
export const feeStructureSchema = z.object({
  name: z.string().trim().min(2, "Structure name is required"),
  description: z.string().trim().optional(),
  courseTypeId: optionalId,
  standardId: optionalId,
  academicYearId: optionalId,
  taxId: optionalId,
  batchId: optionalId,
  feeType: z.enum(["one_time", "recurring", "transport", "material"]),
  totalAmount: z.coerce
    .number({ invalid_type_error: "Enter a base amount" })
    .positive("Base amount must be greater than 0"),
  seatConfirmationAmount: z.coerce.number().min(0).default(0),
  firstPaymentAmount: z.coerce.number().min(0).default(0),
  installmentCount: z.coerce.number().int().min(0).max(60).default(2),
  transportFee: z.coerce.number().min(0).default(0),
  materialFee: z.coerce.number().min(0).default(0),
  recurringInterval: z
    .enum(["monthly", "quarterly", "half_yearly", "yearly"])
    .optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
});
export type FeeStructureFormValues = z.infer<typeof feeStructureSchema>;

// ── Collect payment ──────────────────────────────────────────────────────────
export const collectPaymentSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Enter an amount" })
    .positive("Amount must be greater than 0"),
  method: z.string().min(1, "Select a payment method"),
  notes: z.string().trim().optional(),
});
export type CollectPaymentFormValues = z.infer<typeof collectPaymentSchema>;

// ── Apply discount ───────────────────────────────────────────────────────────
export const discountSchema = z.object({
  discountAmount: z.coerce
    .number({ invalid_type_error: "Enter a discount amount" })
    .min(0, "Discount cannot be negative"),
});
export type DiscountFormValues = z.infer<typeof discountSchema>;

// ── Issue refund ─────────────────────────────────────────────────────────────
export const refundSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Enter a refund amount" })
    .positive("Refund must be greater than 0"),
  reason: z.string().trim().min(3, "A reason is required"),
  method: z.string().min(1, "Select a refund method"),
});
export type RefundFormValues = z.infer<typeof refundSchema>;

// ── Edit student fee record ──────────────────────────────────────────────────
export const editStudentFeeSchema = z.object({
  totalAmount: z.coerce.number().positive("Total fee must be greater than 0"),
  seatConfirmationAmount: z.coerce.number().min(0).default(0),
  firstPaymentAmount: z.coerce.number().min(0).default(0),
  installmentCount: z.coerce.number().int().min(0).max(60).default(0),
  notes: z.string().trim().optional(),
});
export type EditStudentFeeFormValues = z.infer<typeof editStudentFeeSchema>;
