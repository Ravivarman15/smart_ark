import { BaseService, AppError } from "@/shared/services";
import { supabase } from "@/integrations/supabase/client";
import { normalizeQuestionText } from "../utils/mcqScoring";
import { parsePaper, detectBloom } from "../utils/paperParser";
import { extractFileText, type PaperFileType } from "./paperTextExtract.service";
import { mcqQuestionService, type QuestionOwner } from "./mcqQuestion.service";
import { mcqImportService } from "./mcqImport.service";
import { mcqPaperService } from "./mcqPaper.service";
import { isAutoEvaluable } from "../types/mcq.types";
import type {
  BloomLevel, MatchPair, McqDifficulty, McqOption, McqPaper,
  McqQuestionInput, McqQuestionType, PaperQuestionDraft, SubQuestion,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// Question Paper Import — the orchestration layer.
//
// Pipeline:
//   upload(file)  → text (paperTextExtract) → question_paper_imports row
//   extract(id)   → local parser → question_paper_extractions (staged, scored)
//   review        → faculty edits/approves the staged candidates
//   commit(id)    → approved candidates become mcq_questions (reusing an
//                   existing bank question when it's a duplicate), then an
//                   mcq_paper is assembled from them.
//
// Extraction runs ENTIRELY ON THIS MACHINE — no external API, no key, no
// per-paper cost. Spreadsheets go through the existing validated bulk importer;
// prose goes through utils/paperParser. Both score their own confidence, and
// only the questions they were unsure of are put in front of a human.
//
// Everything after `commit` is the EXISTING engine: mcqPaperService builds the
// paper, mcqExamService turns it into an online test, mcqScoring grades it,
// the report-card / Student-360 / comms services publish it. This service adds
// no exam, question, grading or communication logic of its own.
// ─────────────────────────────────────────────────────────────────────────────

export type ImportStatus = "uploaded" | "extracting" | "review" | "committed" | "failed";
export type ExtractionStatus = "pending" | "approved" | "rejected";

/** Below this, the review screen flags the question for a human. */
export const LOW_CONFIDENCE = 75;

export interface PaperMeta {
  examName?: string;
  subject?: string;
  standard?: string;
  section?: string;
  board?: string;
  academicYear?: string;
  term?: string;
  month?: string;
  durationMinutes?: number;
  totalMarks?: number;
  instructions?: string;
}

/** The AI's candidate for one question, before a human has blessed it. */
export interface ExtractedQuestion {
  questionNo?: string;
  section?: string;
  questionText: string;
  questionType: McqQuestionType;
  marks: number;
  negativeMarks: number;
  chapter?: string;
  topic?: string;
  difficulty: McqDifficulty;
  bloomLevel?: BloomLevel;
  tags: string[];
  options: { text: string; isCorrect: boolean }[];
  numericalAnswer?: number;
  numericalTolerance?: number;
  answerText?: string;
  matchPairs: MatchPair[];
  subQuestions: SubQuestion[];
  explanation?: string;
  hasFormula: boolean;
  confidence: number;
  sourceText: string;
}

export interface QuestionPaperImport {
  id: string;
  fileName: string;
  fileType: PaperFileType;
  fileSize: number;
  storagePath?: string;
  status: ImportStatus;
  error?: string;
  detectedMeta: PaperMeta;
  questionCount: number;
  approvedCount: number;
  avgConfidence?: number;
  paperId?: string;
  createdAt: string;
}

export interface ExtractionRow {
  id: string;
  importId: string;
  questionNo?: string;
  section?: string;
  sortOrder: number;
  sourceText: string;
  extracted: ExtractedQuestion;
  confidence: number;
  status: ExtractionStatus;
  questionId?: string;
  duplicateOf?: string;
}

type ImportDbRow = {
  id: string; file_name: string; file_type: string; file_size: number;
  storage_path: string | null; status: string; error: string | null;
  detected_meta: PaperMeta | null; question_count: number; approved_count: number;
  avg_confidence: number | null; paper_id: string | null; created_at: string;
};

type ExtractionDbRow = {
  id: string; import_id: string; question_no: string | null; section: string | null;
  sort_order: number; source_text: string; extracted: ExtractedQuestion;
  confidence: number; status: string; question_id: string | null;
  duplicate_of: string | null;
};

const toImport = (r: ImportDbRow): QuestionPaperImport => ({
  id: r.id,
  fileName: r.file_name,
  fileType: r.file_type as PaperFileType,
  fileSize: r.file_size,
  storagePath: r.storage_path ?? undefined,
  status: r.status as ImportStatus,
  error: r.error ?? undefined,
  detectedMeta: r.detected_meta ?? {},
  questionCount: r.question_count,
  approvedCount: r.approved_count,
  avgConfidence: r.avg_confidence ?? undefined,
  paperId: r.paper_id ?? undefined,
  createdAt: r.created_at,
});

const toExtraction = (r: ExtractionDbRow): ExtractionRow => ({
  id: r.id,
  importId: r.import_id,
  questionNo: r.question_no ?? undefined,
  section: r.section ?? undefined,
  sortOrder: r.sort_order,
  sourceText: r.source_text,
  extracted: r.extracted,
  confidence: Number(r.confidence),
  status: r.status as ExtractionStatus,
  questionId: r.question_id ?? undefined,
  duplicateOf: r.duplicate_of ?? undefined,
});

/**
 * Stable hash of the normalised question text — the duplicate key. Reuses the
 * SAME normaliser the bank's existing duplicate detection uses, so a question
 * imported from a paper and one typed by hand collide exactly as they should.
 * FNV-1a: tiny, synchronous, and good enough for equality bucketing.
 */
export function hashQuestionText(text: string): string {
  const normalized = normalizeQuestionText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** AI candidate → the exact input shape the existing bank service accepts. */
export function toQuestionInput(
  q: ExtractedQuestion,
  ctx: { subjectId?: string; standardId?: string; board?: string; importId?: string },
): McqQuestionInput {
  const options: McqOption[] = (q.options ?? []).map((o, i) => ({
    id: `o${i + 1}`,
    text: o.text,
    isCorrect: o.isCorrect,
  }));

  return {
    questionText: q.questionText,
    questionType: q.questionType,
    subjectId: ctx.subjectId ?? null,
    standardId: ctx.standardId ?? null,
    chapter: q.chapter || null,
    topic: q.topic || null,
    difficulty: q.difficulty,
    marks: q.marks > 0 ? q.marks : 1,
    negativeMarks: q.negativeMarks ?? 0,
    options,
    numericalAnswer:
      q.questionType === "numerical" && typeof q.numericalAnswer === "number"
        ? { value: q.numericalAnswer, tolerance: q.numericalTolerance ?? 0 }
        : null,
    explanation: q.explanation || null,
    hasFormula: !!q.hasFormula,
    status: "published",
    bloomLevel: q.bloomLevel ?? null,
    tags: q.tags ?? [],
    board: ctx.board ?? null,
    answerText: q.answerText || null,
    matchPairs: q.matchPairs ?? [],
    subQuestions: q.subQuestions ?? [],
    // Subjective types are stored in the same bank but flagged so the grading
    // engine hands them to a teacher instead of auto-scoring them.
    autoEvaluable: isAutoEvaluable(q.questionType),
    textHash: hashQuestionText(q.questionText),
    sourceImportId: ctx.importId ?? null,
  };
}

// ── The two extractors ──────────────────────────────────────────────────────

/** PDF / DOCX / pasted text → the local prose parser. */
function extractFromProse(text: string): { meta: PaperMeta; questions: ExtractedQuestion[] } {
  const { meta, questions } = parsePaper(text);
  return { meta, questions };
}

/**
 * CSV / Excel → the EXISTING bulk-import parser. It already validates every
 * row, understands the column aliases and resolves the answer key, so a
 * structured sheet lands at high confidence with no guessing. Rows the
 * importer rejected are still surfaced (at low confidence, carrying the
 * validation errors) rather than silently dropped — the teacher decides.
 */
async function extractFromTable(
  csvText: string,
): Promise<{ meta: PaperMeta; questions: ExtractedQuestion[] }> {
  const report = await mcqImportService.analyze(csvText);

  const questions: ExtractedQuestion[] = report.rows.map((row, i) => {
    const q = row.question;
    const raw = row.raw;

    if (!q) {
      // Invalid row: keep it, flag it hard, and show the reviewer why.
      return {
        questionNo: String(i + 1),
        section: "",
        questionText: raw.question_text ?? "(unreadable row)",
        questionType: "single" as McqQuestionType,
        marks: 1,
        negativeMarks: 0,
        difficulty: "medium" as McqDifficulty,
        tags: [],
        options: [],
        matchPairs: [],
        subQuestions: [],
        hasFormula: false,
        confidence: 0,
        sourceText: `Row ${row.rowNumber}: ${row.errors.join("; ")}`,
      };
    }

    const hasKey =
      q.options.some((o) => o.isCorrect) || q.numericalAnswer != null;
    const { level: bloomLevel } = detectBloom(q.questionText);

    return {
      questionNo: String(i + 1),
      section: "",
      questionText: q.questionText,
      questionType: q.questionType,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      chapter: q.chapter ?? undefined,
      topic: q.topic ?? undefined,
      difficulty: q.difficulty,
      bloomLevel,
      tags: [],
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      numericalAnswer: q.numericalAnswer?.value,
      numericalTolerance: q.numericalAnswer?.tolerance,
      answerText: undefined,
      matchPairs: [],
      subQuestions: [],
      explanation: q.explanation ?? undefined,
      hasFormula: !!q.hasFormula,
      // A validated sheet row is as trustworthy as this gets — the only thing
      // that can still be missing is the answer key.
      confidence: hasKey ? 100 : 60,
      sourceText: Object.entries(raw)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    };
  });

  // A spreadsheet is a bank of questions, not a paper — it carries no header.
  const meta: PaperMeta = {};
  return { meta, questions };
}

class QuestionPaperImportService extends BaseService {
  // ── Upload ────────────────────────────────────────────────────────────────
  /**
   * Read the file to text, park the original in storage, and record the import.
   * The file is stored best-effort — a storage failure must not lose an import
   * whose text we already have.
   */
  async upload(file: File, owner: QuestionOwner = {}): Promise<QuestionPaperImport> {
    const { text, fileType } = await extractFileText(file);

    let storagePath: string | undefined;
    try {
      const path = `${owner.ownerId ?? "anon"}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("question-papers").upload(path, file);
      if (!error) storagePath = path;
    } catch {
      // Non-fatal: extraction runs off `raw_text`, not the stored file.
    }

    const res = await this.db
      .from("question_paper_imports")
      .insert({
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        storage_path: storagePath ?? null,
        raw_text: text,
        status: "uploaded",
        campus_id: owner.campusId ?? null,
        created_by: owner.ownerId ?? null,
      } as never)
      .select("*")
      .single();

    return toImport(this.guard(res, "question paper import") as unknown as ImportDbRow);
  }

  /** Pasted text takes the same path as a file — one pipeline, not two. */
  async uploadText(
    name: string,
    text: string,
    owner: QuestionOwner = {},
  ): Promise<QuestionPaperImport> {
    if (text.trim().length < 40) {
      throw AppError.validation("Paste at least a few questions before importing.");
    }
    const res = await this.db
      .from("question_paper_imports")
      .insert({
        file_name: name || "Pasted paper",
        file_type: "text",
        file_size: text.length,
        raw_text: text,
        status: "uploaded",
        campus_id: owner.campusId ?? null,
        created_by: owner.ownerId ?? null,
      } as never)
      .select("*")
      .single();
    return toImport(this.guard(res, "question paper import") as unknown as ImportDbRow);
  }

  // ── Extract ───────────────────────────────────────────────────────────────
  /**
   * Run the AI extraction and stage the results for review. Idempotent: a
   * re-run clears the previous candidates for this import first, so a retry
   * after a bad extraction never leaves ghost questions behind.
   */
  async extract(
    importId: string,
    hint?: { subject?: string; standard?: string; board?: string },
  ): Promise<{ meta: PaperMeta; count: number }> {
    await this.setStatus(importId, "extracting");

    try {
      const { data: row, error: readErr } = await this.db
        .from("question_paper_imports")
        .select("raw_text, file_type")
        .eq("id", importId)
        .single();
      if (readErr) throw AppError.fromSupabase(readErr, "question paper import");

      const { raw_text: rawText, file_type: fileType } =
        row as { raw_text: string; file_type: PaperFileType };

      // Two extractors, picked by what the file actually is:
      //
      //   • CSV / Excel — already a table of questions. Runs through the
      //     EXISTING validated bulk importer (mcqImportService), which knows
      //     the column aliases and the answer-key format. A structured sheet
      //     is a solved problem; we do not re-guess it with heuristics.
      //
      //   • PDF / DOCX / pasted text — prose. Runs through the local parser
      //     (utils/paperParser), which reads question numbers, marks, options,
      //     sections and the answer key, and scores its own confidence.
      //
      // Both are deterministic, run on this machine, and cost nothing.
      const { meta, questions } =
        fileType === "csv" || fileType === "xlsx"
          ? await extractFromTable(rawText)
          : extractFromProse(rawText);

      if (questions.length === 0) {
        throw AppError.validation(
          "No questions could be identified in this document. Check that it is a question paper (numbered questions), not an answer key or a syllabus.",
        );
      }

      // A hint from the caller wins over what the paper said about itself.
      const result = {
        meta: {
          ...meta,
          subject: hint?.subject || meta.subject,
          standard: hint?.standard || meta.standard,
          board: hint?.board || meta.board,
        },
      };

      await this.db.from("question_paper_extractions").delete().eq("import_id", importId);

      const rows = questions.map((q, i) => ({
        import_id: importId,
        question_no: q.questionNo || String(i + 1),
        section: q.section || null,
        sort_order: i,
        source_text: q.sourceText || "",
        extracted: q,
        confidence: clampConfidence(q.confidence),
        // Anything the parser read cleanly is pre-approved; only what it was
        // unsure of waits for a human. This is what makes the flow "faculty
        // reviews ONLY low-confidence questions".
        status: clampConfidence(q.confidence) >= LOW_CONFIDENCE ? "approved" : "pending",
      }));

      const { error: insErr } = await this.db
        .from("question_paper_extractions")
        .insert(rows as never);
      if (insErr) throw AppError.fromSupabase(insErr, "extracted questions");

      const avg =
        rows.reduce((a, r) => a + r.confidence, 0) / rows.length;

      const { error: updErr } = await this.db
        .from("question_paper_imports")
        .update({
          status: "review",
          detected_meta: result.meta ?? {},
          question_count: rows.length,
          approved_count: rows.filter((r) => r.status === "approved").length,
          avg_confidence: Number(avg.toFixed(2)),
          error: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", importId);
      if (updErr) throw AppError.fromSupabase(updErr, "question paper import");

      return { meta: result.meta ?? {}, count: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      await this.db
        .from("question_paper_imports")
        .update({ status: "failed", error: message } as never)
        .eq("id", importId);
      throw err;
    }
  }

  // ── Review ────────────────────────────────────────────────────────────────
  async listImports(): Promise<QuestionPaperImport[]> {
    const res = await this.db
      .from("question_paper_imports")
      .select("*")
      .order("created_at", { ascending: false });
    return ((this.guard(res, "question paper imports") ?? []) as unknown as ImportDbRow[])
      .map(toImport);
  }

  async getImport(id: string): Promise<QuestionPaperImport> {
    const res = await this.db
      .from("question_paper_imports")
      .select("*")
      .eq("id", id)
      .single();
    return toImport(this.guard(res, "question paper import") as unknown as ImportDbRow);
  }

  async listExtractions(importId: string): Promise<ExtractionRow[]> {
    const res = await this.db
      .from("question_paper_extractions")
      .select("*")
      .eq("import_id", importId)
      .order("sort_order", { ascending: true });
    return ((this.guard(res, "extracted questions") ?? []) as unknown as ExtractionDbRow[])
      .map(toExtraction);
  }

  /** Faculty edit — an edited question is trusted, so it goes to 100%. */
  async updateExtraction(id: string, patch: Partial<ExtractedQuestion>): Promise<void> {
    const res = await this.db
      .from("question_paper_extractions")
      .select("extracted")
      .eq("id", id)
      .single();
    const current = (this.guard(res, "extracted question") as { extracted: ExtractedQuestion })
      .extracted;

    const merged = { ...current, ...patch, confidence: 100 };
    const { error } = await this.db
      .from("question_paper_extractions")
      .update({
        extracted: merged,
        confidence: 100,
        status: "approved",
        question_no: merged.questionNo ?? null,
        section: merged.section ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "extracted question");
    await this.refreshCounts(id);
  }

  async setExtractionStatus(id: string, status: ExtractionStatus): Promise<void> {
    const { error } = await this.db
      .from("question_paper_extractions")
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "extracted question");
    await this.refreshCounts(id);
  }

  /** Approve every still-pending candidate in one action. */
  async approveAll(importId: string): Promise<void> {
    const { error } = await this.db
      .from("question_paper_extractions")
      .update({ status: "approved" } as never)
      .eq("import_id", importId)
      .eq("status", "pending");
    if (error) throw AppError.fromSupabase(error, "extracted questions");
    await this.recountImport(importId);
  }

  async removeExtraction(id: string): Promise<void> {
    const importId = await this.importIdOf(id);
    const { error } = await this.db.from("question_paper_extractions").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "extracted question");
    if (importId) await this.recountImport(importId);
  }

  /** Duplicate a candidate — the practical way to split a merged question. */
  async duplicateExtraction(id: string): Promise<void> {
    const res = await this.db
      .from("question_paper_extractions")
      .select("*")
      .eq("id", id)
      .single();
    const row = this.guard(res, "extracted question") as unknown as ExtractionDbRow;

    const { error } = await this.db.from("question_paper_extractions").insert({
      import_id: row.import_id,
      question_no: `${row.question_no ?? ""} (copy)`,
      section: row.section,
      sort_order: row.sort_order,
      source_text: row.source_text,
      extracted: row.extracted,
      confidence: row.confidence,
      status: "pending",
    } as never);
    if (error) throw AppError.fromSupabase(error, "extracted question");
    await this.recountImport(row.import_id);
  }

  // ── Commit ────────────────────────────────────────────────────────────────
  /**
   * Approved candidates → the question bank → a paper.
   *
   * Duplicate policy (Step 6, "reuse existing question if duplicate"): a
   * candidate whose normalised-text hash already exists in the bank is NOT
   * inserted again — the paper references the existing question, and the
   * staging row records which one it matched. This is what stops the bank
   * bloating when the same paper is uploaded twice.
   */
  async commit(
    importId: string,
    opts: {
      title: string;
      subjectId?: string;
      subjectName?: string;
      standardId?: string;
      standardName?: string;
      board?: string;
      durationMinutes: number;
      instructions?: string;
    },
    owner: QuestionOwner = {},
  ): Promise<{ paper: McqPaper; created: number; reused: number }> {
    const approved = (await this.listExtractions(importId)).filter(
      (e) => e.status === "approved",
    );
    if (approved.length === 0) {
      throw AppError.validation("Approve at least one question before creating the paper.");
    }

    const inputs = approved.map((e) =>
      toQuestionInput(e.extracted, {
        subjectId: opts.subjectId,
        standardId: opts.standardId,
        board: opts.board,
        importId,
      }),
    );

    // 1. Which of these already exist in the bank?
    const hashes = inputs.map((i) => i.textHash!).filter(Boolean);
    const existing = await this.findByHashes(hashes);

    const newInputs: { input: McqQuestionInput; extractionId: string }[] = [];
    const resolved: { extractionId: string; questionId: string; reused: boolean }[] = [];

    inputs.forEach((input, i) => {
      const hit = existing.get(input.textHash!);
      if (hit) {
        resolved.push({ extractionId: approved[i].id, questionId: hit, reused: true });
      } else {
        newInputs.push({ input, extractionId: approved[i].id });
      }
    });

    // 2. Insert the genuinely new ones in one batch.
    if (newInputs.length > 0) {
      const created = await mcqQuestionService.createMany(
        newInputs.map((n) => n.input),
        owner,
      );
      created.forEach((questionId, i) => {
        resolved.push({
          extractionId: newInputs[i].extractionId,
          questionId,
          reused: false,
        });
      });
    }

    // 3. Build the paper out of them — via the existing paper service, so
    //    totals, difficulty score, versioning and usage tracking all run.
    const paper = await mcqPaperService.create(
      {
        title: opts.title,
        subjectId: opts.subjectId ?? null,
        subjectName: opts.subjectName ?? null,
        standardId: opts.standardId ?? null,
        standardName: opts.standardName ?? null,
        instructions: opts.instructions ?? null,
        durationMinutes: opts.durationMinutes,
        negativeMarking: inputs.some((i) => (i.negativeMarks ?? 0) > 0),
        setCount: 1,
        randomize: false,
        generationMode: "manual",
        status: "draft",
      },
      owner,
    );

    const byExtraction = new Map<string, string>(
      resolved.map((r) => [r.extractionId, r.questionId] as [string, string]),
    );
    const drafts: PaperQuestionDraft[] = approved
      .map((e, i): PaperQuestionDraft | null => {
        const questionId = byExtraction.get(e.id);
        return questionId ? { questionId, sortOrder: i, setLabel: "A" } : null;
      })
      .filter((d): d is PaperQuestionDraft => d !== null);

    await mcqPaperService.saveQuestions(paper.id, drafts, {
      actorId: owner.ownerId,
      actorName: owner.ownerName,
    });

    // 4. Close the loop: link staging rows to the bank questions for audit.
    await Promise.all(
      resolved.map((r) =>
        this.db
          .from("question_paper_extractions")
          .update({
            question_id: r.questionId,
            duplicate_of: r.reused ? r.questionId : null,
          } as never)
          .eq("id", r.extractionId),
      ),
    );

    const { error } = await this.db
      .from("question_paper_imports")
      .update({
        status: "committed",
        paper_id: paper.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", importId);
    if (error) throw AppError.fromSupabase(error, "question paper import");

    return {
      paper,
      created: resolved.filter((r) => !r.reused).length,
      reused: resolved.filter((r) => r.reused).length,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  /** Bank questions already holding any of these text hashes → hash → id. */
  private async findByHashes(hashes: string[]): Promise<Map<string, string>> {
    if (hashes.length === 0) return new Map();
    const { data, error } = await this.db
      .from("mcq_questions")
      .select("id, text_hash")
      .in("text_hash", hashes);
    if (error) return new Map(); // best-effort: worst case we create a duplicate
    const map = new Map<string, string>();
    ((data ?? []) as { id: string; text_hash: string | null }[]).forEach((r) => {
      if (r.text_hash && !map.has(r.text_hash)) map.set(r.text_hash, r.id);
    });
    return map;
  }

  private async setStatus(id: string, status: ImportStatus): Promise<void> {
    await this.db
      .from("question_paper_imports")
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
  }

  private async importIdOf(extractionId: string): Promise<string | null> {
    const { data } = await this.db
      .from("question_paper_extractions")
      .select("import_id")
      .eq("id", extractionId)
      .single();
    return (data as { import_id: string } | null)?.import_id ?? null;
  }

  private async refreshCounts(extractionId: string): Promise<void> {
    const importId = await this.importIdOf(extractionId);
    if (importId) await this.recountImport(importId);
  }

  /** Keep question_count / approved_count honest after any review action. */
  private async recountImport(importId: string): Promise<void> {
    const { data } = await this.db
      .from("question_paper_extractions")
      .select("status")
      .eq("import_id", importId);
    const rows = (data ?? []) as { status: string }[];
    await this.db
      .from("question_paper_imports")
      .update({
        question_count: rows.length,
        approved_count: rows.filter((r) => r.status === "approved").length,
      } as never)
      .eq("id", importId);
  }
}

const clampConfidence = (c: unknown): number => {
  const n = Number(c);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export const questionPaperImportService = new QuestionPaperImportService();
