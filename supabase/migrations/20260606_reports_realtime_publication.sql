-- Reports & Analytics realtime propagation.
--
-- Background: the Reports module is a composition layer over existing feature
-- analytics. Finance / Fees / student-Attendance / Enquiries already invalidate
-- the reports React Query cache from their own realtime providers, so income →
-- P&L, fee collection, student attendance and enquiry-conversion reports
-- already refresh live. But four report data sources had NO realtime channel,
-- so their reports only updated on a hard reload:
--
--   • exams / exam_results / mcq_attempts → Exam Status, Student Exam Summary,
--     Student Performance reports (the "exam marks entered → performance report
--     updates instantly" requirement)
--   • message_queue                       → SMS Status report
--   • profile_attendance                  → Staff Attendance report
--   • students                            → Student Detail / ID Card / QR Card /
--     Mobile App Status reports
--
-- ReportsRealtimeProvider subscribes to postgres_changes on these tables, but
-- those events only fire if the tables are members of the `supabase_realtime`
-- publication. This migration adds them.
--
-- `teacher_attendance` (the legacy staff-attendance table) is already in the
-- base publication, so it is intentionally omitted here — the guard below
-- would skip it anyway.
--
-- Purely additive and idempotent. Each `alter publication add table` is guarded
-- so re-running after some tables were already added (or before a table's
-- creation migration has run) is a safe no-op. Touches no table data, no RLS,
-- no schema — publication membership only.

do $$
declare
  tbl text;
begin
  -- Nothing to do if the publication doesn't exist (non-Supabase / local pg).
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach tbl in array array[
    'exams',
    'exam_results',
    'mcq_attempts',
    'message_queue',
    'profile_attendance',
    'students'
  ]
  loop
    -- Only add the table if it exists in this deployment AND isn't already
    -- in the publication. Tables not yet created are silently skipped so this
    -- migration is order-independent relative to the feature migrations.
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
