import { BaseService, AppError } from "@/shared/services";
import { assignRanks } from "../utils/grading";
import { examService } from "./exam.service";
import type { ExamResult, MarksEntryRow } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Exam results service — marks entry + bulk upload.
//
// `saveMarks` takes the COMPLETE set of rows for an exam, runs them through the
// centralised grading layer (grade per row + dense ranks across the exam) and
// upserts them in one write. Marks entry and bulk upload share this single
// path, so a CSV import and a hand-typed grid produce identical, consistent
// results. Absent students are stored with `marks = null`.
// ─────────────────────────────────────────────────────────────────────────────

type ResultRow = {
  id: string;
  exam_id: string;
  student_id: string;
  student_name: string | null;
  marks: number | null;
  is_absent: boolean | null;
  grade: string | null;
  rank: number | null;
  remarks: string | null;
  entered_by: string | null;
  entered_at: string | null;
};

const toDomain = (r: ResultRow): ExamResult => ({
  id: r.id,
  examId: r.exam_id,
  studentId: r.student_id,
  studentName: r.student_name ?? undefined,
  marks: r.marks == null ? null : Number(r.marks),
  isAbsent: !!r.is_absent,
  grade: r.grade ?? undefined,
  rank: r.rank ?? undefined,
  remarks: r.remarks ?? undefined,
  enteredBy: r.entered_by ?? undefined,
  enteredAt: r.entered_at ?? undefined,
});

class ExamResultsService extends BaseService {
  /** Every recorded result for an exam. */
  async listForExam(examId: string): Promise<ExamResult[]> {
    const res = await this.db
      .from("exam_results")
      .select("*")
      .eq("exam_id", examId)
      .order("rank", { ascending: true, nullsFirst: false });
    const rows = this.guardList(res, "exam_results");
    return (rows as unknown as ResultRow[]).map(toDomain);
  }

  /**
   * Save the full marks set for an exam. Grades + ranks are computed centrally,
   * never trusted from the caller. Refuses to write once results are locked.
   */
  async saveMarks(
    examId: string,
    rows: MarksEntryRow[],
    enteredBy?: string,
  ): Promise<void> {
    const exam = await examService.getById(examId);
    if (exam.resultsStatus === "locked") {
      throw AppError.validation(
        "Results are locked for this exam — unlock them to change marks.",
      );
    }

    // Run every row through the grading layer (grade + dense rank).
    const asResults: ExamResult[] = rows.map((r) => ({
      id: "",
      examId,
      studentId: r.studentId,
      studentName: r.studentName,
      marks: r.isAbsent ? null : r.marks,
      isAbsent: r.isAbsent,
      remarks: r.remarks,
    }));
    const scored = assignRanks(exam, asResults);

    const now = new Date().toISOString();
    const payload = scored.map((r) => ({
      exam_id: examId,
      student_id: r.studentId,
      student_name: r.studentName ?? null,
      marks: r.marks,
      is_absent: r.isAbsent,
      grade: r.isAbsent ? "AB" : r.grade ?? null,
      rank: r.rank ?? null,
      remarks: r.remarks ?? null,
      entered_by: enteredBy ?? null,
      entered_at: now,
    }));

    const { error } = await this.db
      .from("exam_results")
      .upsert(payload as never, { onConflict: "exam_id,student_id" });
    if (error) throw AppError.fromSupabase(error, "exam results");
  }
}

export const examResultsService = new ExamResultsService();
