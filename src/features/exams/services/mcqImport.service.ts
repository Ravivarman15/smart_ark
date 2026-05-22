import { BaseService, AppError } from "@/shared/services";
import { answerKeyError, normalizeQuestionText } from "../utils/mcqScoring";
import type { QuestionOwner } from "./mcqQuestion.service";
import type {
  BulkImportReport,
  BulkImportRow,
  McqDifficulty,
  McqOption,
  McqQuestionInput,
  McqQuestionType,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ bulk-import service — CSV question import with a validation report.
//
// Two stages, so the user reviews before anything is written:
//   analyze(csv)  → BulkImportReport (every row validated, duplicates flagged
//                   against the file itself AND the existing bank)
//   commit(rows)  → inserts only the valid, non-duplicate rows
//
// Excel users export their sheet as CSV (.csv) — the parser handles quoted
// fields, embedded commas and escaped quotes. No third-party dependency.
//
// Expected header (order-independent, case-insensitive):
//   question_text, question_type, subject, chapter, topic, difficulty,
//   marks, negative_marks, option_a..option_e, correct, tolerance, explanation
// `correct`: option letter(s) for choice types ("A" or "A,C"); the numeric
// answer for numerical questions.
// ─────────────────────────────────────────────────────────────────────────────

/** Parse CSV text into a matrix of cells. Handles "" escapes + embedded commas. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
};

const HEADER_ALIASES: Record<string, string> = {
  question: "question_text",
  question_text: "question_text",
  text: "question_text",
  type: "question_type",
  question_type: "question_type",
  subject: "subject",
  chapter: "chapter",
  topic: "topic",
  difficulty: "difficulty",
  marks: "marks",
  mark: "marks",
  negative_marks: "negative_marks",
  negative: "negative_marks",
  option_a: "option_a",
  option_b: "option_b",
  option_c: "option_c",
  option_d: "option_d",
  option_e: "option_e",
  a: "option_a",
  b: "option_b",
  c: "option_c",
  d: "option_d",
  e: "option_e",
  correct: "correct",
  answer: "correct",
  correct_answer: "correct",
  tolerance: "tolerance",
  explanation: "explanation",
};

const TYPE_ALIASES: Record<string, McqQuestionType> = {
  single: "single",
  single_correct: "single",
  scq: "single",
  mcq: "single",
  multiple: "multiple",
  multiple_correct: "multiple",
  msq: "multiple",
  true_false: "true_false",
  truefalse: "true_false",
  tf: "true_false",
  boolean: "true_false",
  assertion_reason: "assertion_reason",
  assertion: "assertion_reason",
  ar: "assertion_reason",
  numerical: "numerical",
  numeric: "numerical",
  integer: "numerical",
};

const LETTER_TO_OPTION: Record<string, string> = {
  a: "option_a",
  b: "option_b",
  c: "option_c",
  d: "option_d",
  e: "option_e",
};

class McqImportService extends BaseService {
  /** Subject-name → id map for resolving CSV subject names. */
  private async subjectMap(): Promise<Map<string, string>> {
    try {
      const { data, error } = await this.db
        .from("subjects")
        .select("id, name");
      if (error) return new Map();
      return new Map(
        ((data as { id: string; name: string }[]) ?? []).map((s) => [
          s.name.trim().toLowerCase(),
          s.id,
        ]),
      );
    } catch {
      return new Map();
    }
  }

  /** Normalised question text already in the bank — for duplicate detection. */
  private async existingTexts(): Promise<Set<string>> {
    try {
      const { data, error } = await this.db
        .from("mcq_questions")
        .select("question_text")
        .limit(2000);
      if (error) return new Set();
      return new Set(
        ((data as { question_text: string }[]) ?? []).map((r) =>
          normalizeQuestionText(r.question_text),
        ),
      );
    } catch {
      return new Set();
    }
  }

  /** Parse + validate a CSV, producing a row-by-row import report. */
  async analyze(csvText: string): Promise<BulkImportReport> {
    const matrix = parseCsv(csvText);
    if (matrix.length < 2) {
      return { total: 0, valid: 0, invalid: 0, duplicates: 0, rows: [] };
    }

    const header = matrix[0].map(
      (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase(),
    );
    const col = (name: string) => header.indexOf(name);
    const at = (cells: string[], name: string): string => {
      const idx = col(name);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const [subjects, existing] = await Promise.all([
      this.subjectMap(),
      this.existingTexts(),
    ]);

    const seenInFile = new Set<string>();
    const rows: BulkImportRow[] = [];

    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i];
      const raw: Record<string, string> = {};
      header.forEach((h, idx) => {
        raw[h] = (cells[idx] ?? "").trim();
      });

      const errors: string[] = [];
      const questionText = at(cells, "question_text");
      if (!questionText) errors.push("Missing question text");

      const typeRaw = at(cells, "question_type").toLowerCase().replace(/\s|-/g, "_");
      const questionType: McqQuestionType =
        TYPE_ALIASES[typeRaw] ?? "single";
      if (typeRaw && !TYPE_ALIASES[typeRaw]) {
        errors.push(`Unknown question type "${at(cells, "question_type")}"`);
      }

      const diffRaw = at(cells, "difficulty").toLowerCase();
      const difficulty: McqDifficulty =
        diffRaw === "easy" || diffRaw === "hard" || diffRaw === "medium"
          ? (diffRaw as McqDifficulty)
          : "medium";

      const marksRaw = at(cells, "marks");
      const marks = marksRaw ? Number(marksRaw) : 1;
      if (Number.isNaN(marks) || marks <= 0) {
        errors.push("Marks must be a positive number");
      }
      const negRaw = at(cells, "negative_marks");
      const negativeMarks = negRaw ? Math.abs(Number(negRaw) || 0) : 0;

      // ── Build options / numerical key ─────────────────────────────────────
      let options: McqOption[] = [];
      let numericalAnswer: McqQuestionInput["numericalAnswer"] = null;
      const correctRaw = at(cells, "correct");

      if (questionType === "numerical") {
        const value = Number(correctRaw);
        const tolerance = Math.abs(Number(at(cells, "tolerance")) || 0);
        if (correctRaw === "" || Number.isNaN(value)) {
          errors.push("Numerical questions need a numeric answer in `correct`");
        } else {
          numericalAnswer = { value, tolerance };
        }
      } else {
        const letters = ["a", "b", "c", "d", "e"];
        const correctSet = new Set(
          correctRaw
            .split(/[,;/| ]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );
        options = letters
          .map((letter) => {
            const text = at(cells, LETTER_TO_OPTION[letter]);
            return text
              ? {
                  id: `o${letter}`,
                  text,
                  isCorrect: correctSet.has(letter),
                }
              : null;
          })
          .filter((o): o is McqOption => o !== null);
        if (correctSet.size === 0) {
          errors.push("Missing correct answer letter(s) in `correct`");
        }
      }

      // ── Subject ───────────────────────────────────────────────────────────
      const subjectName = at(cells, "subject") || null;
      const subjectId = subjectName
        ? subjects.get(subjectName.toLowerCase()) ?? null
        : null;

      const question: McqQuestionInput = {
        questionText,
        questionType,
        subjectId,
        subjectName,
        chapter: at(cells, "chapter") || null,
        topic: at(cells, "topic") || null,
        difficulty,
        marks: Number.isNaN(marks) ? 1 : marks,
        negativeMarks,
        options,
        numericalAnswer,
        explanation: at(cells, "explanation") || null,
        hasFormula: false,
        status: "draft",
      };

      // Answer-key sanity through the centralised scoring layer.
      const keyError = answerKeyError(question);
      if (keyError && errors.length === 0) errors.push(keyError);

      // Duplicate detection — within the file and against the bank.
      const norm = normalizeQuestionText(questionText);
      const isDuplicate =
        !!questionText &&
        (seenInFile.has(norm) || existing.has(norm));
      if (questionText) seenInFile.add(norm);

      rows.push({
        rowNumber: i + 1,
        raw,
        question: errors.length === 0 ? question : undefined,
        errors,
        isDuplicate,
      });
    }

    const valid = rows.filter((r) => r.errors.length === 0 && !r.isDuplicate)
      .length;
    const duplicates = rows.filter((r) => r.isDuplicate).length;
    const invalid = rows.filter((r) => r.errors.length > 0).length;

    return { total: rows.length, valid, invalid, duplicates, rows };
  }

  /**
   * Insert the importable rows. `includeDuplicates` lets the reviewer override
   * duplicate suppression. Returns the number of questions created.
   */
  async commit(
    report: BulkImportReport,
    owner: QuestionOwner = {},
    includeDuplicates = false,
  ): Promise<number> {
    const importable = report.rows.filter(
      (r) =>
        r.errors.length === 0 &&
        r.question &&
        (includeDuplicates || !r.isDuplicate),
    );
    if (importable.length === 0) return 0;

    const payload = importable.map((r) => {
      const q = r.question!;
      return {
        question_text: q.questionText,
        question_type: q.questionType,
        subject_id: q.subjectId ?? null,
        subject_name: q.subjectName ?? null,
        chapter: q.chapter ?? null,
        topic: q.topic ?? null,
        difficulty: q.difficulty,
        marks: q.marks,
        negative_marks: q.negativeMarks,
        options: q.options,
        numerical_answer: q.numericalAnswer ?? null,
        explanation: q.explanation ?? null,
        has_formula: false,
        status: "draft",
        is_global: false,
        owner_id: owner.ownerId ?? null,
        owner_name: owner.ownerName ?? null,
        campus_id: owner.campusId ?? null,
        created_by: owner.ownerId ?? null,
      };
    });

    const { error } = await this.db
      .from("mcq_questions")
      .insert(payload as never);
    if (error) throw AppError.fromSupabase(error, "question import");
    return payload.length;
  }
}

export const mcqImportService = new McqImportService();
