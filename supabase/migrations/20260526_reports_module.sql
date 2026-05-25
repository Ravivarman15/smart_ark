-- ════════════════════════════════════════════════════════════════════════════
-- REPORTS & ANALYTICS MODULE                            (2026-05-26)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- The Reports module is a *composition* layer over the analytics that
-- already live in the Finance, Fee, Exam, Student, Attendance and Dashboard
-- features. It does NOT create new analytics tables — those analytics
-- already aggregate from the existing canonical tables (expense_transactions,
-- student_fees, exams, exam_results, student_attendance, message_queue,
-- profiles_attendance, …) and are reused as-is.
--
-- This migration adds only one operational table — `report_presets` — so
-- users can save and re-run their custom filter combinations.
--
-- Does NOT touch any existing table or analytics surface. The Reports
-- module renders pre-migration (presets just return empty list).
--
-- RLS — every user reads + writes their own presets; admin + management
-- can read/write any preset (so they can ship organisation-wide templates).
-- ════════════════════════════════════════════════════════════════════════════

-- ── report_presets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_presets_key
  ON public.report_presets (report_key);
CREATE INDEX IF NOT EXISTS idx_report_presets_owner
  ON public.report_presets (owner_id);

-- updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_report_presets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_presets_updated_at ON public.report_presets;
CREATE TRIGGER trg_report_presets_updated_at
  BEFORE UPDATE ON public.report_presets
  FOR EACH ROW EXECUTE FUNCTION public.tg_report_presets_set_updated_at();

-- RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.report_presets ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read shared presets OR their own.
DROP POLICY IF EXISTS "report_presets read" ON public.report_presets;
CREATE POLICY "report_presets read" ON public.report_presets
  FOR SELECT TO authenticated
  USING (
    is_shared = true
    OR owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'management')
  );

DROP POLICY IF EXISTS "report_presets insert" ON public.report_presets;
CREATE POLICY "report_presets insert" ON public.report_presets
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'management')
  );

DROP POLICY IF EXISTS "report_presets update" ON public.report_presets;
CREATE POLICY "report_presets update" ON public.report_presets
  FOR UPDATE TO authenticated
  USING (
    owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'management')
  );

DROP POLICY IF EXISTS "report_presets delete" ON public.report_presets;
CREATE POLICY "report_presets delete" ON public.report_presets
  FOR DELETE TO authenticated
  USING (
    owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'management')
  );
