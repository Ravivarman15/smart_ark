-- Setup module extensions (Phase 5).
--
-- Adds the columns + join tables the modern Setup pages need without
-- breaking any existing usage:
--
--   - academic_years.is_default       — "current" year flag (one true at a time)
--   - taxes.tax_type / amount         — fixed-vs-percentage tax model
--   - subjects.is_optional/is_active  — optional/mandatory + soft-disable
--   - batches.course_type_id          — stream linkage (NEET, JEE, …)
--   - batches.capacity / room / is_active — operational metadata
--   - standard_course_types junction  — many-to-many stream ↔ standard
--   - batch_subjects junction         — many-to-many batch ↔ subject
--   - setup_timetable_periods         — per-batch weekly timetable cells
--
-- Every change is additive; existing rows keep working with sensible defaults.

-- ── academic_years ──────────────────────────────────────────────────────────
alter table public.academic_years
  add column if not exists is_default boolean not null default false;

-- Enforce "at most one default year" via partial unique index.
create unique index if not exists academic_years_one_default_idx
  on public.academic_years ((is_default)) where is_default;

-- ── taxes ───────────────────────────────────────────────────────────────────
alter table public.taxes
  add column if not exists tax_type text not null default 'percentage',
  add column if not exists amount   numeric(12, 2);

alter table public.taxes
  drop constraint if exists taxes_tax_type_check;
alter table public.taxes
  add constraint taxes_tax_type_check check (tax_type in ('percentage', 'fixed'));

-- ── subjects ────────────────────────────────────────────────────────────────
alter table public.subjects
  add column if not exists is_optional boolean not null default false,
  add column if not exists is_active   boolean not null default true,
  add column if not exists display_order integer not null default 0;

-- ── batches ─────────────────────────────────────────────────────────────────
alter table public.batches
  add column if not exists course_type_id uuid references public.course_types(id) on delete set null,
  add column if not exists capacity       integer,
  add column if not exists room           text,
  add column if not exists is_active      boolean not null default true,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null;

-- ── standard_course_types — many-to-many (which streams a standard supports) ─
create table if not exists public.standard_course_types (
  id              uuid primary key default gen_random_uuid(),
  standard_id     uuid not null references public.standards(id) on delete cascade,
  course_type_id  uuid not null references public.course_types(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint standard_course_types_unique unique (standard_id, course_type_id)
);

alter table public.standard_course_types enable row level security;

-- DROP-then-CREATE pattern: Postgres has no `create policy if not exists`,
-- so re-running this migration would fail with "policy already exists".
-- Dropping first makes it idempotent and rerunnable.
drop policy if exists "scts: read for authenticated" on public.standard_course_types;
create policy "scts: read for authenticated"
  on public.standard_course_types
  for select using (auth.uid() is not null);

drop policy if exists "scts: management writes" on public.standard_course_types;
create policy "scts: management writes"
  on public.standard_course_types
  for all
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );

-- ── batch_subjects — many-to-many (which subjects a batch teaches) ──────────
create table if not exists public.batch_subjects (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  teacher_profile_id uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint batch_subjects_unique unique (batch_id, subject_id)
);

alter table public.batch_subjects enable row level security;

drop policy if exists "bs: read for authenticated" on public.batch_subjects;
create policy "bs: read for authenticated"
  on public.batch_subjects
  for select using (auth.uid() is not null);

drop policy if exists "bs: management writes" on public.batch_subjects;
create policy "bs: management writes"
  on public.batch_subjects
  for all
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );

-- ── setup_timetable_periods — weekly schedule cells ─────────────────────────
-- One row = one period block. day_of_week is 0=Sunday … 6=Saturday for
-- consistency with JS Date.getDay(). Uniqueness prevents two subjects in
-- the same batch+day+period slot.
create table if not exists public.setup_timetable_periods (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references public.batches(id) on delete cascade,
  day_of_week        smallint not null check (day_of_week between 0 and 6),
  period_no          smallint not null check (period_no between 1 and 12),
  subject_id         uuid references public.subjects(id) on delete set null,
  teacher_profile_id uuid references public.profiles(id) on delete set null,
  start_time         time,
  end_time           time,
  room               text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint timetable_unique_cell unique (batch_id, day_of_week, period_no)
);

create index if not exists timetable_batch_day_idx
  on public.setup_timetable_periods (batch_id, day_of_week);

alter table public.setup_timetable_periods enable row level security;

drop policy if exists "tt: read for authenticated" on public.setup_timetable_periods;
create policy "tt: read for authenticated"
  on public.setup_timetable_periods
  for select using (auth.uid() is not null);

drop policy if exists "tt: management/admin writes" on public.setup_timetable_periods;
create policy "tt: management/admin writes"
  on public.setup_timetable_periods
  for all
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );
