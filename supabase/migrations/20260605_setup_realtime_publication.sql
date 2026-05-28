-- Setup-data realtime propagation.
--
-- Background: SetupRealtimeProvider subscribes to postgres_changes on the
-- Setup reference tables (standards, batches, course types, academic years,
-- subjects, taxes, the two junctions and campuses) so that adding/editing a
-- Setup record fans out instantly to every module's lookup cache — the
-- Student Registration standard dropdown, the Fee structure form, the Exam
-- batch picker, etc. But those events only fire if the tables are members of
-- the `supabase_realtime` publication. The original Setup migrations created
-- the tables + RLS but never added them to the publication, so a new
-- "Grade 4 ICSE" standard would land in the DB yet not reach an already-open
-- form on another client until a hard reload.
--
-- This migration is purely additive and idempotent. Each `alter publication
-- add table` is guarded so re-running after some tables were already added
-- (or before a table's creation migration has run) is a safe no-op.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'standards',
    'batches',
    'course_types',
    'academic_years',
    'subjects',
    'taxes',
    'standard_course_types',
    'batch_subjects',
    'campuses'
  ]
  loop
    -- Only add the table if it exists in this deployment AND isn't already
    -- in the publication. Tables not yet created are silently skipped.
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tbl and c.relkind = 'r'
    ) and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end$$;

-- Reload PostgREST so any newly-published tables are immediately visible.
notify pgrst, 'reload schema';
