-- ================================================================
-- Migration: Teacher–Student Junction Table
-- Filename:  20260421_teacher_student_junction.sql
--
-- PURPOSE
-- -------
-- Currently the app derives which students belong to a teacher by
-- matching  batches.teacher_responsible (TEXT)  against the teacher's
-- profile name.  This is fragile — a name change or typo breaks the
-- link silently.
--
-- This migration adds a proper, FK-backed join table:
--
--   teacher_students (teacher_id  UUID → profiles.id,
--                     student_id  UUID → students.id)
--
-- and backfills it from the existing name-match data so nothing
-- breaks on first login after the migration runs.
--
-- Also adds  batches.teacher_id  (UUID FK) alongside the legacy
-- batches.teacher_responsible (TEXT) so both can coexist during a
-- phased transition.
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS / DROP IF EXISTS
-- ================================================================


-- ── STEP 1: Add a proper FK column to batches ────────────────────────────────
-- This lets a batch be owned by a teacher by UUID, not by name string.

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill teacher_id from the existing teacher_responsible TEXT column
UPDATE public.batches b
SET    teacher_id = p.id
FROM   public.profiles p
WHERE  p.name               = b.teacher_responsible
  AND  p.role               = 'teacher'
  AND  p.is_active          = true
  AND  b.teacher_id         IS NULL;

CREATE INDEX IF NOT EXISTS idx_batches_teacher_id ON public.batches(teacher_id);


-- ── STEP 2: teacher_students junction table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_students (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID    NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  student_id  UUID    NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  batch_id    UUID    REFERENCES public.batches(id)            ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID    REFERENCES public.profiles(id)           ON DELETE SET NULL,
  UNIQUE(teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_ts_teacher  ON public.teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ts_student  ON public.teacher_students(student_id);
CREATE INDEX IF NOT EXISTS idx_ts_batch    ON public.teacher_students(batch_id);


-- ── STEP 3: RLS on teacher_students ─────────────────────────────────────────

ALTER TABLE public.teacher_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All read teacher_students"          ON public.teacher_students;
DROP POLICY IF EXISTS "Admin_Mgmt manage teacher_students" ON public.teacher_students;

-- Everyone authenticated can see the mapping (needed for teacher dashboard to
-- list its own students, and admin to see all)
CREATE POLICY "All read teacher_students"
  ON public.teacher_students FOR SELECT TO authenticated
  USING (true);

-- Only admins, management, and coordinators can create/modify assignments
CREATE POLICY "Admin_Mgmt manage teacher_students"
  ON public.teacher_students FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator'));

-- Teachers can insert their own student links (for the "Add Student" flow)
DROP POLICY IF EXISTS "Teachers insert own student links" ON public.teacher_students;
CREATE POLICY "Teachers insert own student links"
  ON public.teacher_students FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );


-- ── STEP 4: Backfill teacher_students from existing data ────────────────────
-- Match: students → batches → profiles (by newly set teacher_id FK)

INSERT INTO public.teacher_students (teacher_id, student_id, batch_id)
SELECT
  b.teacher_id,
  s.id          AS student_id,
  b.id          AS batch_id
FROM public.students s
JOIN public.batches  b ON b.id = s.batch_id
WHERE b.teacher_id IS NOT NULL
  AND s.is_active  = true
ON CONFLICT (teacher_id, student_id) DO NOTHING;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running this migration:
-- 1.  teacher_students is populated from existing batch assignments
-- 2.  When a teacher adds a student (addStudentToTeacher), insert into
--     teacher_students (already handled in AppDataContext after this migration)
-- 3.  The app can now query:
--       SELECT students.* FROM students
--       JOIN teacher_students ts ON ts.student_id = students.id
--       WHERE ts.teacher_id = <profile_id>
--     instead of the fragile text-match approach
-- ================================================================
