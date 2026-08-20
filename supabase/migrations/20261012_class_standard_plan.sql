-- ─────────────────────────────────────────────────────────────────────────────
-- Per-standard subject plan on a class.
--
-- THE PROBLEM
-- A class row carries ONE subject_id. That was fine while a class meant one
-- standard, and it survived the multi-standard change (`standard_ids`) only by
-- pretending every standard in the room was doing the same subject. It is not
-- how a combined session actually runs: a teacher takes 2nd STD through Maths
-- and 3rd STD through Science in the same period, each with its own batch. The
-- timetable printed "2nd STD + 3rd STD · Maths", which is simply false for half
-- the room, and the attendance/report trail inherited the same wrong subject.
--
-- WHY A COLUMN AND NOT A ROW PER STANDARD
-- Splitting the class into one row per standard is the obvious modelling fix
-- and it is WRONG here: teaching hours are aggregated by summing
-- `duration_minutes` per teacher (teachingHours.service.ts), and payroll pays
-- from that sum. Two rows for one 60-minute period would pay the teacher for
-- two hours. The period is one fact; the per-standard detail hangs off it.
--
-- SHAPE  [{ standard_id, standard_name, subject_id, subject_name,
--           batch_id, batch_name, section_id, section_name }, …]
-- Order is meaningful: entry 0 is the primary, and the scalar
-- standard_id / subject_id / batch_id / section_id columns keep mirroring it so
-- every existing filter, RLS predicate, report and denormalised label goes on
-- working with no change at all. This column is ADDITIVE detail, never the
-- replacement for them.
--
-- NO BACKFILL, DELIBERATELY. Existing rows keep an empty plan and the
-- application derives one at read time from the columns they already have
-- (`effectivePlan()` in utils/standardPlan.ts). An UPDATE here would rewrite
-- every tenant's historical timetable — including ARK's — to gain nothing a
-- pure function cannot compute.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.class_schedules
  add column if not exists standard_plan jsonb not null default '[]'::jsonb;

comment on column public.class_schedules.standard_plan is
  'Per-standard subject/batch/section for a combined class. Entry 0 mirrors the scalar standard_id/subject_id/batch_id/section_id columns. Empty on pre-20261012 rows, which are derived at read time.';

-- The column is read positionally, so a non-array would break every consumer at
-- once. Cheap to assert here; impossible to assert in TypeScript.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.class_schedules'::regclass
      and conname = 'class_schedules_standard_plan_is_array'
  ) then
    alter table public.class_schedules
      add constraint class_schedules_standard_plan_is_array
      check (jsonb_typeof(standard_plan) = 'array');
  end if;
end $$;
