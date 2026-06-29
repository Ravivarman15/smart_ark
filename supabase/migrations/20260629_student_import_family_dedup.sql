-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT IMPORT — family-aware duplicate detection support
-- ────────────────────────────────────────────────────────────────────────────
-- The importer now uses a WEIGHTED, family-aware duplicate engine (client-side,
-- `src/features/students/utils/duplicateEngine.ts`). A mobile number is NEVER a
-- unique student identifier — one parent can have many children sharing the same
-- mobile / email / address / parent name.
--
-- ── CONSTRAINT REVIEW (the requested audit) ─────────────────────────────────
-- Reviewed every migration for a UNIQUE constraint on a phone/mobile column:
--   • students.student_contact  — NO unique constraint  ✅ (plain column)
--   • students.parent_contact   — NO unique constraint  ✅
--   • students.mother_contact   — NO unique constraint  ✅
--   • 20260608 created idx_students_student_contact via `create index`
--     (NON-unique) — correct, kept as-is.
-- => The database NEVER enforced mobile uniqueness; the "only one sibling
--    imported" bug was purely in the client dedup logic and is now fixed.
--    Student uniqueness rests on institutional identifiers (enrolment_no /
--    gr_no / biometric_id), NOT the parent's phone. We deliberately add NO
--    unique constraint on any phone column here.
--
-- Additive & idempotent — safe to run on an existing database, IN ANY ORDER:
--   • only CREATE INDEX IF NOT EXISTS, all guarded by a column-exists check
--   • nothing is dropped, renamed, altered in type, or made unique
--   • no data is migrated
-- ════════════════════════════════════════════════════════════════════════════

-- Non-unique lookup indexes for the columns the weighted engine + family
-- grouping read most (existing-student matching on large databases). Partial
-- (skip NULLs) to stay small. Guarded so a drifted schema never errors.
do $$
declare
  keys text[] := array[
    'parent_contact',   -- family link + name/DOB+mobile scoring
    'mother_contact',
    'parent_name',      -- family grouping (name + address)
    'date_of_birth'     -- name + DOB scoring
  ];
  col text;
begin
  foreach col in array keys loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'students' and column_name = col
    ) then
      execute format(
        'create index if not exists idx_students_%1$s on public.students(%1$I) where %1$I is not null;',
        col
      );
    end if;
  end loop;
end $$;

-- Refresh PostgREST's schema cache so the indexes are picked up immediately.
notify pgrst, 'reload schema';
