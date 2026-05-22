-- ════════════════════════════════════════════════════════════════════════════
-- EXAM MODULE — MCQ Paper phase   (2026-05-23)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Creates six NEW tables for the question bank + MCQ paper builder:
--   mcq_questions          — the reusable question bank
--   mcq_question_favorites — per-user favourite questions
--   mcq_papers             — MCQ paper definitions
--   mcq_paper_questions    — paper ↔ question junction (per set, ordered)
--   mcq_paper_versions     — paper version-history snapshots
--   mcq_audit              — audit-safe lifecycle trail (papers + questions)
--
-- Does NOT touch the Manual-Exam tables (exams / exam_results / exam_audit),
-- the legacy test_results / retests, or anything AppDataContext reads. The MCQ
-- paper system is a self-contained parallel module — the `exams.mode = 'mcq'`
-- column reserved in the Manual phase is what the NEXT phase (MCQ Exam engine)
-- will use to attach a paper to a schedulable exam. No rebuild required.
-- ════════════════════════════════════════════════════════════════════════════

-- ── mcq_questions — the question bank ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text    TEXT NOT NULL,
  -- 'single' | 'multiple' | 'true_false' | 'assertion_reason' | 'numerical'
  question_type    TEXT NOT NULL DEFAULT 'single',
  subject_id       UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name     TEXT,
  chapter          TEXT,
  topic            TEXT,
  -- 'easy' | 'medium' | 'hard'
  difficulty       TEXT NOT NULL DEFAULT 'medium',
  marks            NUMERIC(6,2) NOT NULL DEFAULT 1,
  negative_marks   NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- [{ id, text, isCorrect, imageUrl? }]
  options          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { value, tolerance } for numerical questions
  numerical_answer JSONB,
  explanation      TEXT,
  image_url        TEXT,
  has_formula      BOOLEAN NOT NULL DEFAULT false,
  -- 'draft' | 'published'
  status           TEXT NOT NULL DEFAULT 'draft',
  -- shared / global bank flag (a global question is reusable by everyone)
  is_global        BOOLEAN NOT NULL DEFAULT false,
  usage_count      INTEGER NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  owner_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name       TEXT,
  campus_id        UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_subject    ON public.mcq_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_chapter    ON public.mcq_questions(chapter);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_difficulty ON public.mcq_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_type       ON public.mcq_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_status     ON public.mcq_questions(status);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_owner      ON public.mcq_questions(owner_id);

-- ── mcq_question_favorites — per-user favourites ────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_question_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.mcq_questions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mcq_favorites_user ON public.mcq_question_favorites(user_id);

-- ── mcq_papers — MCQ paper definitions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_papers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  subject_id       UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name     TEXT,
  standard_id      UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  standard_name    TEXT,
  description      TEXT,
  instructions     TEXT,
  total_marks      NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_questions  INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  negative_marking BOOLEAN NOT NULL DEFAULT false,
  -- estimated paper difficulty, 0-100 — written by the centralised scoring layer
  difficulty_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- multiple paper sets (the exam engine materialises N shuffled sets later)
  set_count        INTEGER NOT NULL DEFAULT 1,
  randomize        BOOLEAN NOT NULL DEFAULT false,
  -- 'manual' | 'auto'
  generation_mode  TEXT NOT NULL DEFAULT 'manual',
  -- { totalQuestions, difficultyMix, chapterWeightage, marksPerQuestion, ... }
  generation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'draft' | 'published' | 'archived'
  status           TEXT NOT NULL DEFAULT 'draft',
  version          INTEGER NOT NULL DEFAULT 1,
  usage_count      INTEGER NOT NULL DEFAULT 0,
  owner_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name       TEXT,
  campus_id        UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_papers_subject ON public.mcq_papers(subject_id);
CREATE INDEX IF NOT EXISTS idx_mcq_papers_status  ON public.mcq_papers(status);
CREATE INDEX IF NOT EXISTS idx_mcq_papers_owner   ON public.mcq_papers(owner_id);

-- ── mcq_paper_questions — paper ↔ question junction ─────────────────────────
-- One row per (paper, question, set). For this phase every paper uses set 'A'
-- as its canonical question list; the unique key already supports materialised
-- multi-set papers when the MCQ Exam engine lands.
CREATE TABLE IF NOT EXISTS public.mcq_paper_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id       UUID NOT NULL REFERENCES public.mcq_papers(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.mcq_questions(id) ON DELETE CASCADE,
  set_label      TEXT NOT NULL DEFAULT 'A',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  marks_override NUMERIC(6,2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(paper_id, question_id, set_label)
);
CREATE INDEX IF NOT EXISTS idx_mcq_paper_questions_paper    ON public.mcq_paper_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_mcq_paper_questions_question ON public.mcq_paper_questions(question_id);

-- ── mcq_paper_versions — version-history snapshots ──────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_paper_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id         UUID NOT NULL REFERENCES public.mcq_papers(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  -- full { paper, questions } snapshot at the moment of the change
  snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary          TEXT,
  changed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_paper_versions_paper ON public.mcq_paper_versions(paper_id);

-- ── mcq_audit — audit-safe lifecycle trail ──────────────────────────────────
-- entity_id is intentionally NOT a foreign key so an audit row survives the
-- deletion of the paper / question it describes.
CREATE TABLE IF NOT EXISTS public.mcq_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'paper' | 'question'
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  -- 'created' | 'updated' | 'deleted' | 'cloned' | 'archived' | 'published' |
  -- 'questions_saved' | 'generated' | 'imported' | ...
  event_type  TEXT NOT NULL,
  detail      TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_audit_entity ON public.mcq_audit(entity_type, entity_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read: any authenticated user. Write: staff roles. Fine-grained ownership
-- (teacher → own papers/questions only) is enforced in the service + UI layer.
DO $$
DECLARE
  t TEXT;
  staff_write TEXT :=
    'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'',''teacher'')';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mcq_questions', 'mcq_question_favorites', 'mcq_papers',
    'mcq_paper_questions', 'mcq_paper_versions', 'mcq_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)',
      t);
    EXECUTE format(
      'CREATE POLICY "write %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
      t, staff_write);
  END LOOP;
END $$;

-- ── updated_at auto-maintain ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcq_questions_updated_at') THEN
    CREATE TRIGGER update_mcq_questions_updated_at
      BEFORE UPDATE ON public.mcq_questions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcq_papers_updated_at') THEN
    CREATE TRIGGER update_mcq_papers_updated_at
      BEFORE UPDATE ON public.mcq_papers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
