import { BaseService } from "@/shared/services";
import { mcqImportService } from "./mcqImport.service";
import { mcqPaperService } from "./mcqPaper.service";
import type { QuestionOwner } from "./mcqQuestion.service";
import type {
  BulkImportReport,
  McqPaper,
  McqPaperInput,
  PaperQuestionDraft,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// Question Paper Import (enterprise). Imports a COMPLETE paper — its questions
// AND paper metadata — from one CSV / Excel file, then wires it into the
// existing MCQ paper architecture. It reuses, end to end:
//   • mcqImportService.analyze   → parsing + per-row validation + duplicate flags
//   • mcqImportService.commitReturningIds → creates the bank questions
//   • mcqPaperService.create + saveQuestions → creates the paper and attaches
//     the questions (totals/marks/difficulty recomputed centrally)
// No new tables, no duplicate parser, no duplicate grading — one orchestration.
// ─────────────────────────────────────────────────────────────────────────────

export interface PaperImportResult {
  paper: McqPaper;
  questionsCreated: number;
  skipped: number;
}

class PaperImportService extends BaseService {
  /** Read a CSV or Excel file into CSV text (first sheet for .xlsx). */
  async fileToCsv(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || file.type === "text/csv") {
      return file.text();
    }
    // Excel → CSV via the already-bundled xlsx (lazy-imported).
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const first = wb.SheetNames[0];
    return XLSX.utils.sheet_to_csv(wb.Sheets[first]);
  }

  /** Validate the question rows (delegates to the shared MCQ import analyzer). */
  analyze(csvText: string): Promise<BulkImportReport> {
    return mcqImportService.analyze(csvText);
  }

  /**
   * Create the paper: import its questions, create the paper record, then attach
   * the questions in file order. `includeDuplicates` mirrors the bank importer.
   */
  async importPaper(
    report: BulkImportReport,
    meta: McqPaperInput,
    owner: QuestionOwner = {},
    includeDuplicates = false,
  ): Promise<PaperImportResult> {
    const ids = await mcqImportService.commitReturningIds(report, owner, includeDuplicates);
    const paper = await mcqPaperService.create(meta, owner);
    if (ids.length > 0) {
      const drafts: PaperQuestionDraft[] = ids.map((questionId, i) => ({
        questionId,
        sortOrder: i,
      }));
      await mcqPaperService.saveQuestions(paper.id, drafts, owner);
    }
    return {
      paper,
      questionsCreated: ids.length,
      skipped: report.total - ids.length,
    };
  }
}

export const paperImportService = new PaperImportService();
