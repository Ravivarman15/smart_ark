-- ════════════════════════════════════════════════════════════════════════════
-- Staff profile schema consolidation   (2026-05-21)
--
-- FIXES: "Could not find the 'address' column of 'profiles' in the schema
-- cache" — the Create Staff flow writes columns that the live `profiles`
-- table is missing because `20260519_staff_profile_extensions.sql` was never
-- applied.
--
-- This migration is a SELF-CONTAINED, IDEMPOTENT superset of:
--   • 20260519_staff_profile_extensions.sql   (profile detail columns)
--   • 20260521_staff_onboarding.sql           (onboarding lifecycle columns)
-- Running ONLY this file brings `profiles` to the schema the staff feature
-- expects, regardless of which earlier migrations did or did not run.
--
-- SAFETY:
--   • Purely ADDITIVE — every statement is `IF NOT EXISTS` / guarded.
--   • No column is altered, renamed or dropped. The legacy `phone` column is
--     left intact alongside the new `mobile` column.
--   • Existing staff default to onboarding_status='completed' — never
--     mislabelled as "pending".
--   • Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Profile detail columns (from staff_profile_extensions) ────────────────
alter table public.profiles
  add column if not exists first_name          text,
  add column if not exists middle_name         text,
  add column if not exists last_name           text,
  add column if not exists gender              text,
  add column if not exists mobile              text,
  add column if not exists email               text,
  add column if not exists address             text,
  add column if not exists profile_picture_url text,
  add column if not exists department          text,
  add column if not exists designation         text,
  add column if not exists subject             text,
  add column if not exists status              text not null default 'active',
  add column if not exists joining_date        date;

-- ── 2. Onboarding lifecycle columns (from staff_onboarding) ──────────────────
alter table public.profiles
  add column if not exists onboarding_status       text not null default 'completed',
  add column if not exists invite_sent_at          timestamptz,
  add column if not exists invite_email_status     text,
  add column if not exists invite_email_error      text,
  add column if not exists last_login_at           timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

-- ── 3. Whitelist constraints ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_status_chk
      check (status in ('active', 'invited', 'suspended', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_onboarding_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_status_chk
      check (onboarding_status in ('pending', 'invite_sent', 'completed'));
  end if;
end$$;

-- ── 4. Auto-populate legacy `name` from first/middle/last ────────────────────
-- Direct writers to `name` keep working; this only fills `name` from the
-- detail columns when first/last are present.
create or replace function public.profiles_compose_name()
returns trigger
language plpgsql
as $$
begin
  if (new.first_name is not null or new.last_name is not null) then
    if (new.name is null or btrim(new.name) = '' or tg_op = 'UPDATE') then
      new.name := btrim(
        coalesce(new.first_name, '') || ' ' ||
        coalesce(new.middle_name, '') || ' ' ||
        coalesce(new.last_name, '')
      );
      new.name := regexp_replace(new.name, '\s+', ' ', 'g');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_compose_name_trigger on public.profiles;
create trigger profiles_compose_name_trigger
before insert or update on public.profiles
for each row execute function public.profiles_compose_name();

-- ── 5. Case-insensitive email uniqueness ────────────────────────────────────
-- This is the natural-key lock that makes staff onboarding idempotent — a
-- second concurrent invite for the same email is rejected at the DB level.
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

-- ── 6. Profile-pictures storage bucket ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='profile_pictures_authenticated_write'
  ) then
    create policy profile_pictures_authenticated_write
      on storage.objects for insert to authenticated
      with check (bucket_id = 'profile-pictures');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='profile_pictures_authenticated_update'
  ) then
    create policy profile_pictures_authenticated_update
      on storage.objects for update to authenticated
      using (bucket_id = 'profile-pictures');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='profile_pictures_public_read'
  ) then
    create policy profile_pictures_public_read
      on storage.objects for select to public
      using (bucket_id = 'profile-pictures');
  end if;
end$$;

-- ── 7. Onboarding audit log ─────────────────────────────────────────────────
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

-- ── 8. Refresh PostgREST schema cache ───────────────────────────────────────
-- Without this the API can keep serving the stale "column not found" error
-- until the next automatic reload.
notify pgrst, 'reload schema';
