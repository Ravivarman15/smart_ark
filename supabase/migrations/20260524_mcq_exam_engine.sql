-- ════════════════════════════════════════════════════════════════════════════
-- EXAM MODULE — MCQ Exam Engine + Student Attempt System   (2026-05-24)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Creates five NEW tables for live MCQ exams and student attempts:
--   mcq_exams             — MCQ config for an `exams` row (mode = 'mcq')
--   mcq_exam_assignments  — multi-scope student assignment (standard/batch/subject)
--   mcq_attempts          — one student's attempt at an exam
--   mcq_answers           — per-question answer within an attempt
--   mcq_attempt_events    — autosave / anti-cheat / submission event log
--
-- Reuses, never rebuilds:
--   • `exams` (mode = 'mcq') — the schedulable exam record (Manual-Exam phase)
--   • `mcq_papers` / `mcq_paper_questions` / `mcq_questions` (MCQ Paper phase)
--   • `mcq_audit` — exam-level audit (entity_type extended to 'exam')
--
-- Does NOT alter `exams`, `mcq_papers`, `mcq_questions` or anything
-- AppDataContext reads. The MCQ exam engine attaches additively.
--
-- RLS — proctored / kiosk model: the student exam engine runs from a
-- standalone /exam route (cf. the public admission form). Attempt tables
-- therefore accept writes from `anon` as well as `authenticated`; exam config
-- stays staff-only. Production hardening = add a student JWT and tighten the
-- attempt policies to `auth.uid()`-scoped rows.
-- ════════════════════════════════════════════════════════════════════════════

-- ── mcq_exams — MCQ configuration for an exams row ──────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_exams (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id            UUID NOT NULL UNIQUE REFERENCES public.exams(id) ON DELETE CASCADE,
  paper_id           UUID REFERENCES public.mcq_papers(id) ON DELETE SET NULL,
  duration_minutes   INTEGER NOT NULL DEFAULT 60,
  attempt_limit      INTEGER NOT NULL DEFAULT 1,
  shuffle_questions  BOOLEAN NOT NULL DEFAULT false,
  shuffle_options    BOOLEAN NOT NULL DEFAULT false,
  negative_marking   BOOLEAN NOT NULL DEFAULT false,
  pass_percentage    NUMERIC(5,2) NOT NULL DEFAULT 35,
  window_start       TIMESTAMPTZ,
  window_end         TIMESTAMPTZ,
  -- 'immediate' | 'manual' | 'scheduled'
  result_release     TEXT NOT NULL DEFAULT 'immediate',
  result_release_at  TIMESTAMPTZ,
  -- 'not_started' | 'live' | 'paused' | 'ended'
  live_status        TEXT NOT NULL DEFAULT 'not_started',
  allow_resume       BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_exams_exam  ON public.mcq_exams(exam_id);
CREATE INDEX IF NOT EXISTS idx_mcq_exams_paper ON public.mcq_exams(paper_id);

-- ── mcq_exam_assignments — multi-scope student assignment ───────────────────
CREATE TABLE IF NOT EXISTS public.mcq_exam_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  -- 'standard' | 'batch' | 'subject'
  scope_type  TEXT NOT NULL,
  scope_id    UUID,
  scope_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_mcq_exam_assignments_exam ON public.mcq_exam_assignments(exam_id);

-- ── mcq_attempts — one student's attempt ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name        TEXT,
  batch_id            UUID,
  batch_name          TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  -- 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned'
  status              TEXT NOT NULL DEFAULT 'in_progress',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  time_spent_seconds  INTEGER NOT NULL DEFAULT 0,
  -- centrally-scored figures (written by the scoring layer, never the client)
  total_score         NUMERIC(8,2),
  max_score           NUMERIC(8,2),
  percentage          NUMERIC(5,2),
  accuracy            NUMERIC(5,2),
  correct_count       INTEGER,
  wrong_count         INTEGER,
  unattempted_count   INTEGER,
  rank                INTEGER,
  percentile          NUMERIC(5,2),
  is_pass             BOOLEAN,
  -- deterministic per-attempt shuffle: seed + frozen question order
  shuffle_seed        INTEGER NOT NULL DEFAULT 0,
  question_order      JSONB NOT NULL DEFAULT '[]'::jsonb,
  flags_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id, attempt_number)
);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_exam    ON public.mcq_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_student ON public.mcq_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_status  ON public.mcq_attempts(status);

-- ── mcq_answers — per-question answer ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcq_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          UUID NOT NULL REFERENCES public.mcq_attempts(id) ON DELETE CASCADE,
  question_id         UUID NOT NULL REFERENCES public.mcq_questions(id) ON DELETE CASCADE,
  selected_option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  numeric_value       NUMERIC,
  is_correct          BOOLEAN,
  awarded             NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_marks           NUMERIC(6,2) NOT NULL DEFAULT 0,
  marked_for_review   BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds  INTEGER NOT NULL DEFAULT 0,
  answered_at         TIMESTAMPTZ,
  UNIQUE(attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_mcq_answers_attempt  ON public.mcq_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_mcq_answers_question ON public.mcq_answers(question_id);

-- ── mcq_attempt_events — autosave / anti-cheat / submission trail ───────────
CREATE TABLE IF NOT EXISTS public.mcq_attempt_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  UUID NOT NULL REFERENCES public.mcq_attempts(id) ON DELETE CASCADE,
  -- 'started' | 'autosave' | 'tab_switch' | 'fullscreen_exit' |
  -- 'fullscreen_enter' | 'blur' | 'focus' | 'copy' | 'paste' | 'reconnect' |
  -- 'submit' | 'auto_submit' | 'force_submit' | 'reopen' | 'pause' | 'resume'
  event_type  TEXT NOT NULL,
  detail      TEXT,
  -- 'info' | 'warning' | 'critical'
  severity    TEXT NOT NULL DEFAULT 'info',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_attempt_events_attempt ON public.mcq_attempt_events(attempt_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  staff_write TEXT :=
    'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'',''teacher'')';
BEGIN
  -- All five tables: readable by everyone (the engine + monitoring panels).
  FOR i IN 1..5 LOOP NULL; END LOOP;

  -- mcq_exams / mcq_exam_assignments — staff-managed config.
  ALTER TABLE public.mcq_exams ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.mcq_exam_assignments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "read mcq_exams" ON public.mcq_exams;
  DROP POLICY IF EXISTS "write mcq_exams" ON public.mcq_exams;
  DROP POLICY IF EXISTS "read mcq_exam_assignments" ON public.mcq_exam_assignments;
  DROP POLICY IF EXISTS "write mcq_exam_assignments" ON public.mcq_exam_assignments;
  CREATE POLICY "read mcq_exams" ON public.mcq_exams
    FOR SELECT TO authenticated, anon USING (true);
  EXECUTE format(
    'CREATE POLICY "write mcq_exams" ON public.mcq_exams FOR ALL TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    staff_write);
  CREATE POLICY "read mcq_exam_assignments" ON public.mcq_exam_assignments
    FOR SELECT TO authenticated, anon USING (true);
  EXECUTE format(
    'CREATE POLICY "write mcq_exam_assignments" ON public.mcq_exam_assignments FOR ALL TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    staff_write);

  -- Attempt tables — read + write open to anon (proctored exam engine) and
  -- authenticated (staff monitoring / force actions).
  ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.mcq_answers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.mcq_attempt_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "all mcq_attempts" ON public.mcq_attempts;
  DROP POLICY IF EXISTS "all mcq_answers" ON public.mcq_answers;
  DROP POLICY IF EXISTS "all mcq_attempt_events" ON public.mcq_attempt_events;
  CREATE POLICY "all mcq_attempts" ON public.mcq_attempts
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  CREATE POLICY "all mcq_answers" ON public.mcq_answers
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  CREATE POLICY "all mcq_attempt_events" ON public.mcq_attempt_events
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
END $$;

-- The standalone /exam engine reads the exam, paper and questions as `anon`.
-- These ADD anon SELECT alongside the existing authenticated policies — the
-- earlier policies are left intact (additive).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'exams') THEN
    DROP POLICY IF EXISTS "anon read exams" ON public.exams;
    CREATE POLICY "anon read exams" ON public.exams
      FOR SELECT TO anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'mcq_papers') THEN
    DROP POLICY IF EXISTS "anon read mcq_papers" ON public.mcq_papers;
    CREATE POLICY "anon read mcq_papers" ON public.mcq_papers
      FOR SELECT TO anon USING (true);
    DROP POLICY IF EXISTS "anon read mcq_paper_questions" ON public.mcq_paper_questions;
    CREATE POLICY "anon read mcq_paper_questions" ON public.mcq_paper_questions
      FOR SELECT TO anon USING (true);
    DROP POLICY IF EXISTS "anon read mcq_questions" ON public.mcq_questions;
    CREATE POLICY "anon read mcq_questions" ON public.mcq_questions
      FOR SELECT TO anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'students') THEN
    DROP POLICY IF EXISTS "anon read students" ON public.students;
    CREATE POLICY "anon read students" ON public.students
      FOR SELECT TO anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'batches') THEN
    DROP POLICY IF EXISTS "anon read batches" ON public.batches;
    CREATE POLICY "anon read batches" ON public.batches
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ── updated_at auto-maintain ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcq_exams_updated_at') THEN
    CREATE TRIGGER update_mcq_exams_updated_at
      BEFORE UPDATE ON public.mcq_exams
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcq_attempts_updated_at') THEN
    CREATE TRIGGER update_mcq_attempts_updated_at
      BEFORE UPDATE ON public.mcq_attempts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
