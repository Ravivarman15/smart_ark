-- ════════════════════════════════════════════════════════════════════════════
-- MULTI-STANDARD CLASSES + PER-CLASS STUDENT ASSIGNMENT              (2026-07-29)
--
-- A scheduled class could only ever cover ONE standard and implicitly taught
-- "whoever is in the batch". Two things change here:
--
--   1. class_schedules.standard_ids[] — a class can span several standards.
--      standard_id / standard_name stay as the PRIMARY (first) standard so
--      every existing filter, report, RLS check and denormalised label keeps
--      working untouched.
--
--   2. class_students — the explicit roster. The coordinator picks exactly who
--      is in the class; the teacher then sees only those students on the
--      attendance sheet. A class with no rows here falls back to the batch
--      roster, so classes scheduled before this migration behave as they did.
--
-- ADDITIVE & IDEMPOTENT — safe to re-run. Services are missing-table-safe, so
-- the app builds and runs before this is applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. class_schedules — multi-standard columns (additive)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_schedules' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.class_schedules
      ADD COLUMN IF NOT EXISTS standard_ids   UUID[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS standard_names TEXT[] NOT NULL DEFAULT '{}';

    -- Backfill from the single-standard era so `standard_ids` is authoritative
    -- for every row, new and old. Without this, an "any of these standards"
    -- query would silently miss every pre-existing class.
    UPDATE public.class_schedules
       SET standard_ids   = ARRAY[standard_id],
           standard_names = ARRAY[COALESCE(standard_name, '')]
     WHERE standard_id IS NOT NULL
       AND cardinality(standard_ids) = 0;

    CREATE INDEX IF NOT EXISTS idx_cs_standard_ids
      ON public.class_schedules USING GIN (standard_ids);
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. class_students — the explicit per-class roster
--
--    This is NOT attendance. class_attendance answers "was this student in the
--    room"; this answers "is this student in the class at all". Keeping them
--    apart is what lets a teacher's sheet show a stable roster before a single
--    mark exists.
--
--    student_name / roll_number / standard_id / batch_id are denormalised so
--    the roster renders (and groups by batch on submit) without a join.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name      TEXT,
  roll_number       TEXT,
  standard_id       UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  standard_name     TEXT,
  batch_id          UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  batch_name        TEXT,
  assigned_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_schedule_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_cst_schedule ON public.class_students(class_schedule_id);
CREATE INDEX IF NOT EXISTS idx_cst_student  ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_cst_batch    ON public.class_students(batch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Scope helper — a coordinator must own EVERY standard on a multi-standard
--    class, not just the primary one. Without this, adding a second standard
--    would be a way around coordinator_owns_standard().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.coordinator_owns_standards(_stds uuid[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _stds IS NULL OR cardinality(_stds) = 0 OR NOT EXISTS (
    SELECT 1
    FROM unnest(_stds) AS s(std)
    WHERE s.std IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.coordinator_standards csd
        WHERE csd.coordinator_id = public.current_profile_id()
          AND csd.standard_id = s.std
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Re-state the coordinator write policies with the multi-standard check.
--    (Same shape as 20260723; only the standard_ids clause is new.)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_schedules' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "Coordinator write class_schedules"  ON public.class_schedules;
    DROP POLICY IF EXISTS "Coordinator update class_schedules" ON public.class_schedules;

    CREATE POLICY "Coordinator write class_schedules" ON public.class_schedules
      FOR INSERT TO authenticated
      WITH CHECK (
        get_user_role(auth.uid()) = 'coordinator'
        AND public.coordinator_manages_staff(teacher_id)
        AND public.coordinator_owns_standard(standard_id)
        AND public.coordinator_owns_standards(standard_ids)
      );

    CREATE POLICY "Coordinator update class_schedules" ON public.class_schedules
      FOR UPDATE TO authenticated
      USING      (get_user_role(auth.uid()) = 'coordinator'
                  AND public.coordinator_manages_staff(teacher_id))
      WITH CHECK (get_user_role(auth.uid()) = 'coordinator'
                  AND public.coordinator_manages_staff(teacher_id)
                  AND public.coordinator_owns_standard(standard_id)
                  AND public.coordinator_owns_standards(standard_ids));
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS on class_students — scoped through the parent class, exactly like
--    class_attendance. A teacher reads the roster of their own classes and
--    nothing else.
--
--    Reads and writes are split: the teacher must SEE the roster to mark
--    attendance, but only the coordinator who owns the class (or management)
--    may CHANGE who is in it. A teacher quietly dropping a student from their
--    own class would erase them from the register with no trace.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read class_students"   ON public.class_students;
DROP POLICY IF EXISTS "Manage class_students" ON public.class_students;

CREATE POLICY "Read class_students" ON public.class_students
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_students.class_schedule_id
        AND (
          cs.teacher_id = public.current_profile_id()
          OR (get_user_role(auth.uid()) = 'coordinator'
              AND (cs.coordinator_id = public.current_profile_id()
                   OR public.coordinator_manages_staff(cs.teacher_id)))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  );

CREATE POLICY "Manage class_students" ON public.class_students
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_students.class_schedule_id
        AND (
          (get_user_role(auth.uid()) = 'coordinator'
           AND (cs.coordinator_id = public.current_profile_id()
                OR public.coordinator_manages_staff(cs.teacher_id)))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_students.class_schedule_id
        AND (
          (get_user_role(auth.uid()) = 'coordinator'
           AND (cs.coordinator_id = public.current_profile_id()
                OR public.coordinator_manages_staff(cs.teacher_id)))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime publication (idempotent) — rosters fan out to open dashboards.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_students' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'class_students'
  ) THEN
    EXECUTE 'alter publication supabase_realtime add table public.class_students';
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
