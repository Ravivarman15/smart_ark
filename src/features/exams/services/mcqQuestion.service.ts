import { BaseService, AppError } from "@/shared/services";
import { normalizeQuestionText } from "../utils/mcqScoring";
import { MCQ_QUESTION_TYPES } from "../types/mcq.types";
import type {
  BloomLevel,
  MatchPair,
  McqDifficulty,
  McqOption,
  McqQuestion,
  McqQuestionInput,
  McqQuestionStatus,
  McqQuestionType,
  NumericalAnswer,
  QuestionBankFilters,
  SubQuestion,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ question-bank service — CRUD + search/filter for the reusable bank.
//
// The bank is shared infrastructure: papers reference questions, never copy
// them. `list` merges per-user favourites client-side; `findDuplicates` powers
// duplicate detection in the editor and bulk import; `bumpUsage` feeds the
// "recently used" scope and usage tracking — best-effort so it never blocks a
// paper save.
// ─────────────────────────────────────────────────────────────────────────────

type QuestionRow = {
  id: string;
  question_text: string;
  question_type: string;
  subject_id: string | null;
  subject_name: string | null;
  chapter: string | null;
  topic: string | null;
  difficulty: string;
  marks: number | null;
  negative_marks: number | null;
  options: McqOption[] | null;
  numerical_answer: NumericalAnswer | null;
  explanation: string | null;
  image_url: string | null;
  has_formula: boolean | null;
  status: string | null;
  is_global: boolean | null;
  usage_count: number | null;
  last_used_at: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  // AI-importer columns
  bloom_level: string | null;
  tags: string[] | null;
  board: string | null;
  standard_id: string | null;
  answer_text: string | null;
  match_pairs: MatchPair[] | null;
  sub_questions: SubQuestion[] | null;
  auto_evaluable: boolean | null;
  text_hash: string | null;
  source_import_id: string | null;
};

// Driven off the canonical list so a newly-supported type (the AI importer
// added fill_ups, match_following, essay, …) is never silently coerced to
// "single" on read.
const KNOWN_TYPES = new Set<string>(MCQ_QUESTION_TYPES.map((t) => t.value));

const normType = (t?: string | null): McqQuestionType =>
  t && KNOWN_TYPES.has(t) ? (t as McqQuestionType) : "single";

const normDifficulty = (d?: string | null): McqDifficulty =>
  d === "easy" || d === "hard" ? d : "medium";

const normStatus = (s?: string | null): McqQuestionStatus =>
  s === "published" ? "published" : "draft";

const toDomain = (r: QuestionRow): McqQuestion => ({
  id: r.id,
  questionText: r.question_text,
  questionType: normType(r.question_type),
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subject_name ?? undefined,
  chapter: r.chapter ?? undefined,
  topic: r.topic ?? undefined,
  difficulty: normDifficulty(r.difficulty),
  marks: Number(r.marks ?? 1),
  negativeMarks: Number(r.negative_marks ?? 0),
  options: Array.isArray(r.options) ? r.options : [],
  numericalAnswer: r.numerical_answer ?? null,
  explanation: r.explanation ?? undefined,
  imageUrl: r.image_url ?? undefined,
  hasFormula: !!r.has_formula,
  status: normStatus(r.status),
  isGlobal: !!r.is_global,
  usageCount: Number(r.usage_count ?? 0),
  lastUsedAt: r.last_used_at ?? undefined,
  ownerId: r.owner_id ?? undefined,
  ownerName: r.owner_name ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  bloomLevel: (r.bloom_level as BloomLevel | null) ?? undefined,
  tags: Array.isArray(r.tags) ? r.tags : [],
  board: r.board ?? undefined,
  standardId: r.standard_id ?? undefined,
  answerText: r.answer_text ?? undefined,
  matchPairs: Array.isArray(r.match_pairs) ? r.match_pairs : [],
  subQuestions: Array.isArray(r.sub_questions) ? r.sub_questions : [],
  // Older rows predate the column — default to auto-evaluable so existing
  // MCQ papers keep grading exactly as they did.
  autoEvaluable: r.auto_evaluable ?? true,
  sourceImportId: r.source_import_id ?? undefined,
});

const toDb = (i: Partial<McqQuestionInput>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (i.questionText !== undefined) out.question_text = i.questionText;
  if (i.questionType !== undefined) out.question_type = i.questionType;
  if (i.subjectId !== undefined) out.subject_id = i.subjectId ?? null;
  if (i.subjectName !== undefined) out.subject_name = i.subjectName ?? null;
  if (i.chapter !== undefined) out.chapter = i.chapter ?? null;
  if (i.topic !== undefined) out.topic = i.topic ?? null;
  if (i.difficulty !== undefined) out.difficulty = i.difficulty;
  if (i.marks !== undefined) out.marks = i.marks;
  if (i.negativeMarks !== undefined) out.negative_marks = i.negativeMarks;
  if (i.options !== undefined) out.options = i.options;
  if (i.numericalAnswer !== undefined)
    out.numerical_answer = i.numericalAnswer ?? null;
  if (i.explanation !== undefined) out.explanation = i.explanation ?? null;
  if (i.imageUrl !== undefined) out.image_url = i.imageUrl ?? null;
  if (i.hasFormula !== undefined) out.has_formula = i.hasFormula;
  if (i.status !== undefined) out.status = i.status;
  if (i.isGlobal !== undefined) out.is_global = i.isGlobal;
  // AI-importer fields (20260714_question_paper_import.sql)
  if (i.bloomLevel !== undefined) out.bloom_level = i.bloomLevel ?? null;
  if (i.tags !== undefined) out.tags = i.tags;
  if (i.board !== undefined) out.board = i.board ?? null;
  if (i.standardId !== undefined) out.standard_id = i.standardId ?? null;
  if (i.answerText !== undefined) out.answer_text = i.answerText ?? null;
  if (i.matchPairs !== undefined) out.match_pairs = i.matchPairs;
  if (i.subQuestions !== undefined) out.sub_questions = i.subQuestions;
  if (i.autoEvaluable !== undefined) out.auto_evaluable = i.autoEvaluable;
  if (i.textHash !== undefined) out.text_hash = i.textHash ?? null;
  if (i.sourceImportId !== undefined) out.source_import_id = i.sourceImportId ?? null;
  return out;
};

export interface QuestionOwner {
  ownerId?: string;
  ownerName?: string;
  campusId?: string;
}

class McqQuestionService extends BaseService {
  /** Favourite question ids for one user. Best-effort — empty if unavailable. */
  private async favoriteIds(userId: string): Promise<Set<string>> {
    try {
      const { data, error } = await this.db
        .from("mcq_question_favorites")
        .select("question_id")
        .eq("user_id", userId);
      if (error) return new Set();
      return new Set(
        ((data as { question_id: string }[]) ?? []).map((r) => r.question_id),
      );
    } catch {
      return new Set();
    }
  }

  /** Search + filter the question bank. `isFavorite` is merged per user. */
  async list(
    filters: QuestionBankFilters = {},
    userId?: string,
  ): Promise<McqQuestion[]> {
    const favIds = userId ? await this.favoriteIds(userId) : new Set<string>();

    let q = this.db.from("mcq_questions").select("*");
    if (filters.subjectId) q = q.eq("subject_id", filters.subjectId);
    if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
    if (filters.questionType) q = q.eq("question_type", filters.questionType);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.chapter) q = q.ilike("chapter", `%${filters.chapter}%`);
    if (filters.topic) q = q.ilike("topic", `%${filters.topic}%`);
    if (filters.search) q = q.ilike("question_text", `%${filters.search}%`);
    if (filters.scope === "mine" && userId) q = q.eq("owner_id", userId);
    if (filters.scope === "global") q = q.eq("is_global", true);
    if (filters.scope === "favorites") {
      const ids = Array.from(favIds);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }

    const res =
      filters.scope === "recent"
        ? await q
            .not("last_used_at", "is", null)
            .order("last_used_at", { ascending: false })
            .limit(60)
        : await q.order("created_at", { ascending: false }).limit(300);

    const rows = this.guardList(res, "mcq_questions");
    return (rows as unknown as QuestionRow[]).map((r) => {
      const dom = toDomain(r);
      dom.isFavorite = favIds.has(r.id);
      return dom;
    });
  }

  async getById(id: string): Promise<McqQuestion> {
    const res = await this.db
      .from("mcq_questions")
      .select("*")
      .eq("id", id)
      .single();
    return toDomain(this.guard(res, "mcq question") as unknown as QuestionRow);
  }

  /** Fetch a set of questions by id — used by the paper builder + preview. */
  async byIds(ids: string[]): Promise<McqQuestion[]> {
    if (ids.length === 0) return [];
    const res = await this.db.from("mcq_questions").select("*").in("id", ids);
    const rows = this.guardList(res, "mcq_questions");
    return (rows as unknown as QuestionRow[]).map(toDomain);
  }

  /** Total questions in the bank — used by the Manage overview tile. */
  async count(): Promise<number> {
    const { count, error } = await this.db
      .from("mcq_questions")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  }

  async create(
    input: McqQuestionInput,
    owner: QuestionOwner = {},
  ): Promise<McqQuestion> {
    const payload = {
      ...toDb({ status: "draft", ...input }),
      owner_id: owner.ownerId ?? null,
      owner_name: owner.ownerName ?? null,
      campus_id: owner.campusId ?? null,
      created_by: owner.ownerId ?? null,
    };
    const res = await this.db
      .from("mcq_questions")
      .insert(payload as never)
      .select("*")
      .single();
    return toDomain(this.guard(res, "mcq question") as unknown as QuestionRow);
  }

  /**
   * Batch-create questions in one round trip, returning the new ids in the
   * SAME order as the inputs. Used by the AI paper importer, which commits a
   * whole paper at once — one insert instead of fifty.
   *
   * Supabase returns inserted rows in input order for a bulk insert, so the
   * positional mapping the caller relies on is safe.
   */
  async createMany(
    inputs: McqQuestionInput[],
    owner: QuestionOwner = {},
  ): Promise<string[]> {
    if (inputs.length === 0) return [];
    const payload = inputs.map((input) => ({
      ...toDb({ status: "draft", ...input }),
      owner_id: owner.ownerId ?? null,
      owner_name: owner.ownerName ?? null,
      campus_id: owner.campusId ?? null,
      created_by: owner.ownerId ?? null,
    }));
    const { data, error } = await this.db
      .from("mcq_questions")
      .insert(payload as never)
      .select("id");
    if (error) throw AppError.fromSupabase(error, "mcq questions");
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  async update(id: string, input: Partial<McqQuestionInput>): Promise<void> {
    const payload = toDb(input);
    if (Object.keys(payload).length === 0) return;
    const { error } = await this.db
      .from("mcq_questions")
      .update(payload as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq question");
  }

  async setStatus(id: string, status: McqQuestionStatus): Promise<void> {
    const { error } = await this.db
      .from("mcq_questions")
      .update({ status } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq question");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db
      .from("mcq_questions")
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "mcq question");
  }

  /** Add / remove a favourite for a user. */
  async toggleFavorite(
    questionId: string,
    userId: string,
    makeFavorite: boolean,
  ): Promise<void> {
    if (makeFavorite) {
      const { error } = await this.db
        .from("mcq_question_favorites")
        .upsert({ question_id: questionId, user_id: userId } as never, {
          onConflict: "question_id,user_id",
        });
      if (error) throw AppError.fromSupabase(error, "favorite");
    } else {
      const { error } = await this.db
        .from("mcq_question_favorites")
        .delete()
        .eq("question_id", questionId)
        .eq("user_id", userId);
      if (error) throw AppError.fromSupabase(error, "favorite");
    }
  }

  /** Distinct chapter names — feeds the chapter filter + weightage editor. */
  async distinctChapters(subjectId?: string): Promise<string[]> {
    let q = this.db.from("mcq_questions").select("chapter");
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) return [];
    const set = new Set<string>();
    for (const r of (data as { chapter: string | null }[]) ?? []) {
      if (r.chapter && r.chapter.trim()) set.add(r.chapter.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Questions whose normalised text matches `text` — duplicate detection for
   * the editor and bulk import. Compared in JS (normalisation isn't SQL-cheap).
   */
  async findDuplicates(
    text: string,
    opts: { excludeId?: string; subjectId?: string } = {},
  ): Promise<McqQuestion[]> {
    const norm = normalizeQuestionText(text);
    if (norm.length < 5) return [];
    let q = this.db.from("mcq_questions").select("*").limit(500);
    if (opts.subjectId) q = q.eq("subject_id", opts.subjectId);
    const { data, error } = await q;
    if (error) return [];
    return ((data as unknown as QuestionRow[]) ?? [])
      .map(toDomain)
      .filter(
        (d) =>
          d.id !== opts.excludeId &&
          normalizeQuestionText(d.questionText) === norm,
      );
  }

  /**
   * Bump usage counters for a set of questions (called when a paper saves its
   * question list). Best-effort — usage tracking must never fail a paper save.
   */
  async bumpUsage(questionIds: string[]): Promise<void> {
    if (questionIds.length === 0) return;
    try {
      const { data } = await this.db
        .from("mcq_questions")
        .select("id, usage_count")
        .in("id", questionIds);
      const now = new Date().toISOString();
      await Promise.all(
        ((data as { id: string; usage_count: number | null }[]) ?? []).map(
          (r) =>
            this.db
              .from("mcq_questions")
              .update({
                usage_count: (Number(r.usage_count) || 0) + 1,
                last_used_at: now,
              } as never)
              .eq("id", r.id),
        ),
      );
    } catch {
      /* usage tracking is best-effort */
    }
  }
}

export const mcqQuestionService = new McqQuestionService();
