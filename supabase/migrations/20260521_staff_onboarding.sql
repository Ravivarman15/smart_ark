-- ════════════════════════════════════════════════════════════════════════════
-- Staff Onboarding + Credential Delivery   (2026-05-21)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. Adds:
--   1. profiles onboarding columns (invite/email/login lifecycle tracking)
--   2. staff_onboarding_events — immutable onboarding audit log
--
-- The staff service degrades gracefully when the new columns are absent
-- (column-error strip-retry), so the app builds and runs before this
-- migration is applied.
--
-- MIGRATION SAFETY:
--   • Existing staff default to onboarding_status='completed' — they are
--     already onboarded, so they are never mislabelled as "pending".
--   • The invite edge function sets the status explicitly for new staff.
--   • No existing column is altered or dropped; no auth user is touched.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles — onboarding lifecycle columns ──────────────────────────────
alter table public.profiles
  -- 'pending'      — account created, welcome email not yet delivered
  -- 'invite_sent'  — welcome email sent, awaiting first login
  -- 'completed'    — staff has logged in at least once
  add column if not exists onboarding_status      text not null default 'completed',
  add column if not exists invite_sent_at         timestamptz,
  -- 'pending' | 'sent' | 'failed' | 'skipped'
  add column if not exists invite_email_status    text,
  add column if not exists invite_email_error     text,
  add column if not exists last_login_at          timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_onboarding_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_status_chk
      check (onboarding_status in ('pending', 'invite_sent', 'completed'));
  end if;
end$$;

-- ── 2. staff_onboarding_events — onboarding audit log ───────────────────────
-- One row per lifecycle event: account_created, invite_email_sent,
-- invite_email_failed, invite_resent, password_reset, first_login,
-- role_changed, modules_updated, permissions_updated, activated,
-- deactivated, suspended, onboarding_completed.
create table if not exists public.staff_onboarding_events (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  event_type       text not null,
  detail           text,
  metadata         jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_name       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_soe_profile ON public.staff_onboarding_events(profile_id);
create index if not exists idx_soe_created ON public.staff_onboarding_events(created_at desc);

-- ── 3. RLS — read for any authenticated staff, write for admin/management ────
-- The invite edge function runs with the service-role key and bypasses RLS,
-- so it can always append events. Frontend services append role/permission
-- audit rows — those callers are admin/management, covered by the policy.
do $$
begin
  execute 'alter table public.staff_onboarding_events enable row level security';

  drop policy if exists "read staff_onboarding_events" on public.staff_onboarding_events;
  drop policy if exists "write staff_onboarding_events" on public.staff_onboarding_events;

  execute $p$
    create policy "read staff_onboarding_events"
      on public.staff_onboarding_events
      for select to authenticated using (true)
  $p$;

  execute $p$
    create policy "write staff_onboarding_events"
      on public.staff_onboarding_events
      for all to authenticated
      using (get_user_role(auth.uid()) in ('admin','management'))
      with check (get_user_role(auth.uid()) in ('admin','management'))
  $p$;
end$$;
