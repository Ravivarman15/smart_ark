-- ============================================================================
-- Allow management/admin to permanently delete a staff member.
-- ============================================================================
--
-- PROBLEM
--   Deleting a staff profile failed with 23503 ("This staff member has linked
--   records (attendance, classes, results) and cannot be permanently deleted.
--   Deactivate the account instead."). The original schema (20260305…) declared
--   its profile foreign keys with a bare `REFERENCES public.profiles(id)` and no
--   ON DELETE clause, so they default to NO ACTION and block the delete whenever
--   any historical row points at the profile.
--
-- FIX
--   Retrofit an ON DELETE action onto every profiles(id) foreign key still on
--   NO ACTION / RESTRICT, matching the convention every newer module already
--   follows:
--     • nullable referencing column  -> ON DELETE SET NULL
--         Preserve the historical row, just drop the link. These are audit /
--         "who did it" columns (marked_by, entered_by, verified_by, created_by…).
--     • NOT NULL referencing column  -> ON DELETE CASCADE
--         The row is owned by the staff member and is meaningless without them
--         (teacher_attendance, weekly_plans, class_logs, daily_checklists…).
--
-- Single statement per constraint; idempotent — constraints already on SET NULL
-- ('n') or CASCADE ('c') are skipped, so re-running this migration is a no-op.

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
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confdeltype IN ('a', 'r')          -- a = NO ACTION, r = RESTRICT
      AND array_length(c.conkey, 1) = 1         -- every profiles FK is single-column
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
      || 'REFERENCES public.profiles(id) ON DELETE %s',
      r.tbl, r.conname, col_name, new_action
    );

    RAISE NOTICE 'profiles FK %.% -> ON DELETE %', r.tbl, col_name, new_action;
  END LOOP;
END $$;
