// Zod schemas for the Finance forms. Pure validation — no business logic
// here (that lives in `utils/financeCalc.ts`). Pre-loaded option lists for
// payment methods / frequencies / periods come from the type module.

import { z } from "zod";

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// ── Category ─────────────────────────────────────────────────────────────────
export const financeCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required"),
  kind: z.enum(["expense", "income"]),
  parentId: optionalId,
  description: optionalText,
  color: optionalText,
  icon: optionalText,
  isActive: z.boolean().default(true),
  isRecurring: z.boolean().default(false),
  taxId: optionalId,
  monthlyBudget: z
    .union([z.coerce.number().min(0), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  sortOrder: z.coerce.number().int().default(0),
  scope: z.enum(["internal", "external", "fee"]).default("internal"),
});

export type FinanceCategoryFormValues = z.infer<typeof financeCategorySchema>;

// ── Transaction (covers expense + income) ────────────────────────────────────
export const financeTransactionSchema = z
  .object({
    type: z.enum(["expense", "income"]),
    title: optionalText,
    category: z.string().trim().min(1, "Category is required"),
    categoryId: optionalId,
    amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
    taxId: optionalId,
    paymentMethod: optionalText,
    branchId: optionalId,
    branchName: optionalText,
    department: optionalText,
    vendorId: optionalId,
    vendorName: optionalText,
    invoiceNumber: optionalText,
    status: z
      .enum(["draft", "pending", "approved", "rejected", "paid", "cancelled"])
      .default("pending"),
    date: optionalText,
    dueDate: optionalText,
    isRecurring: z.boolean().default(false),
    recurringId: optionalId,
    description: optionalText,
    notes: optionalText,
    attachmentUrl: optionalText,
    source: optionalText,
    linkedStudentId: optionalId,
    linkedStudentFeeId: optionalId,
    transactionReference: optionalText,
  })
  .refine(
    (v) => !v.dueDate || !v.date || new Date(v.dueDate) >= new Date(v.date),
    {
      message: "Due date must be on or after the transaction date",
      path: ["dueDate"],
    },
  );

export type FinanceTransactionFormValues = z.infer<
  typeof financeTransactionSchema
>;

// ── Vendor ───────────────────────────────────────────────────────────────────
export const vendorSchema = z.object({
  name: z.string().trim().min(2, "Vendor name is required"),
  contactPerson: optionalText,
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /\S+@\S+\.\S+/.test(v), {
      message: "Invalid email",
    })
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  phone: optionalText,
  gstNumber: optionalText,
  address: optionalText,
  paymentTerms: optionalText,
  notes: optionalText,
  isActive: z.boolean().default(true),
});

export type VendorFormValues = z.infer<typeof vendorSchema>;

// ── Budget ───────────────────────────────────────────────────────────────────
export const financeBudgetSchema = z.object({
  categoryId: z.string().min(1, "Pick a category"),
  period: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  periodStart: z.string().min(1, "Pick a period start date"),
  amount: z.coerce.number().min(0.01, "Budget amount is required"),
  alertThreshold: z.coerce.number().int().min(0).max(100).default(80),
  branchId: optionalId,
  notes: optionalText,
});

export type FinanceBudgetFormValues = z.infer<typeof financeBudgetSchema>;

// ── Recurring ────────────────────────────────────────────────────────────────
export const recurringTransactionSchema = z
  .object({
    type: z.enum(["expense", "income"]).default("expense"),
    title: z.string().trim().min(2, "Title is required"),
    categoryId: optionalId,
    amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
    frequency: z
      .enum(["weekly", "monthly", "quarterly", "yearly"])
      .default("monthly"),
    nextRunDate: z.string().min(1, "Pick a next-run date"),
    endDate: optionalText,
    isActive: z.boolean().default(true),
    paymentMethod: optionalText,
    vendorId: optionalId,
    branchId: optionalId,
    department: optionalText,
    notes: optionalText,
  })
  .refine(
    (v) => !v.endDate || new Date(v.endDate) >= new Date(v.nextRunDate),
    { message: "End date must be on or after next run", path: ["endDate"] },
  );

export type RecurringTransactionFormValues = z.infer<
  typeof recurringTransactionSchema
>;
