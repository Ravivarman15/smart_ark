-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT IMPORT — institution-export field extensions
-- ────────────────────────────────────────────────────────────────────────────
-- Powers the Smart Student Import Engine: institution Excel/CSV exports carry
-- identity + demographic columns that the base `students` table had no home for
-- (Biometric Id, Enrolment No, GR No, User Name, Category, Group, State, City,
-- School/College, University, Course Expiry Date, Mother's name/mobile/email).
--
-- Additive & idempotent — safe to run on an existing database, IN ANY ORDER:
--   • every ADD COLUMN uses IF NOT EXISTS
--   • indexes are created only for columns that actually exist (guarded below),
--     so this runs cleanly even if 20260520_students_module.sql (which adds
--     student_contact / student_email) has not been applied yet
--   • nothing is dropped, renamed, or altered in type
-- The students service strips these columns on a "column does not exist" error,
-- so imports keep working before this migration is applied — the new fields just
-- stay inert until it runs.
--
-- NOTE: for the importer to persist the FULL field set (gender, contacts, emails,
-- academic_year_id, …) the foundational 20260520_students_module.sql must also be
-- applied — this migration only adds the institution-export identity columns on top.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.students
  add column if not exists biometric_id       text,
  add column if not exists enrolment_no       text,
  add column if not exists gr_no              text,
  add column if not exists username           text,
  add column if not exists category           text,
  add column if not exists group_name         text,
  add column if not exists state              text,
  add column if not exists city               text,
  add column if not exists school_college     text,
  add column if not exists university         text,
  add column if not exists course_expiry_date date,
  add column if not exists mother_name        text,
  add column if not exists mother_contact     text,
  add column if not exists mother_email       text;

-- Duplicate-detection lookup keys. Partial indexes (skip NULLs) keep them small.
-- Guarded: a key column missing on a drifted database is skipped, never errors.
do $$
declare
  keys text[] := array[
    'biometric_id', 'enrolment_no', 'gr_no',
    'roll_number', 'student_contact', 'student_email'
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

-- Refresh PostgREST's schema cache so the new columns are queryable immediately.
notify pgrst, 'reload schema';
