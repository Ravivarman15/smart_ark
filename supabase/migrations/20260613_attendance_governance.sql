-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ATTENDANCE MODULE — PHASE 5: GOVERNANCE, APPROVALS & AUTOMATION
-- ────────────────────────────────────────────────────────────────────────────
-- Purpose
--   Phase 5 turns the attendance module enterprise-grade: data governance,
--   period locking, monthly closing, an approval workflow, automated risk
--   alerts and a unified audit center. Six NEW tables only — nothing existing
--   is touched.
--
--     • attendance_locks            — day / week / month locks (scope = student
--                                     / staff / all). Locked periods reject
--                                     edits, imports and corrections.
--     • attendance_closings         — monthly closing register (open / closed /
--                                     reopened) per scope + month.
--     • attendance_approvals        — approval queue: correction / backdated /
--                                     bulk_import / reopen / unlock requests with
--                                     old→new value snapshots + decision trail.
--     • attendance_alerts           — generated student / staff alerts
--                                     (defaulter, consecutive absence, late, etc.)
--                                     deduped by `dedupe_key`.
--     • attendance_automation_runs  — log of every automation scan (scanned /
--                                     created / notified counters + status).
--     • attendance_governance_audit — append-only audit of every governance
--                                     action (lock / unlock / close / reopen /
--                                     approve / reject / notify …).
--
-- Safety
--   • Every CREATE uses IF NOT EXISTS; every policy is DROP-then-CREATE.
--   • No drops, no renames — purely additive. Builds on 20260612_attendance_module.
--   • All governance writes are role-gated by RLS (admin / management /
--     coordinator) with authenticated read; requesters can file approval rows.
--   • Final NOTIFY pgrst refreshes PostgREST's schema cache.
--
-- Idempotent: safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Shared role-check helper (inline EXISTS, no new function dependency) ──────
-- We repeat the EXISTS(...) idiom used across the codebase rather than adding a
-- SQL function, to keep this migration self-contained and drift-proof.

-- ════════════════════════════════════════════════════════════════════════════
-- PART 1: attendance_locks
-- ────────────────────────────────────────────────────────────────────────────
-- One row per (scope, period_type, period_key). `locked = true` blocks writes to
-- attendance rows whose date falls in [from_date, to_date]. The client enforces
-- this in the write services; this table is the source of truth.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_locks (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null default 'all',          -- student | staff | all
  period_type     text not null default 'month',        -- day | week | month
  period_key      text not null,                         -- '2026-01' | '2026-01-15' | '2026-W03'
  from_date       date not null,
  to_date         date not null,
  locked          boolean not null default true,
  reason          text,
  locked_by       uuid references public.profiles(id) on delete set null,
  locked_by_name  text,
  locked_by_role  text,
  locked_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (scope, period_type, period_key)
);

do $$
begin
  alter table public.attendance_locks drop constraint if exists attendance_locks_scope_check;
  alter table public.attendance_locks
    add constraint attendance_locks_scope_check check (scope in ('student', 'staff', 'all'));
  alter table public.attendance_locks drop constraint if exists attendance_locks_period_check;
  alter table public.attendance_locks
    add constraint attendance_locks_period_check check (period_type in ('day', 'week', 'month'));
exception when others then null;
end $$;

create index if not exists idx_attendance_locks_range on public.attendance_locks(from_date, to_date);
create index if not exists idx_attendance_locks_scope on public.attendance_locks(scope, locked);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2: attendance_closings
-- ────────────────────────────────────────────────────────────────────────────
-- Monthly closing register. Closing a month makes it read-only (enforced via a
-- companion lock row written by the app, plus this status). Reopen flips status
-- to 'reopened' after an approved reopen request.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_closings (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null default 'all',          -- student | staff | all
  month           text not null,                         -- 'YYYY-MM'
  status          text not null default 'closed',        -- open | closed | reopened
  remarks         text,
  closed_by       uuid references public.profiles(id) on delete set null,
  closed_by_name  text,
  closed_at       timestamptz,
  reopened_by     uuid references public.profiles(id) on delete set null,
  reopened_by_name text,
  reopened_at     timestamptz,
  reopen_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (scope, month)
);

do $$
begin
  alter table public.attendance_closings drop constraint if exists attendance_closings_scope_check;
  alter table public.attendance_closings
    add constraint attendance_closings_scope_check check (scope in ('student', 'staff', 'all'));
  alter table public.attendance_closings drop constraint if exists attendance_closings_status_check;
  alter table public.attendance_closings
    add constraint attendance_closings_status_check check (status in ('open', 'closed', 'reopened'));
exception when others then null;
end $$;

create index if not exists idx_attendance_closings_month on public.attendance_closings(month);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 3: attendance_approvals (the approval queue)
-- ────────────────────────────────────────────────────────────────────────────
-- A unified request inbox: correction / backdated entry / bulk import / month
-- reopen / unlock. old_value / new_value carry the JSON snapshots so an approver
-- can see exactly what will change.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_approvals (
  id                uuid primary key default gen_random_uuid(),
  request_type      text not null,                       -- correction | backdated | bulk_import | reopen | unlock
  entity_type       text not null default 'student',     -- student | staff
  target_id         uuid,                                -- student / staff id (nullable for period requests)
  target_name       text,
  affected_from     date,
  affected_to       date,
  old_value         jsonb,
  new_value         jsonb,
  reason            text,
  attachments       jsonb not null default '[]'::jsonb,
  status            text not null default 'pending',     -- pending | approved | rejected | returned
  requested_by      uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  requested_by_role text,
  requested_at      timestamptz not null default now(),
  decided_by        uuid references public.profiles(id) on delete set null,
  decided_by_name   text,
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  alter table public.attendance_approvals drop constraint if exists attendance_approvals_type_check;
  alter table public.attendance_approvals
    add constraint attendance_approvals_type_check
    check (request_type in ('correction', 'backdated', 'bulk_import', 'reopen', 'unlock'));
  alter table public.attendance_approvals drop constraint if exists attendance_approvals_status_check;
  alter table public.attendance_approvals
    add constraint attendance_approvals_status_check
    check (status in ('pending', 'approved', 'rejected', 'returned'));
exception when others then null;
end $$;

create index if not exists idx_attendance_approvals_status on public.attendance_approvals(status);
create index if not exists idx_attendance_approvals_type   on public.attendance_approvals(request_type);
create index if not exists idx_attendance_approvals_req_by on public.attendance_approvals(requested_by);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 4: attendance_alerts (automation output)
-- ────────────────────────────────────────────────────────────────────────────
-- Generated by the Automation Center scans. `dedupe_key` makes repeated scans
-- idempotent (one open alert per subject + alert kind + period).
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_alerts (
  id              uuid primary key default gen_random_uuid(),
  alert_type      text not null,                         -- defaulter_75 | defaulter_60 | defaulter_50 | streak_3 | … | staff_late | staff_low | missing_checkout | early_exit
  category        text not null default 'student',       -- student | staff
  severity        text not null default 'medium',        -- low | medium | high | critical
  subject_id      uuid,                                  -- student / staff id
  subject_name    text,
  batch_id        uuid,
  batch_name      text,
  title           text not null,
  message         text,
  metric_value    numeric,
  threshold       numeric,
  risk_score      integer,
  risk_level      text,                                  -- low | medium | high | critical
  status          text not null default 'open',          -- open | notified | resolved | dismissed
  channels        jsonb not null default '{}'::jsonb,    -- { in_app:true, whatsapp:false, email:false }
  dedupe_key      text not null,
  notified_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dedupe_key)
);

do $$
begin
  alter table public.attendance_alerts drop constraint if exists attendance_alerts_status_check;
  alter table public.attendance_alerts
    add constraint attendance_alerts_status_check
    check (status in ('open', 'notified', 'resolved', 'dismissed'));
exception when others then null;
end $$;

create index if not exists idx_attendance_alerts_status   on public.attendance_alerts(status);
create index if not exists idx_attendance_alerts_category on public.attendance_alerts(category);
create index if not exists idx_attendance_alerts_subject  on public.attendance_alerts(subject_id);
create index if not exists idx_attendance_alerts_created  on public.attendance_alerts(created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 5: attendance_automation_runs (scheduler / scan log)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_automation_runs (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null,                         -- defaulter_scan | streak_scan | missing_checkout_scan | late_scan | compliance_scan
  status          text not null default 'success',       -- success | partial | failed
  scanned         integer not null default 0,
  created_alerts  integer not null default 0,
  notified        integer not null default 0,
  message         text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  run_by          uuid references public.profiles(id) on delete set null,
  run_by_name     text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_attendance_runs_job     on public.attendance_automation_runs(job_type);
create index if not exists idx_attendance_runs_created on public.attendance_automation_runs(created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 6: attendance_governance_audit (the Audit Center feed)
-- ────────────────────────────────────────────────────────────────────────────
-- Append-only. Every governance mutation writes one row here (from the client
-- service layer) so the Audit Center has a single, queryable timeline.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.attendance_governance_audit (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,                           -- lock | closing | approval | alert | correction
  entity_id     uuid,
  action        text not null,                           -- created | updated | locked | unlocked | closed | reopened | approved | rejected | returned | notified | dismissed | resolved
  scope         text,
  summary       text,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  actor_role    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_gov_audit_entity  on public.attendance_governance_audit(entity_type, entity_id);
create index if not exists idx_gov_audit_action  on public.attendance_governance_audit(action);
create index if not exists idx_gov_audit_created on public.attendance_governance_audit(created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 7: updated_at touch trigger (shared)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.attendance_gov_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'attendance_locks', 'attendance_closings', 'attendance_approvals', 'attendance_alerts'
  ] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format(
      'create trigger trg_%s_touch before update on public.%I for each row execute function public.attendance_gov_touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 8: RLS
-- ────────────────────────────────────────────────────────────────────────────
-- Governance tables: full access for admin / management / coordinator; read for
-- any authenticated user. The approval queue additionally lets ANY authenticated
-- user file a request (insert) so teachers can request corrections / backdated
-- entries. The audit + runs tables are append + read.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper macro via DO blocks for the privileged "for all" policy on each table.
do $$
declare
  tbl text;
  tables text[] := array[
    'attendance_locks',
    'attendance_closings',
    'attendance_approvals',
    'attendance_alerts',
    'attendance_automation_runs',
    'attendance_governance_audit'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);

    -- Privileged full access: admin / management / coordinator.
    execute format('drop policy if exists "%s_all_priv" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_all_priv" on public.%I
        for all to authenticated
        using (
          exists (select 1 from public.profiles p
                   where p.user_id = auth.uid()
                     and p.role::text in ('admin','management','coordinator'))
        )
        with check (
          exists (select 1 from public.profiles p
                   where p.user_id = auth.uid()
                     and p.role::text in ('admin','management','coordinator'))
        )
    $f$, tbl, tbl);

    -- Read for any authenticated user.
    execute format('drop policy if exists "%s_read_all" on public.%I', tbl, tbl);
    execute format($f$
      create policy "%s_read_all" on public.%I
        for select to authenticated using (true)
    $f$, tbl, tbl);
  end loop;
end $$;

-- Any authenticated user may FILE an approval request + an audit/run row
-- (so teachers can request corrections; their own request rows are theirs).
drop policy if exists "attendance_approvals_insert_any" on public.attendance_approvals;
create policy "attendance_approvals_insert_any"
  on public.attendance_approvals
  for insert to authenticated
  with check (true);

drop policy if exists "attendance_gov_audit_insert_any" on public.attendance_governance_audit;
create policy "attendance_gov_audit_insert_any"
  on public.attendance_governance_audit
  for insert to authenticated
  with check (true);

drop policy if exists "attendance_runs_insert_any" on public.attendance_automation_runs;
create policy "attendance_runs_insert_any"
  on public.attendance_automation_runs
  for insert to authenticated
  with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 9: realtime publication
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  tbl text;
  tables text[] := array[
    'attendance_locks',
    'attendance_closings',
    'attendance_approvals',
    'attendance_alerts',
    'attendance_automation_runs',
    'attendance_governance_audit'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array tables loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 10: PostgREST schema cache reload
-- ════════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';
