-- ─────────────────────────────────────────────────────────────────────────────
-- lead_courses — admin-managed course master for the Lead CRM.
--
-- Single source of truth for the "Course of Interest" dropdown on the public
-- apply form AND the counselor↔course routing rules in Lead Automation Config.
-- Add a course here → it appears in both dropdowns. Public (anon) read of ACTIVE
-- courses so the unauthenticated /leads/apply form can populate its dropdown.
-- Fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);

-- One live row per course name (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_courses_name
  ON public.lead_courses (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_courses_active
  ON public.lead_courses (is_active, sort_order) WHERE deleted_at IS NULL;

ALTER TABLE public.lead_courses ENABLE ROW LEVEL SECURITY;

-- Public read of active courses (unauthenticated apply form + staff).
DROP POLICY IF EXISTS "lead_courses public read" ON public.lead_courses;
CREATE POLICY "lead_courses public read" ON public.lead_courses
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND deleted_at IS NULL);

-- Staff (admin/management/coordinator) manage the master.
DROP POLICY IF EXISTS "lead_courses manage" ON public.lead_courses;
CREATE POLICY "lead_courses manage" ON public.lead_courses
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

-- Seed the existing programs (idempotent — skips any already present).
INSERT INTO public.lead_courses (name, sort_order)
SELECT v.name, v.ord
FROM (VALUES ('NEET', 1), ('JEE', 2), ('Foundation', 3), ('Tuition', 4)) AS v(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_courses lc WHERE lower(lc.name) = lower(v.name)
);
