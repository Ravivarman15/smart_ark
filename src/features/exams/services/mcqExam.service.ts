import { BaseService, AppError } from "@/shared/services";
import { round2 } from "../utils/grading";
import { isTargeted } from "../utils/assignmentTargeting";
import type {
  AssignmentDraft,
  ExamAssignment,
  LiveStatus,
  McqExam,
  McqExamInput,
  McqExamOverview,
  ResultRelease,
} from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ exam service — CRUD + lifecycle for live MCQ exams.
//
// An MCQ exam is an `exams` row (mode = 'mcq') for scheduling PLUS an
// `mcq_exams` row for engine config PLUS `mcq_exam_assignments` for the student
// roster. This service composes all three; the Manual-Exam tables and the
// MCQ-Paper tables are only read, never modified.
// ─────────────────────────────────────────────────────────────────────────────

type ExamRow = {
  id: string;
  title: string;
  standard_id: string | null;
  standard_name: string | null;
  batch_id: string | null;
  batch_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  exam_date: string | null;
  instructions: string | null;
  status: string | null;
  results_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CfgRow = {
  id: string;
  exam_id: string;
  paper_id: string | null;
  duration_minutes: number | null;
  attempt_limit: number | null;
  shuffle_questions: boolean | null;
  shuffle_options: boolean | null;
  negative_marking: boolean | null;
  pass_percentage: number | null;
  window_start: string | null;
  window_end: string | null;
  result_release: string | null;
  result_release_at: string | null;
  live_status: string | null;
  allow_resume: boolean | null;
};

type AssignRow = {
  id: string;
  exam_id: string;
  scope_type: string;
  scope_id: string | null;
  scope_name: string | null;
};

type PaperMeta = {
  id: string;
  title: string;
  total_marks: number | null;
  total_questions: number | null;
};

const normLive = (s?: string | null): LiveStatus =>
  s === "live" || s === "paused" || s === "ended" ? s : "not_started";

const normRelease = (s?: string | null): ResultRelease =>
  s === "manual" || s === "scheduled" ? s : "immediate";

const toAssignment = (r: AssignRow): ExamAssignment => ({
  id: r.id,
  examId: r.exam_id,
  scopeType: (r.scope_type as ExamAssignment["scopeType"]) ?? "batch",
  scopeId: r.scope_id ?? undefined,
  scopeName: r.scope_name ?? undefined,
});

const merge = (
  exam: ExamRow,
  cfg: CfgRow | undefined,
  assignments: AssignRow[],
  paper: PaperMeta | undefined,
): McqExam => ({
  id: exam.id,
  title: exam.title,
  standardId: exam.standard_id ?? undefined,
  standardName: exam.standard_name ?? undefined,
  batchId: exam.batch_id ?? undefined,
  batchName: exam.batch_name ?? undefined,
  subjectId: exam.subject_id ?? undefined,
  subjectName: exam.subject_name ?? undefined,
  examDate: exam.exam_date ?? undefined,
  instructions: exam.instructions ?? undefined,
  status: exam.status ?? "scheduled",
  paperId: cfg?.paper_id ?? undefined,
  paperTitle: paper?.title,
  durationMinutes: Number(cfg?.duration_minutes ?? 60),
  attemptLimit: Number(cfg?.attempt_limit ?? 1),
  shuffleQuestions: !!cfg?.shuffle_questions,
  shuffleOptions: !!cfg?.shuffle_options,
  negativeMarking: !!cfg?.negative_marking,
  passPercentage: Number(cfg?.pass_percentage ?? 35),
  windowStart: cfg?.window_start ?? undefined,
  windowEnd: cfg?.window_end ?? undefined,
  resultRelease: normRelease(cfg?.result_release),
  resultReleaseAt: cfg?.result_release_at ?? undefined,
  resultsPublished: exam.results_status === "published",
  liveStatus: normLive(cfg?.live_status),
  allowResume: cfg?.allow_resume ?? true,
  totalMarks: Number(paper?.total_marks ?? 0),
  totalQuestions: Number(paper?.total_questions ?? 0),
  createdBy: exam.created_by ?? undefined,
  createdAt: exam.created_at,
  updatedAt: exam.updated_at,
  assignments: assignments
    .filter((a) => a.exam_id === exam.id)
    .map(toAssignment),
});

export interface RosterStudent {
  id: string;
  name: string;
  rollNumber?: string;
  batchId?: string;
  batchName?: string;
}

class McqExamService extends BaseService {
  /** Paper meta (title + totals) for a set of paper ids. */
  private async papersByIds(ids: string[]): Promise<Map<string, PaperMeta>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db
      .from("mcq_papers")
      .select("id, title, total_marks, total_questions")
      .in("id", ids);
    if (error) return new Map();
    return new Map(
      ((data as PaperMeta[]) ?? []).map((p) => [p.id, p]),
    );
  }

  async list(): Promise<McqExam[]> {
    const examsRes = await this.db
      .from("exams")
      .select("*")
      .eq("mode", "mcq")
      .order("created_at", { ascending: false });
    const exams = this.guardList(examsRes, "exams") as unknown as ExamRow[];
    if (exams.length === 0) return [];

    const ids = exams.map((e) => e.id);
    const [cfgRes, assignRes] = await Promise.all([
      this.db.from("mcq_exams").select("*").in("exam_id", ids),
      this.db.from("mcq_exam_assignments").select("*").in("exam_id", ids),
    ]);
    const cfgs = (cfgRes.data as CfgRow[]) ?? [];
    const assigns = (assignRes.data as AssignRow[]) ?? [];
    const cfgByExam = new Map(cfgs.map((c) => [c.exam_id, c]));
    const papers = await this.papersByIds(
      cfgs.map((c) => c.paper_id).filter((p): p is string => !!p),
    );

    return exams.map((e) =>
      merge(
        e,
        cfgByExam.get(e.id),
        assigns,
        cfgByExam.get(e.id)?.paper_id
          ? papers.get(cfgByExam.get(e.id)!.paper_id!)
          : undefined,
      ),
    );
  }

  async getById(examId: string): Promise<McqExam> {
    const examRes = await this.db
      .from("exams")
      .select("*")
      .eq("id", examId)
      .single();
    const exam = this.guard(examRes, "exam") as unknown as ExamRow;

    const [cfgRes, assignRes] = await Promise.all([
      this.db.from("mcq_exams").select("*").eq("exam_id", examId).maybeSingle(),
      this.db.from("mcq_exam_assignments").select("*").eq("exam_id", examId),
    ]);
    const cfg = (cfgRes.data as CfgRow | null) ?? undefined;
    const assigns = (assignRes.data as AssignRow[]) ?? [];
    const paper = cfg?.paper_id
      ? (await this.papersByIds([cfg.paper_id])).get(cfg.paper_id)
      : undefined;
    return merge(exam, cfg, assigns, paper);
  }

  private async writeAssignments(
    examId: string,
    assignments: AssignmentDraft[],
  ): Promise<void> {
    await this.db
      .from("mcq_exam_assignments")
      .delete()
      .eq("exam_id", examId);
    if (assignments.length === 0) return;
    const payload = assignments.map((a) => ({
      exam_id: examId,
      scope_type: a.scopeType,
      scope_id: a.scopeId,
      scope_name: a.scopeName,
    }));
    const { error } = await this.db
      .from("mcq_exam_assignments")
      .insert(payload as never);
    if (error) throw AppError.fromSupabase(error, "exam assignments");
  }

  async create(input: McqExamInput, createdBy?: string): Promise<McqExam> {
    const paper = (await this.papersByIds([input.paperId])).get(input.paperId);
    const totalMarks = Number(paper?.total_marks ?? 0);
    const passMarks = round2((totalMarks * input.passPercentage) / 100);

    const examRes = await this.db
      .from("exams")
      .insert({
        title: input.title,
        exam_type: "other",
        mode: "mcq",
        standard_id: input.standardId ?? null,
        standard_name: input.standardName ?? null,
        batch_id: input.batchId ?? null,
        batch_name: input.batchName ?? null,
        subject_id: input.subjectId ?? null,
        subject_name: input.subjectName ?? null,
        total_marks: totalMarks,
        pass_marks: passMarks,
        duration_minutes: input.durationMinutes,
        instructions: input.instructions ?? null,
        exam_date: input.examDate ?? null,
        status: "draft",
        results_status: "pending",
        created_by: createdBy ?? null,
      } as never)
      .select("id")
      .single();
    if (examRes.error) throw AppError.fromSupabase(examRes.error, "exam");
    const examId = (examRes.data as { id: string }).id;

    const cfgRes = await this.db.from("mcq_exams").insert({
      exam_id: examId,
      paper_id: input.paperId,
      duration_minutes: input.durationMinutes,
      attempt_limit: input.attemptLimit,
      shuffle_questions: input.shuffleQuestions,
      shuffle_options: input.shuffleOptions,
      negative_marking: input.negativeMarking,
      pass_percentage: input.passPercentage,
      window_start: input.windowStart ?? null,
      window_end: input.windowEnd ?? null,
      result_release: input.resultRelease,
      result_release_at: input.resultReleaseAt ?? null,
      live_status: "not_started",
      allow_resume: input.allowResume,
    } as never);
    if (cfgRes.error) throw AppError.fromSupabase(cfgRes.error, "mcq exam");

    await this.writeAssignments(examId, input.assignments);
    return this.getById(examId);
  }

  async update(examId: string, input: McqExamInput): Promise<McqExam> {
    const paper = (await this.papersByIds([input.paperId])).get(input.paperId);
    const totalMarks = Number(paper?.total_marks ?? 0);
    const passMarks = round2((totalMarks * input.passPercentage) / 100);

    const examUpd = await this.db
      .from("exams")
      .update({
        title: input.title,
        standard_id: input.standardId ?? null,
        standard_name: input.standardName ?? null,
        batch_id: input.batchId ?? null,
        batch_name: input.batchName ?? null,
        subject_id: input.subjectId ?? null,
        subject_name: input.subjectName ?? null,
        total_marks: totalMarks,
        pass_marks: passMarks,
        duration_minutes: input.durationMinutes,
        instructions: input.instructions ?? null,
        exam_date: input.examDate ?? null,
      } as never)
      .eq("id", examId);
    if (examUpd.error) throw AppError.fromSupabase(examUpd.error, "exam");

    const cfgUpd = await this.db
      .from("mcq_exams")
      .update({
        paper_id: input.paperId,
        duration_minutes: input.durationMinutes,
        attempt_limit: input.attemptLimit,
        shuffle_questions: input.shuffleQuestions,
        shuffle_options: input.shuffleOptions,
        negative_marking: input.negativeMarking,
        pass_percentage: input.passPercentage,
        window_start: input.windowStart ?? null,
        window_end: input.windowEnd ?? null,
        result_release: input.resultRelease,
        result_release_at: input.resultReleaseAt ?? null,
        allow_resume: input.allowResume,
      } as never)
      .eq("exam_id", examId);
    if (cfgUpd.error) throw AppError.fromSupabase(cfgUpd.error, "mcq exam");

    await this.writeAssignments(examId, input.assignments);
    return this.getById(examId);
  }

  /** Publish / unpublish — toggles the `exams.status` draft ↔ scheduled. */
  async setPublished(examId: string, published: boolean): Promise<void> {
    const { error } = await this.db
      .from("exams")
      .update({ status: published ? "scheduled" : "draft" } as never)
      .eq("id", examId);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  /** Runtime live status — start / pause / resume / end the exam. */
  async setLiveStatus(examId: string, liveStatus: LiveStatus): Promise<void> {
    const { error } = await this.db
      .from("mcq_exams")
      .update({ live_status: liveStatus } as never)
      .eq("exam_id", examId);
    if (error) throw AppError.fromSupabase(error, "mcq exam");
    if (liveStatus === "ended") {
      await this.db
        .from("exams")
        .update({ status: "completed" } as never)
        .eq("id", examId);
    }
  }

  /** Manually release results (result_release = 'manual'). */
  async releaseResults(examId: string): Promise<void> {
    const { error } = await this.db
      .from("exams")
      .update({ results_status: "published" } as never)
      .eq("id", examId);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  async remove(examId: string): Promise<void> {
    // FK cascades drop mcq_exams, assignments, attempts, answers, events.
    const { error } = await this.db.from("exams").delete().eq("id", examId);
    if (error) throw AppError.fromSupabase(error, "exam");
  }

  async overview(): Promise<McqExamOverview> {
    const exams = await this.list();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    let attemptsToday = 0;
    const attRes = await this.db
      .from("mcq_attempts")
      .select("started_at")
      .gte("started_at", `${todayPrefix}T00:00:00`);
    if (!attRes.error) {
      attemptsToday = ((attRes.data as unknown[]) ?? []).length;
    }
    return {
      total: exams.length,
      live: exams.filter((e) => e.liveStatus === "live").length,
      scheduled: exams.filter(
        (e) => e.status === "scheduled" && e.liveStatus !== "ended",
      ).length,
      completed: exams.filter(
        (e) => e.status === "completed" || e.liveStatus === "ended",
      ).length,
      attemptsToday,
    };
  }

  /**
   * Resolve the assigned student roster from the exam's scopes.
   *
   * Reads the WHOLE active roster and filters it with the shared targeting
   * rules, rather than building a batch-id query per scope. Three reasons:
   * `all` and `student` cannot be expressed as a batch filter at all; an exam
   * with no assignments means "everyone", which a batch query returns as zero;
   * and one filter shared with the server is one fewer place for the browser's
   * preview and the server's decision to disagree.
   *
   * RLS scopes the read to the caller's own organization, so "the whole roster"
   * is never another tenant's.
   */
  async resolveRoster(exam: McqExam): Promise<RosterStudent[]> {
    const drafts: AssignmentDraft[] = exam.assignments.map((a) => ({
      scopeType: a.scopeType,
      scopeId: a.scopeId ?? "",
      scopeName: a.scopeName ?? "",
    }));
    // An exam pinned to one batch carries that as an implicit assignment.
    if (exam.batchId) {
      drafts.push({
        scopeType: "batch",
        scopeId: exam.batchId,
        scopeName: exam.batchName ?? "",
      });
    }

    const { data, error } = await this.db
      .from("students")
      .select("id, name, roll_number, batch_id, standard_id, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return [];
    const batchNames = new Map(
      exam.assignments
        .filter((a) => a.scopeType === "batch")
        .map((a) => [a.scopeId ?? "", a.scopeName ?? ""]),
    );
    return (
      (data as {
        id: string;
        name: string;
        roll_number: string | null;
        batch_id: string | null;
        standard_id: string | null;
        is_active: boolean | null;
      }[]) ?? []
    )
      .filter((s) =>
        isTargeted(drafts, {
          id: s.id,
          batchId: s.batch_id,
          standardId: s.standard_id,
          isActive: s.is_active !== false,
        }),
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        rollNumber: s.roll_number ?? undefined,
        batchId: s.batch_id ?? undefined,
        batchName: s.batch_id ? batchNames.get(s.batch_id) : undefined,
      }));
  }

  /**
   * MCQ exams visible to one student.
   *
   * Filtered with the SAME rules the server enforces, so the list a student is
   * shown and the list they can actually open cannot diverge. This is still a
   * presentation filter: the decision that admits them is `isEligible()` in
   * _shared/testEngine.ts, re-run on every attempt.
   */
  async listForStudent(
    studentId: string,
    batchId?: string,
    standardId?: string,
  ): Promise<McqExam[]> {
    const all = await this.list();
    const student = { id: studentId, batchId, standardId, isActive: true };
    return all.filter((e) => {
      if (e.status === "draft") return false;
      if (batchId && e.batchId === batchId) return true;
      return isTargeted(
        e.assignments.map((a) => ({
          scopeType: a.scopeType,
          scopeId: a.scopeId ?? "",
          scopeName: a.scopeName ?? "",
        })),
        student,
      );
    });
  }
}

export const mcqExamService = new McqExamService();
