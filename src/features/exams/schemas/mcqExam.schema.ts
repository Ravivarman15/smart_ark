// Zod schema for the Create / Edit MCQ Exam form.
//
// Covers the scalar fields only. Student assignments are a dynamic list managed
// as component state; the exam window / result-release timing are validated
// here with a cross-field refine.
import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const mcqExamFormSchema = z
  .object({
    title: z.string().trim().min(3, "Exam title is required"),
    paperId: z.string().min(1, "Select an MCQ paper"),
    standardId: optionalId,
    batchId: optionalId,
    subjectId: optionalId,
    examDate: z.string().optional(),
    instructions: z.string().trim().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(600).default(60),
    attemptLimit: z.coerce.number().int().min(1).max(10).default(1),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    negativeMarking: z.boolean().default(false),
    passPercentage: z.coerce.number().min(0).max(100).default(35),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    resultRelease: z
      .enum(["immediate", "manual", "scheduled"])
      .default("immediate"),
    resultReleaseAt: z.string().optional(),
    allowResume: z.boolean().default(true),
  })
  .refine(
    (v) =>
      !v.windowStart ||
      !v.windowEnd ||
      new Date(v.windowEnd) > new Date(v.windowStart),
    { message: "Exam window must end after it starts", path: ["windowEnd"] },
  )
  .refine(
    (v) => v.resultRelease !== "scheduled" || !!v.resultReleaseAt,
    {
      message: "Pick a result-release time",
      path: ["resultReleaseAt"],
    },
  );

export type McqExamFormValues = z.infer<typeof mcqExamFormSchema>;
