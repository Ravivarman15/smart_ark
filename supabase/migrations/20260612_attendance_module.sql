-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ATTENDANCE MODULE — STAFF ATTENDANCE + WORK HOURS + SETTINGS
-- ────────────────────────────────────────────────────────────────────────────
-- Purpose
--   Phase 1 of the enterprise attendance module. Adds the schema that the new
--   `src/features/attendance` module needs and that wasn't already provided by
--   `20260528_attendance_enterprise.sql` (which covered student attendance):
--     • Wider student status vocabulary (half_day / medical_leave / holiday).
--     • `staff_attendance`            — all staff, in/out times, computed work
--                                       hours, capture source, marker identity.
--     • `staff_attendance_audit`      — tamper-resistant change log (trigger-fed).
--     • `attendance_settings`         — single-row institute attendance policy
--                                       (shift times, late threshold, expected
--                                       hours, min %, notification + approval flags).
--
-- Safety
--   • Every column add uses ADD COLUMN IF NOT EXISTS.
--   • Every CREATE uses IF NOT EXISTS.
--   • All policies are DROP-then-CREATE so re-runs converge.
--   • No drops, no renames — `teacher_attendance` and `student_attendance` keep
--     working untouched. `staff_attendance` is additive.
--   • Final NOTIFY pgrst refreshes PostgREST's schema cache so new columns /
--     tables are visible without a Supabase restart.
--
-- Idempotent: safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1: widen student status vocabulary ─────────────────────────────────
-- The marking grid now supports the full enterprise set. Existing rows
-- (present/absent/late/excused) remain valid.
do $$
begin
  alter table public.student_attendance drop constraint if exists student_attendance_status_check;
  alter table public.student_attendance
    add constraint student_attendance_status_check
    check (status in (
      'present', 'absent', 'late', 'excused',
      'half_day', 'medical_leave', 'holiday'
    ));
exception when others then null;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2: staff_attendance
-- ────────────────────────────────────────────────────────────────────────────
-- One row per (staff, date). Covers every staff role (teacher, coordinator,
-- admin, management, support). `teacher_attendance` is left intact for the
-- legacy geo check-in/approval flow; this table is the enterprise source of
-- truth for staff presence + work hours.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.staff_attendance (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references public.profiles(id) on delete cascade,
  date              date not null default current_date,
  attendance_date   date,                                   -- alias, kept in lockstep with `date`
  status            text not null default 'present',
  in_time           timestamptz,
  out_time          timestamptz,
  worked_minutes    integer not null default 0,
  expected_minutes  integer not null default 0,
  overtime_minutes  integer not null default 0,
  late_minutes      integer not null default 0,
  source            text    not null default 'manual',      -- manual | staff_checkin | bulk_import | correction
  remarks           text,
  marked_by         uuid references public.profiles(id) on delete set null,
  marked_by_name    text,
  marked_by_role    text,
  marked_at         timestamptz not null default now(),
  last_updated_by   uuid references public.profiles(id) on delete set null,
  last_updated_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (staff_id, date)
);

-- Status check — drop/recreate so re-runs and future widenings converge.
do $$
begin
  alter table public.staff_attendance drop constraint if exists staff_attendance_status_check;
  alter table public.staff_attendance
    add constraint staff_attendance_status_check
    check (status in ('present', 'absent', 'half_day', 'leave', 'late'));
exception when others then null;
end $$;

-- `attendance_date` alias backfill + lockstep trigger (mirrors the student
-- table so report aggregators that read `attendance_date` and legacy code that
-- reads `date` both work).
update public.staff_attendance
   set attendance_date = date
 where attendance_date is null and date is not null;

create or replace function public.staff_attendance_sync_date()
returns trigger
language plpgsql
as $$
begin
  if new.attendance_date is null and new.date is not null then
    new.attendance_date := new.date;
  elsif new.date is null and new.attendance_date is not null then
    new.date := new.attendance_date;
  elsif new.attendance_date is distinct from new.date then
    new.date := new.attendance_date;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_staff_attendance_sync_date on public.staff_attendance;
create trigger trg_staff_attendance_sync_date
  before insert or update on public.staff_attendance
  for each row execute function public.staff_attendance_sync_date();

create index if not exists idx_staff_attendance_staff_date on public.staff_attendance(staff_id, attendance_date);
create index if not exists idx_staff_attendance_date       on public.staff_attendance(attendance_date);
create index if not exists idx_staff_attendance_source     on public.staff_attendance(source);
create index if not exists idx_staff_attendance_marked_by  on public.staff_attendance(marked_by);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.staff_attendance enable row level security;

-- Admin / management / coordinator: full access.
drop policy if exists "staff_att_all_admin_mgmt" on public.staff_attendance;
create policy "staff_att_all_admin_mgmt"
  on public.staff_attendance
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management', 'coordinator')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management', 'coordinator')
    )
  );

-- Any staff member: read their own rows.
drop policy if exists "staff_att_select_own" on public.staff_attendance;
create policy "staff_att_select_own"
  on public.staff_attendance
  for select
  to authenticated
  using (
    staff_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Any staff member: insert / update their OWN row (self check-in / check-out).
drop policy if exists "staff_att_insert_own" on public.staff_attendance;
create policy "staff_att_insert_own"
  on public.staff_attendance
  for insert
  to authenticated
  with check (
    staff_id in (select id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "staff_att_update_own" on public.staff_attendance;
create policy "staff_att_update_own"
  on public.staff_attendance
  for update
  to authenticated
  using (
    staff_id in (select id from public.profiles where user_id = auth.uid())
  )
  with check (
    staff_id in (select id from public.profiles where user_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- PART 3: staff_attendance_audit
-- ────────────────────────────────────────────────────────────────────────────
-- Append-only snapshot of every insert / update. Answers "who changed this
-- staff member's attendance and when". Written exclusively by the trigger.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.staff_attendance_audit (
  id                 uuid primary key default gen_random_uuid(),
  attendance_id      uuid not null references public.staff_attendance(id) on delete cascade,
  staff_id           uuid references public.profiles(id) on delete set null,
  attendance_date    date,
  old_status         text,
  new_status         text not null,
  old_in_time        timestamptz,
  new_in_time        timestamptz,
  old_out_time       timestamptz,
  new_out_time       timestamptz,
  source             text,
  remarks            text,
  changed_by         uuid references public.profiles(id) on delete set null,
  changed_by_name    text,
  changed_by_role    text,
  change_type        text not null check (change_type in ('insert', 'update')),
  changed_at         timestamptz not null default now()
);
create index if not exists idx_staff_attendance_audit_att        on public.staff_attendance_audit(attendance_id);
create index if not exists idx_staff_attendance_audit_staff      on public.staff_attendance_audit(staff_id);
create index if not exists idx_staff_attendance_audit_changed_by on public.staff_attendance_audit(changed_by);
create index if not exists idx_staff_attendance_audit_date       on public.staff_attendance_audit(attendance_date);

create or replace function public.staff_attendance_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_type text;
  v_actor       uuid;
  v_actor_name  text;
  v_actor_role  text;
begin
  v_actor := coalesce(new.last_updated_by, new.marked_by);
  if v_actor is not null then
    select p.name, p.role::text
      into v_actor_name, v_actor_role
      from public.profiles p
     where p.id = v_actor
     limit 1;
  end if;
  v_actor_name := coalesce(new.marked_by_name, v_actor_name);
  v_actor_role := coalesce(new.marked_by_role, v_actor_role);

  v_change_type := case when tg_op = 'INSERT' then 'insert' else 'update' end;

  insert into public.staff_attendance_audit (
    attendance_id, staff_id, attendance_date,
    old_status, new_status,
    old_in_time, new_in_time, old_out_time, new_out_time,
    source, remarks,
    changed_by, changed_by_name, changed_by_role, change_type
  ) values (
    new.id, new.staff_id, new.attendance_date,
    case when tg_op = 'UPDATE' then old.status   else null end,
    new.status,
    case when tg_op = 'UPDATE' then old.in_time  else null end,
    new.in_time,
    case when tg_op = 'UPDATE' then old.out_time else null end,
    new.out_time,
    new.source,
    new.remarks,
    v_actor, v_actor_name, v_actor_role, v_change_type
  );
  return new;
end $$;

drop trigger if exists trg_staff_attendance_audit on public.staff_attendance;
create trigger trg_staff_attendance_audit
  after insert or update on public.staff_attendance
  for each row execute function public.staff_attendance_audit_fn();

-- ── RLS on audit ─────────────────────────────────────────────────────────────
alter table public.staff_attendance_audit enable row level security;

drop policy if exists "staff_audit_select_admin_mgmt" on public.staff_attendance_audit;
create policy "staff_audit_select_admin_mgmt"
  on public.staff_attendance_audit
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management', 'coordinator')
    )
  );

drop policy if exists "staff_audit_select_own" on public.staff_attendance_audit;
create policy "staff_audit_select_own"
  on public.staff_attendance_audit
  for select
  to authenticated
  using (
    staff_id in (select id from public.profiles where user_id = auth.uid())
  );
-- Writes happen exclusively via the trigger (security definer); no client
-- INSERT/UPDATE/DELETE policies — the audit log cannot be tampered with.

-- ════════════════════════════════════════════════════════════════════════════
-- PART 4: attendance_settings (single-row institute policy)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_settings (
  id                            uuid primary key default gen_random_uuid(),
  singleton                     boolean not null default true unique,   -- guarantees one row
  institute_start_time          time    not null default '09:00',
  institute_end_time            time    not null default '17:00',
  late_threshold_minutes        integer not null default 10,
  expected_daily_minutes        integer not null default 480,           -- 8h
  expected_weekly_minutes       integer not null default 2400,          -- 40h
  attendance_min_pct            numeric not null default 75,
  auto_notifications            boolean not null default false,
  correction_approval_required  boolean not null default false,
  updated_by                    uuid references public.profiles(id) on delete set null,
  updated_at                    timestamptz not null default now()
);

-- Seed the single policy row if the table is empty.
insert into public.attendance_settings (singleton)
select true
where not exists (select 1 from public.attendance_settings);

alter table public.attendance_settings enable row level security;

drop policy if exists "att_settings_read_all" on public.attendance_settings;
create policy "att_settings_read_all"
  on public.attendance_settings
  for select
  to authenticated
  using (true);

drop policy if exists "att_settings_write_admin_mgmt" on public.attendance_settings;
create policy "att_settings_write_admin_mgmt"
  on public.attendance_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management')
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- PART 5: realtime publication
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_attendance'
    ) then
      execute 'alter publication supabase_realtime add table public.staff_attendance';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_attendance_audit'
    ) then
      execute 'alter publication supabase_realtime add table public.staff_attendance_audit';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.attendance_settings';
    end if;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 6: PostgREST schema cache reload
-- ════════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';
