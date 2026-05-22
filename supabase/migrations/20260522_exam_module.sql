-- ════════════════════════════════════════════════════════════════════════════
-- EXAM MODULE — Manual Exam phase   (2026-05-22)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Creates three NEW tables: exams, exam_results, exam_audit.
-- Does NOT touch the legacy `test_results` / `retests` tables — existing marks
-- and retest history are preserved untouched. The new exam module is a
-- self-contained parallel system; the KPI cache and RetestAnalytics keep
-- running on `test_results` exactly as before.
--
-- The `exams.mode` column ('manual' | 'mcq') reserves the table for the MCQ
-- phase, so MCQ papers/exams attach here additively later — no rebuild.
-- ════════════════════════════════════════════════════════════════════════════

-- ── exams — one exam definition ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  -- 'unit_test' | 'midterm' | 'final' | 'practical' | 'assignment' | 'other'
  exam_type        TEXT NOT NULL DEFAULT 'unit_test',
  -- 'manual' | 'mcq' — reserves the table for the MCQ phase
  mode             TEXT NOT NULL DEFAULT 'manual',
  standard_id      UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  standard_name    TEXT,
  batch_id         UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  batch_name       TEXT,
  subject_id       UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name     TEXT,
  total_marks      NUMERIC(8,2) NOT NULL DEFAULT 100,
  pass_marks       NUMERIC(8,2) NOT NULL DEFAULT 35,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  instructions     TEXT,
  exam_date        DATE,
  start_time       TEXT,
  end_time         TEXT,
  hall             TEXT,
  -- [{ grade, minPct, maxPct }] — empty = use the app default scheme
  grading_scheme   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ name, url }]
  attachments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'draft' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  status           TEXT NOT NULL DEFAULT 'scheduled',
  -- 'pending' | 'published' | 'locked'
  results_status   TEXT NOT NULL DEFAULT 'pending',
  campus_id        UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exams_batch    ON public.exams(batch_id);
CREATE INDEX IF NOT EXISTS idx_exams_standard ON public.exams(standard_id);
CREATE INDEX IF NOT EXISTS idx_exams_date     ON public.exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_exams_status   ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_mode     ON public.exams(mode);

-- ── exam_results — per-student marks for an exam ─────────────────────────────
-- Separate from the legacy `test_results` table by design: the old marks stay
-- exactly where they are.
CREATE TABLE IF NOT EXISTS public.exam_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name  TEXT,
  marks         NUMERIC(8,2),
  is_absent     BOOLEAN NOT NULL DEFAULT false,
  grade         TEXT,
  rank          INTEGER,
  remarks       TEXT,
  entered_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entered_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam    ON public.exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results(student_id);

-- ── exam_audit — audit-safe lifecycle trail ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  -- 'created' | 'updated' | 'rescheduled' | 'results_saved' | 'published' |
  -- 'unpublished' | 'locked' | 'deleted' | 'cancelled'
  event_type  TEXT NOT NULL,
  detail      TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_audit_exam ON public.exam_audit(exam_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  staff_write TEXT :=
    'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'',''teacher'')';
BEGIN
  FOREACH t IN ARRAY ARRAY['exams', 'exam_results', 'exam_audit'] LOOP
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_exams_updated_at') THEN
    CREATE TRIGGER update_exams_updated_at
      BEFORE UPDATE ON public.exams
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_exam_results_updated_at') THEN
    CREATE TRIGGER update_exam_results_updated_at
      BEFORE UPDATE ON public.exam_results
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
