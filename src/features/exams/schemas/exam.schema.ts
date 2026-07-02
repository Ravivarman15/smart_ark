// Zod schemas for the Exam module forms.
import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const examFormSchema = z
  .object({
    title: z.string().trim().min(3, "Exam title is required"),
    examType: z.enum([
      "unit_test",
      "midterm",
      "final",
      "practical",
      "assignment",
      "weekly_test",
      "monthly_test",
      "mock_test",
      "neet_test",
      "jee_test",
      "revision_test",
      "other",
    ]),
    academicYearId: optionalId,
    term: z
      .enum(["term_1", "term_2", "term_3"])
      .optional()
      .or(z.literal("").transform(() => undefined)),
    month: z
      .enum([
        "april", "may", "june", "july", "august", "september",
        "october", "november", "december", "january", "february", "march",
      ])
      .optional()
      .or(z.literal("").transform(() => undefined)),
    standardId: optionalId,
    batchId: optionalId,
    subjectId: optionalId,
    facultyId: optionalId,
    totalMarks: z.coerce
      .number({ invalid_type_error: "Enter total marks" })
      .positive("Total marks must be greater than 0"),
    passMarks: z.coerce
      .number({ invalid_type_error: "Enter pass marks" })
      .min(0, "Pass marks cannot be negative"),
    durationMinutes: z.coerce.number().int().min(1).max(600).default(60),
    instructions: z.string().trim().optional(),
    examDate: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    hall: z.string().trim().optional(),
  })
  .refine((v) => v.passMarks <= v.totalMarks, {
    message: "Pass marks cannot exceed total marks",
    path: ["passMarks"],
  });
export type ExamFormValues = z.infer<typeof examFormSchema>;

export const rescheduleSchema = z.object({
  examDate: z.string().min(1, "Pick a date"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  hall: z.string().trim().optional(),
});
export type RescheduleFormValues = z.infer<typeof rescheduleSchema>;
