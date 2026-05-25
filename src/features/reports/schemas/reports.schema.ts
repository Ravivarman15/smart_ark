// Zod schemas for report-shell concerns (preset save/edit, filter
// normalisation). All analytic payloads come straight from feature services.

import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

export const reportFilterValuesSchema = z.object({
  from: optional,
  to: optional,
  branchId: optional,
  batchId: optional,
  standardId: optional,
  courseTypeId: optional,
  academicYearId: optional,
  staffId: optional,
  categoryId: optional,
  status: optional,
  paymentMethod: optional,
  vendorId: optional,
  studentId: optional,
  search: optional,
  extra: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const reportPresetSchema = z.object({
  reportKey: z.string().min(1),
  name: z.string().trim().min(2, "Preset name is required"),
  description: optional,
  filters: reportFilterValuesSchema,
  isShared: z.boolean().default(false),
});

export type ReportPresetFormValues = z.infer<typeof reportPresetSchema>;
