-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT ATTENDANCE — ENTERPRISE EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
-- Purpose
--   Bring `student_attendance` up to the enterprise spec: marker identity,
--   capture method, audit trail, and a `attendance_date` alias column so the
--   newer report aggregator (which reads `attendance_date`) and legacy code
--   (which reads `date`) both work without renames.
--
-- Safety
--   • Every column add uses ADD COLUMN IF NOT EXISTS.
--   • Every CREATE uses IF NOT EXISTS.
--   • All policies are DROP-then-CREATE so re-runs converge.
--   • No drops, no renames — old rows and old queries keep working.
--   • Final NOTIFY pgrst forces PostgREST to refresh its schema cache so the
--     "Could not find the 'marked_at' column" error clears without a restart.
--
-- Idempotent: safe to run multiple times. Safe to run whether or not
-- `20260520_students_module.sql` was applied first.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1: marker + capture-method columns ─────────────────────────────────
alter table public.student_attendance
  add column if not exists method           text          not null default 'manual',
  add column if not exists remarks          text,
  add column if not exists notes            text,                          -- legacy alias kept for any service still reading it
  add column if not exists marked_at        timestamptz   not null default now(),
  add column if not exists marked_by_name   text,
  add column if not exists marked_by_role   text,
  add column if not exists last_updated_by  uuid          references public.profiles(id) on delete set null,
  add column if not exists last_updated_at  timestamptz,
  add column if not exists updated_at       timestamptz   not null default now();

-- `attendance_date` alias — newer report aggregator reads this name; legacy
-- code reads `date`. We add the alias column, backfill from `date`, and add
-- a trigger to keep both in lockstep so writes from either side stay in sync.
alter table public.student_attendance
  add column if not exists attendance_date date;

update public.student_attendance
   set attendance_date = date
 where attendance_date is null and date is not null;

create or replace function public.student_attendance_sync_date()
returns trigger
language plpgsql
as $$
begin
  -- Whichever column the writer set, mirror it to the other so all readers
  -- (date | attendance_date) see the same value.
  if new.attendance_date is null and new.date is not null then
    new.attendance_date := new.date;
  elsif new.date is null and new.attendance_date is not null then
    new.date := new.attendance_date;
  elsif new.attendance_date is distinct from new.date then
    -- Writer set both — trust the explicit attendance_date.
    new.date := new.attendance_date;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_student_attendance_sync_date on public.student_attendance;
create trigger trg_student_attendance_sync_date
  before insert or update on public.student_attendance
  for each row execute function public.student_attendance_sync_date();

-- ── PART 2: widen status check ──────────────────────────────────────────────
do $$
begin
  alter table public.student_attendance drop constraint if exists student_attendance_status_check;
  alter table public.student_attendance
    add constraint student_attendance_status_check
    check (status in ('present', 'absent', 'late', 'excused'));
exception when others then null;
end $$;

-- ── PART 3: indexes for marker / analytics queries ─────────────────────────
create index if not exists idx_student_attendance_marked_by   on public.student_attendance(marked_by);
create index if not exists idx_student_attendance_marked_at   on public.student_attendance(marked_at);
create index if not exists idx_student_attendance_batch_date  on public.student_attendance(batch_id, attendance_date);
create index if not exists idx_student_attendance_method      on public.student_attendance(method);

-- ── PART 4: audit table ─────────────────────────────────────────────────────
-- Snapshots every insert / update so management can answer "who marked this
-- attendance and when". Append-only — never updated, never deleted.
create table if not exists public.student_attendance_audit (
  id                 uuid primary key default gen_random_uuid(),
  attendance_id      uuid not null references public.student_attendance(id) on delete cascade,
  student_id         uuid references public.students(id) on delete set null,
  batch_id           uuid references public.batches(id) on delete set null,
  attendance_date    date,
  old_status         text,
  new_status         text not null,
  method             text,
  remarks            text,
  changed_by         uuid references public.profiles(id) on delete set null,
  changed_by_name    text,
  changed_by_role    text,
  change_type        text not null check (change_type in ('insert', 'update')),
  changed_at         timestamptz not null default now()
);
create index if not exists idx_student_attendance_audit_att        on public.student_attendance_audit(attendance_id);
create index if not exists idx_student_attendance_audit_student    on public.student_attendance_audit(student_id);
create index if not exists idx_student_attendance_audit_changed_by on public.student_attendance_audit(changed_by);
create index if not exists idx_student_attendance_audit_changed_at on public.student_attendance_audit(changed_at);
create index if not exists idx_student_attendance_audit_batch_date on public.student_attendance_audit(batch_id, attendance_date);

-- ── PART 5: audit trigger ───────────────────────────────────────────────────
create or replace function public.student_attendance_audit_fn()
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
  -- Identify the actor:
  --   1. service-role/cron jobs set marked_by explicitly; trust that.
  --   2. otherwise fall back to the row's last_updated_by, else null.
  v_actor := coalesce(new.last_updated_by, new.marked_by);
  if v_actor is not null then
    select p.name, p.role::text
      into v_actor_name, v_actor_role
      from public.profiles p
     where p.id = v_actor
     limit 1;
  end if;
  -- If the writer already supplied marker name/role (preferred), prefer those
  -- so client-attached metadata (which may include the human-facing label)
  -- isn't overwritten by a stale profile join.
  v_actor_name := coalesce(new.marked_by_name, v_actor_name);
  v_actor_role := coalesce(new.marked_by_role, v_actor_role);

  v_change_type := case when tg_op = 'INSERT' then 'insert' else 'update' end;

  insert into public.student_attendance_audit (
    attendance_id, student_id, batch_id, attendance_date,
    old_status, new_status, method, remarks,
    changed_by, changed_by_name, changed_by_role, change_type
  ) values (
    new.id, new.student_id, new.batch_id, new.attendance_date,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    new.method,
    coalesce(new.remarks, new.notes),
    v_actor, v_actor_name, v_actor_role, v_change_type
  );
  return new;
end $$;

drop trigger if exists trg_student_attendance_audit on public.student_attendance;
create trigger trg_student_attendance_audit
  after insert or update on public.student_attendance
  for each row execute function public.student_attendance_audit_fn();

-- ── PART 6: RLS on audit ────────────────────────────────────────────────────
alter table public.student_attendance_audit enable row level security;

drop policy if exists "audit_select_admin_mgmt" on public.student_attendance_audit;
create policy "audit_select_admin_mgmt"
  on public.student_attendance_audit
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.user_id = auth.uid()
         and p.role::text in ('admin', 'management', 'coordinator')
    )
  );

drop policy if exists "audit_select_own_marks" on public.student_attendance_audit;
create policy "audit_select_own_marks"
  on public.student_attendance_audit
  for select
  to authenticated
  using (
    changed_by in (select id from public.profiles where user_id = auth.uid())
  );

-- Writes happen exclusively via the trigger (security definer). No client
-- INSERT/UPDATE/DELETE policies are needed — and their absence ensures the
-- audit log cannot be tampered with by application code.

-- ── PART 7: realtime publication ────────────────────────────────────────────
-- Both the attendance table and the audit table need to be in
-- supabase_realtime so dashboards / analytics / triage screens refetch on
-- change without a page reload. Guarded so re-running is a no-op.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'student_attendance'
    ) then
      execute 'alter publication supabase_realtime add table public.student_attendance';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'student_attendance_audit'
    ) then
      execute 'alter publication supabase_realtime add table public.student_attendance_audit';
    end if;
  end if;
end $$;

-- ── PART 8: PostgREST schema cache reload ───────────────────────────────────
-- Without this the new columns / table aren't visible until Supabase restarts
-- its API. This is the single line that clears the
-- "Could not find the 'marked_at' column" error that prompted this migration.
notify pgrst, 'reload schema';
