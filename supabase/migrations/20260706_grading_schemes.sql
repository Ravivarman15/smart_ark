-- ════════════════════════════════════════════════════════════════════════════
-- EXAM MODULE — Reusable Grading Schemes   (2026-07-06)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Lets staff define named grading schemes (grade bands over a 0-100 percentage)
-- and pick one when creating a manual exam. The chosen scheme's bands are copied
-- into `exams.grading_scheme` (an existing JSONB column) at save time, so a past
-- exam's grades never change if a scheme is later edited.
--
--   grading_schemes.bands = JSONB array of { "grade", "minPct", "maxPct" }
--   (camelCase — mirrors the app's GradeBand shape and exams.grading_scheme).
--
-- RLS mirrors other exam config tables: readable by everyone, writable by staff.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grading_schemes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  bands       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the institute default scheme once (kept in sync with DEFAULT_GRADE_SCHEME
-- in src/features/exams/utils/grading.ts).
INSERT INTO public.grading_schemes (name, bands, is_default)
SELECT
  'Institute Default',
  '[
     {"grade":"A+","minPct":90,"maxPct":100},
     {"grade":"A","minPct":80,"maxPct":89.99},
     {"grade":"B+","minPct":70,"maxPct":79.99},
     {"grade":"B","minPct":60,"maxPct":69.99},
     {"grade":"C","minPct":50,"maxPct":59.99},
     {"grade":"D","minPct":35,"maxPct":49.99},
     {"grade":"F","minPct":0,"maxPct":34.99}
   ]'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.grading_schemes WHERE is_default = true);

-- ── RLS — read: everyone; write: staff roles ────────────────────────────────
DO $$
DECLARE
  staff_write TEXT :=
    'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'',''teacher'')';
BEGIN
  ALTER TABLE public.grading_schemes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "read grading_schemes" ON public.grading_schemes;
  DROP POLICY IF EXISTS "write grading_schemes" ON public.grading_schemes;
  CREATE POLICY "read grading_schemes" ON public.grading_schemes
    FOR SELECT TO authenticated, anon USING (true);
  EXECUTE format(
    'CREATE POLICY "write grading_schemes" ON public.grading_schemes FOR ALL TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    staff_write);
END $$;
