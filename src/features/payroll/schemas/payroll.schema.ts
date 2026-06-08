import { z } from "zod";

// Zod validation for the Payroll forms. Mirrors the input shapes in
// types/payroll.types.ts. Money fields are coerced numbers; blanks → 0.

const money = z.coerce.number().min(0, "Must be ≥ 0").default(0);

export const roleRateSchema = z.object({
  role: z.string().min(1, "Role is required"),
  label: z.string().optional(),
  hourlyRate: z.coerce.number().min(0, "Hourly rate must be ≥ 0"),
  monthlySalary: money.optional(),
  effectiveFrom: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});
export type RoleRateForm = z.infer<typeof roleRateSchema>;

export const staffRateSchema = z.object({
  staffId: z.string().min(1, "Staff member is required"),
  hourlyRate: z.coerce.number().min(0).optional(),
  monthlySalary: z.coerce.number().min(0).optional(),
  basicSalary: z.coerce.number().min(0).optional(),
  effectiveFrom: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});
export type StaffRateForm = z.infer<typeof staffRateSchema>;

export const shiftSchema = z.object({
  scope: z.enum(["role", "staff", "department"]),
  scopeRef: z.string().min(1, "Target is required"),
  scopeLabel: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  expectedDailyMinutes: z.coerce.number().int().min(0).default(480),
  expectedWeeklyMinutes: z.coerce.number().int().min(0).default(2400),
  expectedMonthlyMinutes: z.coerce.number().int().min(0).default(10560),
  workingDays: z.coerce.number().int().min(0).max(31).default(22),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});
export type ShiftForm = z.infer<typeof shiftSchema>;

export const ruleSchema = z.object({
  ruleType: z.enum(["overtime", "incentive", "allowance", "deduction", "penalty"]),
  name: z.string().min(1, "Name is required"),
  calcMethod: z.enum(["flat", "percent", "per_hour", "multiplier", "per_day"]),
  value: z.coerce.number().min(0, "Value must be ≥ 0"),
  appliesTo: z.enum(["all", "role", "staff", "department"]).default("all"),
  appliesRef: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  notes: z.string().optional(),
});
export type RuleForm = z.infer<typeof ruleSchema>;

export const generatePayrollSchema = z.object({
  title: z.string().min(1, "Title is required"),
  periodType: z.enum(["weekly", "biweekly", "monthly", "custom"]).default("monthly"),
  periodStart: z.string().min(1, "Start date is required"),
  periodEnd: z.string().min(1, "End date is required"),
  role: z.string().optional(),
  notes: z.string().optional(),
});
export type GeneratePayrollForm = z.infer<typeof generatePayrollSchema>;

export const settingsSchema = z.object({
  overtimeMultiplier: z.coerce.number().min(1).max(5).default(1.5),
  payDay: z.coerce.number().int().min(1).max(28).default(1),
  defaultPeriod: z.enum(["weekly", "biweekly", "monthly", "custom"]).default("monthly"),
  autoFinanceSync: z.boolean().default(true),
  autoNotify: z.boolean().default(true),
  salaryCategoryName: z.string().min(1).default("Salary"),
});
export type SettingsForm = z.infer<typeof settingsSchema>;
