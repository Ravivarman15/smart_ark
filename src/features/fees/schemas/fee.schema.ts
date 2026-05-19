import { z } from "zod";

// ── Fee structure form ────────────────────────────────────────────────────────
export const feeStructureSchema = z
  .object({
    name: z.string().min(2, "Name required").max(120),
    courseTypeId: z.string().uuid("Select a course type"),
    standardId: z.string().uuid("Select a standard"),
    academicYearId: z.string().uuid("Select an academic year"),
    taxId: z.string().uuid().optional().or(z.literal("")),
    totalAmount: z.coerce.number().nonnegative("Must be ≥ 0"),
    seatConfirmationAmount: z.coerce.number().nonnegative().default(0),
    firstPaymentAmount: z.coerce.number().nonnegative().default(0),
    installmentCount: z.coerce.number().int().min(0).max(36).default(2),
  })
  .refine(
    (v) => v.seatConfirmationAmount + v.firstPaymentAmount <= v.totalAmount,
    {
      message: "Seat + first payment cannot exceed total",
      path: ["firstPaymentAmount"],
    }
  );
export type FeeStructureFormValues = z.infer<typeof feeStructureSchema>;

// ── Manual fee record (rare; most rows come from admissions flow) ─────────────
export const feeRecordSchema = z.object({
  student: z.string().min(1, "Student required"),
  batch: z.string().min(1, "Batch required"),
  amount: z.coerce.number().nonnegative(),
  dueSince: z.string().optional(),
  campus: z.string().optional(),
});
export type FeeRecordFormValues = z.infer<typeof feeRecordSchema>;

// ── Installment (money in) ────────────────────────────────────────────────────
export const installmentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.string().min(1, "Payment method required"),
  notes: z.string().optional(),
});
export type InstallmentFormValues = z.infer<typeof installmentSchema>;

// ── Refund (money out) ────────────────────────────────────────────────────────
export const refundSchema = z.object({
  amount: z.coerce.number().positive("Refund amount must be greater than 0"),
  reason: z.string().min(3, "Provide a short reason").max(500),
});
export type RefundFormValues = z.infer<typeof refundSchema>;

// ── Discount ──────────────────────────────────────────────────────────────────
export const discountSchema = z.object({
  discount: z.coerce.number().nonnegative("Discount cannot be negative"),
});
export type DiscountFormValues = z.infer<typeof discountSchema>;
