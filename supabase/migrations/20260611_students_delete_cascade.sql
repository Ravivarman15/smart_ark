-- ============================================================================
-- Allow management/admin to permanently delete a student record.
-- ============================================================================
--
-- PROBLEM
--   Hard-deleting a student fails with 23503 ("update or delete on table
--   \"students\" violates foreign key constraint…") whenever any historical row
--   still references the student — typically student_attendance, student_fees,
--   exam_results, mcq_attempts, student_documents, student_leave_requests,
--   student_year_transfers, student_feedback, student_messages,
--   student_app_access, retests, test_results. The original schema declared
--   most of those FKs with a bare `REFERENCES public.students(id)` and no
--   ON DELETE clause, so they default to NO ACTION and block the delete.
--
-- FIX
--   Retrofit an ON DELETE action onto every students(id) foreign key still on
--   NO ACTION / RESTRICT, matching the convention every newer module follows:
--     • nullable referencing column  -> ON DELETE SET NULL
--         Preserve the historical row (e.g. a system audit pointer that may be
--         null already), just drop the link.
--     • NOT NULL referencing column  -> ON DELETE CASCADE
--         The row is owned by the student and is meaningless without them
--         (attendance, fees, exam results, documents, leave requests…).
--
-- Idempotent — constraints already on SET NULL ('n') or CASCADE ('c') are
-- skipped, so re-running this migration is a no-op. Mirrors the staff fix in
-- 20260607_profiles_delete_cascade.sql.

DO $$
DECLARE
  r          RECORD;
  col_name   TEXT;
  col_notnull BOOLEAN;
  new_action TEXT;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS tbl,
           c.conkey
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.students'::regclass
      AND c.confdeltype IN ('a', 'r')          -- a = NO ACTION, r = RESTRICT
      AND array_length(c.conkey, 1) = 1         -- every students FK is single-column
  LOOP
    SELECT a.attname, a.attnotnull
      INTO col_name, col_notnull
    FROM pg_attribute a
    WHERE a.attrelid = r.tbl
      AND a.attnum = r.conkey[1];

    new_action := CASE WHEN col_notnull THEN 'CASCADE' ELSE 'SET NULL' END;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) '
      || 'REFERENCES public.students(id) ON DELETE %s',
      r.tbl, r.conname, col_name, new_action
    );

    RAISE NOTICE 'students FK %.% -> ON DELETE %', r.tbl, col_name, new_action;
  END LOOP;
END $$;
