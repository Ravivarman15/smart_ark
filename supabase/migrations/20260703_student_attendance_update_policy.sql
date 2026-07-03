-- ================================================================
-- Migration: student_attendance UPDATE policy (fix re-submit RLS error)
-- Filename:  20260703_student_attendance_update_policy.sql
--
-- BUG
-- ---
-- Submitting attendance a SECOND time for the same day failed with:
--   "new row violates row-level security policy (USING expression)
--    for table \"student_attendance\""
--
-- ROOT CAUSE
-- ----------
-- The base schema (20260305…) shipped only two policies on
-- student_attendance:
--   • SELECT  — "All read student attendance" (USING true)
--   • INSERT  — "Teachers_Admin manage student att" (WITH CHECK role IN …)
-- There is NO UPDATE policy. `submitAttendance` writes with an UPSERT
-- (`INSERT … ON CONFLICT (student_id,date) DO UPDATE`). The first submit
-- INSERTs (allowed). The second submit hits the conflict and takes the
-- DO UPDATE path — which Postgres gates on an UPDATE policy's USING
-- clause. With no UPDATE policy, RLS denies it and raises the
-- "USING expression" error above.
--
-- FIX
-- ---
-- Add an UPDATE policy mirroring the INSERT policy's role check, so the
-- same roles that may mark attendance may also correct it. USING gates
-- which existing rows can be updated; WITH CHECK gates the new values.
--
-- SAFE TO RE-RUN: DROP … IF EXISTS then CREATE.
-- ================================================================

DROP POLICY IF EXISTS "Teachers_Admin update student att" ON public.student_attendance;

CREATE POLICY "Teachers_Admin update student att"
  ON public.student_attendance
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('teacher', 'admin', 'management', 'coordinator')
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('teacher', 'admin', 'management', 'coordinator')
  );

-- Reload PostgREST's schema/policy cache so the new policy takes effect
-- immediately without a redeploy.
NOTIFY pgrst, 'reload schema';
