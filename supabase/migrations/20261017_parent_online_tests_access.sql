-- ════════════════════════════════════════════════════════════════════════════
-- PARENT PORTAL ONLINE TESTS ACCESS
--
-- Enables parents in an institution to read MCQ exams and assignments
-- so online tests assigned to all students, standards, or batches are visible.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 1. Update exams SELECT policy for parents to include MCQ mode tests
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exams') THEN
    DROP POLICY IF EXISTS "parent_read exams" ON public.exams;
    CREATE POLICY "parent_read exams" ON public.exams
      FOR SELECT TO authenticated
      USING (
        (
          mode = 'mcq'
          AND NOT public.is_org_suspended()
          AND organization_id = public.current_org_id()
        )
        OR public.parent_has_child_in_batch(batch_id)
        OR public.parent_has_child_in_standard(standard_id)
        OR EXISTS (
          SELECT 1 FROM public.exam_results er
           WHERE er.exam_id = exams.id
             AND public.is_parent_of(er.student_id)
        )
      );
  END IF;

  -- 2. Allow parents to select mcq_exams in their organization
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mcq_exams') THEN
    DROP POLICY IF EXISTS "parent read mcq_exams" ON public.mcq_exams;
    CREATE POLICY "parent read mcq_exams" ON public.mcq_exams
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
      );
  END IF;

  -- 3. Allow parents to select mcq_exam_assignments in their organization
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mcq_exam_assignments') THEN
    DROP POLICY IF EXISTS "parent read mcq_exam_assignments" ON public.mcq_exam_assignments;
    CREATE POLICY "parent read mcq_exam_assignments" ON public.mcq_exam_assignments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.exams e
           WHERE e.id = mcq_exam_assignments.exam_id
             AND NOT public.is_org_suspended()
             AND e.organization_id = public.current_org_id()
        )
      );
  END IF;
END $$;
