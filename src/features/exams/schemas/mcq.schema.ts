// Zod schemas for the MCQ Paper module forms.
//
// These cover the *scalar* fields of each form. Dynamic structures — a
// question's answer options / numerical key, a paper's question list — are
// managed as component state and validated through the centralised scoring
// layer (`answerKeyError`, `paperTotalMarks`), never duplicated here.
import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// ── Question editor ──────────────────────────────────────────────────────────
export const questionFormSchema = z.object({
  questionText: z.string().trim().min(5, "Question text is required"),
  questionType: z.enum([
    "single",
    "multiple",
    "true_false",
    "assertion_reason",
    "numerical",
  ]),
  subjectId: optionalId,
  chapter: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  marks: z.coerce
    .number({ invalid_type_error: "Enter marks" })
    .positive("Marks must be greater than 0"),
  negativeMarks: z.coerce
    .number({ invalid_type_error: "Enter negative marks" })
    .min(0, "Negative marks cannot be negative")
    .default(0),
  explanation: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  hasFormula: z.boolean().default(false),
});
export type QuestionFormValues = z.infer<typeof questionFormSchema>;

// ── Paper builder — paper meta ───────────────────────────────────────────────
export const paperFormSchema = z.object({
  title: z.string().trim().min(3, "Paper title is required"),
  subjectId: optionalId,
  standardId: optionalId,
  description: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600).default(60),
  negativeMarking: z.boolean().default(false),
  setCount: z.coerce.number().int().min(1).max(10).default(1),
  randomize: z.boolean().default(false),
});
export type PaperFormValues = z.infer<typeof paperFormSchema>;

// ── Automatic paper generation ───────────────────────────────────────────────
export const generationRulesSchema = z
  .object({
    totalQuestions: z.coerce.number().int().min(1).max(200),
    easyPct: z.coerce.number().min(0).max(100).default(30),
    mediumPct: z.coerce.number().min(0).max(100).default(50),
    hardPct: z.coerce.number().min(0).max(100).default(20),
    marksPerQuestion: z.coerce.number().positive().default(1),
    subjectId: optionalId,
  })
  .refine((v) => v.easyPct + v.mediumPct + v.hardPct === 100, {
    message: "Difficulty split must add up to 100%",
    path: ["mediumPct"],
  });
export type GenerationRulesValues = z.infer<typeof generationRulesSchema>;
