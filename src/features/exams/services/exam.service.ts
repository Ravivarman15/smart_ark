import { BaseService, AppError } from "@/shared/services";
import type {
  Exam,
  ExamInput,
  ExamStatus,
  GradeBand,
  ExamAttachment,
  RescheduleInput,
  ResultsStatus,
} from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Exam service — CRUD + lifecycle for exam definitions.
//
// Audit-safe: lifecycle transitions (reschedule, publish, lock, …) are narrow
// dedicated methods rather than a free-form update, so the audit log written by
// the hooks always reflects a meaningful event. A LOCKED exam rejects further
// edits at this layer — the last line of defence behind the UI gate.
// ─────────────────────────────────────────────────────────────────────────────

type ExamRow = {
  id: string;
  title: string;
  exam_type: string;
  mode: string;
  standard_id: string | null;
  standard_name: string | null;
  batch_id: string | null;
  batch_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  total_marks: number | null;
  pass_marks: number | null;
  duration_minutes: number | null;
  instructions: string | null;
  exam_date: string | null;
  start_time: string | null;
  end_time: string | null;
  hall: string | null;
  grading_scheme: GradeBand[] | null;
  attachments: ExamAttachment[] | null;
  status: string | null;
  results_status: string | null;
  campus_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT = "*";

const normStatus = (s?: string | null): ExamStatus =>
  s === "draft" ||
  s === "scheduled" ||
  s === "ongoing" ||
  s === "completed" ||
  s === "cancelled"
    ? s
    : "scheduled";

const normResults = (s?: string | null): ResultsStatus =>
  s === "published" || s === "locked" ? s : "pending";

const toDomain = (r: ExamRow): Exam => ({
  id: r.id,
  title: r.title,
  examType: (r.exam_type as Exam["examType"]) ?? "unit_test",
  mode: (r.mode as Exam["mode"]) ?? "manual",
  standardId: r.standard_id ?? undefined,
  standardName: r.standard_name ?? undefined,
  batchId: r.batch_id ?? undefined,
  batchName: r.batch_name ?? undefined,
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subject_name ?? undefined,
  totalMarks: Number(r.total_marks ?? 0),
  passMarks: Number(r.pass_marks ?? 0),
  durationMinutes: Number(r.duration_minutes ?? 60),
  instructions: r.instructions ?? undefined,
  examDate: r.exam_date ?? undefined,
  startTime: r.start_time ?? undefined,
  endTime: r.end_time ?? undefined,
  hall: r.hall ?? undefined,
  gradingScheme: Array.isArray(r.grading_scheme) ? r.grading_scheme : [],
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
  status: normStatus(r.status),
  resultsStatus: normResults(r.results_status),
  campusId: r.campus_id ?? undefined,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toDb = (i: Partial<ExamInput>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.title !== undefined) out.title = i.title;
  if (i.examType !== undefined) out.exam_type = i.examType;
  if (i.mode !== undefined) out.mode = i.mode;
  if (i.standardId !== undefined) out.standard_id = i.standardId ?? null;
  if (i.standardName !== undefined) out.standard_name = i.standardName ?? null;
  if (i.batchId !== undefined) out.batch_id = i.batchId ?? null;
  if (i.batchName !== undefined) out.batch_name = i.batchName ?? null;
  if (i.subjectId !== undefined) out.subject_id = i.subjectId ?? null;
  if (i.subjectName !== undefined) out.subject_name = i.subjectName ?? null;
  if (i.totalMarks !== undefined) out.total_marks = i.totalMarks;
  if (i.passMarks !== undefined) out.pass_marks = i.passMarks;
  if (i.durationMinutes !== undefined)
    out.duration_minutes = i.durationMinutes;
  if (i.instructions !== undefined) out.instructions = i.instructions ?? null;
  if (i.examDate !== undefined) out.exam_date = i.examDate ?? null;
  if (i.startTime !== undefined) out.start_time = i.startTime ?? null;
  if (i.endTime !== undefined) out.end_time = i.endTime ?? null;
  if (i.hall !== undefined) out.hall = i.hall ?? null;
  if (i.gradingScheme !== undefined) out.grading_scheme = i.gradingScheme;
  if (i.attachments !== undefined) out.attachments = i.attachments;
  if (i.status !== undefined) out.status = i.status;
  return out;
};

interface ListParams {
  /** Restrict to one exam mode — the Manual pages pass "manual". */
  mode?: Exam["mode"];
  status?: ExamStatus;
}

class ExamService extends BaseService {
  /** List exams, newest exam date first. */
  async list(params: ListParams = {}): Promise<Exam[]> {
    let q = this.db.from("exams").select(SELECT);
    if (params.mode) q = q.eq("mode", params.mode);
    if (params.status) q = q.eq("status", params.status);
    const res = await q
      .order("exam_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    const rows = this.guardList(res, "exams");
    return (rows as unknown as ExamRow[]).map(toDomain);
  }

  async getById(id: string): Promise<Exam> {
    const res = await this.db.from("exams").select(SELECT).eq("id", id).single();
    return toDomain(this.guard(res, "exam") as unknown as ExamRow);
  }

  /** Internal raw fetch — throws if missing. */
  private async fetchRow(id: string): Promise<ExamRow> {
    const { data, error } = await this.db
      .from("exams")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw AppError.fromSupabase(error, "exam");
    if (!data) throw AppError.notFound("exam", id);
    return data as unknown as ExamRow;
  }

  /** Guard: a locked exam is frozen — no edits, no marks changes. */
  private assertEditable(row: ExamRow, action: string): void {
    if (normResults(row.results_status) === "locked") {
      throw AppError.validation(
        `This exam's results are locked — ${action} is no longer allowed. Unlock it first.`,
      );
    }
  }

  async create(input: ExamInput, createdBy?: string): Promise<Exam> {
    const payload = {
      ...toDb({ mode: "manual", status: "scheduled", ...input }),
      created_by: createdBy ?? null,
    };
    const res = await this.db
      .from("exams")
      .insert(payload as never)
      .select(SELECT)
      .single();
    return toDomain(this.guard(res, "exam") as unknown as ExamRow);
  }

  async update(id: string, input: Partial<ExamInput>): Promise<void> {
    const row = await this.fetchRow(id);
    this.assertEditable(row, "editing");
    const payload = toDb(input);
    if (Object.keys(payload).length === 0) return;
    const { error } = await this.db
      .from("exams")
      .update(payload as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  async reschedule(id: string, input: RescheduleInput): Promise<void> {
    const row = await this.fetchRow(id);
    this.assertEditable(row, "rescheduling");
    const { error } = await this.db
      .from("exams")
      .update({
        exam_date: input.examDate,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        hall: input.hall ?? null,
      } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  async setStatus(id: string, status: ExamStatus): Promise<void> {
    const { error } = await this.db
      .from("exams")
      .update({ status } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  /** Publish / unpublish / lock the results of an exam. */
  async setResultsStatus(
    id: string,
    resultsStatus: ResultsStatus,
  ): Promise<void> {
    const { error } = await this.db
      .from("exams")
      .update({ results_status: resultsStatus } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  async remove(id: string): Promise<void> {
    const row = await this.fetchRow(id);
    if (normResults(row.results_status) === "locked") {
      throw AppError.validation(
        "Locked exams cannot be deleted — unlock the results first.",
      );
    }
    const { error } = await this.db.from("exams").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "exam");
  }
}

export const examService = new ExamService();
