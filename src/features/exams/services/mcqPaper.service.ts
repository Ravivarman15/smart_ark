import { BaseService, AppError } from "@/shared/services";
import {
  effectiveMarks,
  estimateDifficultyScore,
  paperTotalMarks,
} from "../utils/mcqScoring";
import { mcqQuestionService, type QuestionOwner } from "./mcqQuestion.service";
import type {
  GenerationRules,
  McqGenerationMode,
  McqPaper,
  McqPaperInput,
  McqPaperOverview,
  McqPaperStatus,
  McqPaperVersion,
  PaperQuestionDraft,
  PaperQuestionView,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ paper service — CRUD + lifecycle for paper definitions.
//
// `saveQuestions` is the single write path for a paper's question set: it
// replaces the junction rows, RECOMPUTES totals + difficulty score through the
// centralised scoring layer (never trusts caller-supplied figures), bumps the
// paper version, writes a version-history snapshot, and bumps question usage.
// Clone deep-copies a paper; archive is a soft status; nothing is ever lost.
// ─────────────────────────────────────────────────────────────────────────────

type PaperRow = {
  id: string;
  title: string;
  subject_id: string | null;
  subject_name: string | null;
  standard_id: string | null;
  standard_name: string | null;
  description: string | null;
  instructions: string | null;
  total_marks: number | null;
  total_questions: number | null;
  duration_minutes: number | null;
  negative_marking: boolean | null;
  difficulty_score: number | null;
  set_count: number | null;
  randomize: boolean | null;
  generation_mode: string | null;
  generation_rules: GenerationRules | Record<string, never> | null;
  status: string | null;
  version: number | null;
  usage_count: number | null;
  owner_id: string | null;
  owner_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type JunctionRow = {
  id: string;
  paper_id: string;
  question_id: string;
  set_label: string | null;
  sort_order: number | null;
  marks_override: number | null;
};

type VersionRow = {
  id: string;
  paper_id: string;
  version: number;
  summary: string | null;
  changed_by_name: string | null;
  snapshot: unknown;
  created_at: string;
};

const normStatus = (s?: string | null): McqPaperStatus =>
  s === "published" || s === "archived" ? s : "draft";

const normMode = (m?: string | null): McqGenerationMode =>
  m === "auto" ? "auto" : "manual";

const hasRules = (
  r: PaperRow["generation_rules"],
): r is GenerationRules =>
  !!r && typeof r === "object" && "totalQuestions" in r;

const toDomain = (r: PaperRow): McqPaper => ({
  id: r.id,
  title: r.title,
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subject_name ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: r.standard_name ?? undefined,
  description: r.description ?? undefined,
  instructions: r.instructions ?? undefined,
  totalMarks: Number(r.total_marks ?? 0),
  totalQuestions: Number(r.total_questions ?? 0),
  durationMinutes: Number(r.duration_minutes ?? 60),
  negativeMarking: !!r.negative_marking,
  difficultyScore: Number(r.difficulty_score ?? 0),
  setCount: Number(r.set_count ?? 1),
  randomize: !!r.randomize,
  generationMode: normMode(r.generation_mode),
  generationRules: hasRules(r.generation_rules) ? r.generation_rules : null,
  status: normStatus(r.status),
  version: Number(r.version ?? 1),
  usageCount: Number(r.usage_count ?? 0),
  ownerId: r.owner_id ?? undefined,
  ownerName: r.owner_name ?? undefined,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toDb = (i: Partial<McqPaperInput>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.title !== undefined) out.title = i.title;
  if (i.subjectId !== undefined) out.subject_id = i.subjectId ?? null;
  if (i.subjectName !== undefined) out.subject_name = i.subjectName ?? null;
  if (i.standardId !== undefined) out.standard_id = i.standardId ?? null;
  if (i.standardName !== undefined) out.standard_name = i.standardName ?? null;
  if (i.description !== undefined) out.description = i.description ?? null;
  if (i.instructions !== undefined) out.instructions = i.instructions ?? null;
  if (i.durationMinutes !== undefined)
    out.duration_minutes = i.durationMinutes;
  if (i.negativeMarking !== undefined)
    out.negative_marking = i.negativeMarking;
  if (i.setCount !== undefined) out.set_count = i.setCount;
  if (i.randomize !== undefined) out.randomize = i.randomize;
  if (i.generationMode !== undefined) out.generation_mode = i.generationMode;
  if (i.generationRules !== undefined)
    out.generation_rules = i.generationRules ?? {};
  if (i.status !== undefined) out.status = i.status;
  return out;
};

interface ListParams {
  status?: McqPaperStatus;
  subjectId?: string;
  search?: string;
}

interface PaperActor {
  actorId?: string;
  actorName?: string;
}

class McqPaperService extends BaseService {
  async list(params: ListParams = {}): Promise<McqPaper[]> {
    let q = this.db.from("mcq_papers").select("*");
    if (params.status) q = q.eq("status", params.status);
    if (params.subjectId) q = q.eq("subject_id", params.subjectId);
    if (params.search) q = q.ilike("title", `%${params.search}%`);
    const res = await q.order("created_at", { ascending: false });
    const rows = this.guardList(res, "mcq_papers");
    return (rows as unknown as PaperRow[]).map(toDomain);
  }

  async getById(id: string): Promise<McqPaper> {
    const res = await this.db
      .from("mcq_papers")
      .select("*")
      .eq("id", id)
      .single();
    return toDomain(this.guard(res, "mcq paper") as unknown as PaperRow);
  }

  /** Paper questions joined with their full bank records, ordered. */
  async getQuestions(paperId: string): Promise<PaperQuestionView[]> {
    const jres = await this.db
      .from("mcq_paper_questions")
      .select("*")
      .eq("paper_id", paperId)
      .order("sort_order", { ascending: true });
    const junction = this.guardList(
      jres,
      "mcq_paper_questions",
    ) as unknown as JunctionRow[];
    if (junction.length === 0) return [];

    const questions = await mcqQuestionService.byIds(
      junction.map((j) => j.question_id),
    );
    const byId = new Map(questions.map((q) => [q.id, q]));

    return junction
      .filter((j) => byId.has(j.question_id))
      .map((j) => {
        const q = byId.get(j.question_id)!;
        const override =
          j.marks_override == null ? null : Number(j.marks_override);
        return {
          ...q,
          paperQuestionId: j.id,
          setLabel: j.set_label ?? "A",
          sortOrder: Number(j.sort_order ?? 0),
          marksOverride: override,
          effectiveMarks: effectiveMarks(q.marks, override),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(
    input: McqPaperInput,
    owner: QuestionOwner = {},
  ): Promise<McqPaper> {
    const payload = {
      ...toDb({ status: "draft", ...input }),
      owner_id: owner.ownerId ?? null,
      owner_name: owner.ownerName ?? null,
      campus_id: owner.campusId ?? null,
      created_by: owner.ownerId ?? null,
    };
    const res = await this.db
      .from("mcq_papers")
      .insert(payload as never)
      .select("*")
      .single();
    return toDomain(this.guard(res, "mcq paper") as unknown as PaperRow);
  }

  async update(id: string, input: Partial<McqPaperInput>): Promise<void> {
    const payload = toDb(input);
    if (Object.keys(payload).length === 0) return;
    const { error } = await this.db
      .from("mcq_papers")
      .update(payload as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq paper");
  }

  async setStatus(id: string, status: McqPaperStatus): Promise<void> {
    const { error } = await this.db
      .from("mcq_papers")
      .update({ status } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq paper");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("mcq_papers").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq paper");
  }

  /**
   * Replace a paper's question set. Totals + difficulty score are recomputed
   * here through the scoring layer — the caller's figures are never trusted.
   * Bumps the version, snapshots history and tracks question usage.
   */
  async saveQuestions(
    paperId: string,
    drafts: PaperQuestionDraft[],
    actor: PaperActor = {},
  ): Promise<void> {
    const paper = await this.getById(paperId);
    const questions = await mcqQuestionService.byIds(
      drafts.map((d) => d.questionId),
    );
    const byId = new Map(questions.map((q) => [q.id, q]));
    const valid = drafts.filter((d) => byId.has(d.questionId));

    // Replace the junction rows.
    const del = await this.db
      .from("mcq_paper_questions")
      .delete()
      .eq("paper_id", paperId);
    if (del.error) throw AppError.fromSupabase(del.error, "paper questions");

    if (valid.length > 0) {
      const payload = valid.map((d, i) => ({
        paper_id: paperId,
        question_id: d.questionId,
        set_label: d.setLabel ?? "A",
        sort_order: d.sortOrder ?? i,
        marks_override: d.marksOverride ?? null,
      }));
      const ins = await this.db
        .from("mcq_paper_questions")
        .insert(payload as never);
      if (ins.error) throw AppError.fromSupabase(ins.error, "paper questions");
    }

    // Recompute totals through the centralised scoring layer.
    const withMarks = valid.map((d) => {
      const q = byId.get(d.questionId)!;
      return {
        difficulty: q.difficulty,
        chapter: q.chapter,
        effectiveMarks: effectiveMarks(q.marks, d.marksOverride),
      };
    });
    const totalMarks = paperTotalMarks(withMarks);
    const difficultyScore = estimateDifficultyScore(withMarks);
    const nextVersion = (paper.version ?? 1) + 1;

    const upd = await this.db
      .from("mcq_papers")
      .update({
        total_marks: totalMarks,
        total_questions: valid.length,
        difficulty_score: difficultyScore,
        version: nextVersion,
      } as never)
      .eq("id", paperId);
    if (upd.error) throw AppError.fromSupabase(upd.error, "mcq paper");

    // Version-history snapshot — best-effort.
    try {
      await this.db.from("mcq_paper_versions").insert({
        paper_id: paperId,
        version: nextVersion,
        summary: `${valid.length} questions · ${totalMarks} marks`,
        changed_by: actor.actorId ?? null,
        changed_by_name: actor.actorName ?? null,
        snapshot: {
          title: paper.title,
          totalMarks,
          totalQuestions: valid.length,
          difficultyScore,
          questionIds: valid.map((v) => v.questionId),
          savedAt: new Date().toISOString(),
        },
      } as never);
    } catch {
      /* version history is best-effort */
    }

    // Usage tracking — best-effort.
    await mcqQuestionService.bumpUsage(valid.map((v) => v.questionId));
  }

  /** Deep-copy a paper (meta + question set) into a fresh draft. */
  async clone(id: string, owner: QuestionOwner = {}): Promise<McqPaper> {
    const src = await this.getById(id);
    const jres = await this.db
      .from("mcq_paper_questions")
      .select("*")
      .eq("paper_id", id);
    const junction = this.guardList(
      jres,
      "mcq_paper_questions",
    ) as unknown as JunctionRow[];

    const created = await this.create(
      {
        title: `${src.title} (Copy)`,
        subjectId: src.subjectId ?? null,
        subjectName: src.subjectName ?? null,
        standardId: src.standardId ?? null,
        standardName: src.standardName ?? null,
        description: src.description ?? null,
        instructions: src.instructions ?? null,
        durationMinutes: src.durationMinutes,
        negativeMarking: src.negativeMarking,
        setCount: src.setCount,
        randomize: src.randomize,
        generationMode: src.generationMode,
        generationRules: src.generationRules ?? null,
        status: "draft",
      },
      owner,
    );

    if (junction.length > 0) {
      const payload = junction.map((j) => ({
        paper_id: created.id,
        question_id: j.question_id,
        set_label: j.set_label ?? "A",
        sort_order: Number(j.sort_order ?? 0),
        marks_override: j.marks_override ?? null,
      }));
      await this.db.from("mcq_paper_questions").insert(payload as never);
    }

    await this.db
      .from("mcq_papers")
      .update({
        total_marks: src.totalMarks,
        total_questions: src.totalQuestions,
        difficulty_score: src.difficultyScore,
      } as never)
      .eq("id", created.id);

    return {
      ...created,
      totalMarks: src.totalMarks,
      totalQuestions: src.totalQuestions,
      difficultyScore: src.difficultyScore,
    };
  }

  /** Paper-count tiles for the Manage hub. */
  async overview(): Promise<McqPaperOverview> {
    let totalPapers = 0;
    let draft = 0;
    let published = 0;
    let archived = 0;
    const res = await this.db.from("mcq_papers").select("status");
    if (!res.error) {
      for (const r of (res.data as { status: string | null }[]) ?? []) {
        totalPapers += 1;
        if (r.status === "published") published += 1;
        else if (r.status === "archived") archived += 1;
        else draft += 1;
      }
    }
    const bankQuestions = await mcqQuestionService.count();
    return { totalPapers, draft, published, archived, bankQuestions };
  }

  /** Version history of a paper, newest first. Empty if unavailable. */
  async listVersions(paperId: string): Promise<McqPaperVersion[]> {
    const { data, error } = await this.db
      .from("mcq_paper_versions")
      .select("*")
      .eq("paper_id", paperId)
      .order("version", { ascending: false });
    if (error) return [];
    return ((data as unknown as VersionRow[]) ?? []).map((r) => ({
      id: r.id,
      paperId: r.paper_id,
      version: r.version,
      summary: r.summary ?? undefined,
      changedByName: r.changed_by_name ?? undefined,
      createdAt: r.created_at,
      snapshot: r.snapshot,
    }));
  }
}

export const mcqPaperService = new McqPaperService();
