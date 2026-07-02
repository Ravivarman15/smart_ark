-- ════════════════════════════════════════════════════════════════════════════
-- EXAM ENTERPRISE SESSION — Academic Year / Term / Month / Faculty   (2026-07-01)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Extends the existing manual Exam module (20260522_exam_module.sql) into an
-- enterprise examination session model WITHOUT new tables and WITHOUT touching
-- the legacy `test_results` / `retests` tables or the MCQ tables.
--
--   • exams        → academic_year, term, month, faculty (session hierarchy)
--   • exam_results → attendance_status (present|absent|medical|malpractice)
--
-- Academic Year reuses the existing `academic_years` table — no duplicate.
-- Class = standards, Section = batches, Subject = subjects (all existing).
-- Every column is nullable / defaulted, so the app keeps working before this
-- migration is applied and after (services read the columns defensively).
-- ════════════════════════════════════════════════════════════════════════════

-- ── exams — session hierarchy + faculty ─────────────────────────────────────
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS academic_year_id   UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_year_name TEXT,
  -- 'term_1' | 'term_2' | 'term_3'
  ADD COLUMN IF NOT EXISTS term               TEXT,
  -- 'april' | 'may' | … | 'march'
  ADD COLUMN IF NOT EXISTS month              TEXT,
  ADD COLUMN IF NOT EXISTS faculty_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS faculty_name       TEXT;

CREATE INDEX IF NOT EXISTS idx_exams_year       ON public.exams(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_exams_term_month ON public.exams(term, month);
CREATE INDEX IF NOT EXISTS idx_exams_faculty    ON public.exams(faculty_id);

-- ── exam_results — richer attendance status ─────────────────────────────────
-- 'present' | 'absent' | 'medical' | 'malpractice'. The existing boolean
-- `is_absent` is kept in sync by the service layer (any non-present ⇒ true), so
-- every reader that still checks `is_absent` (Student 360 insights, KPI) keeps
-- working untouched.
ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'present';

-- Backfill status from the legacy boolean for any pre-existing rows.
UPDATE public.exam_results
   SET attendance_status = 'absent'
 WHERE is_absent = true
   AND attendance_status = 'present';

-- RLS + updated_at triggers already cover exams / exam_results (table-wide
-- policies from 20260522_exam_module.sql) — nothing to add here.

NOTIFY pgrst, 'reload schema';
