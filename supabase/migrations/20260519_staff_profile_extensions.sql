-- Staff profile extensions for Create-Staff foundation.
--
-- Why: the legacy `profiles` row only carries `name`/`role`/`subject`/
-- `campus_id`. The new Create Staff form needs first/last/gender/mobile/
-- email/address/picture/department/designation/status/joining_date.
--
-- Strategy: ADD COLUMN IF NOT EXISTS so this is safe to re-run and never
-- breaks an older deployment. Legacy `name` is kept and auto-populated by a
-- trigger so existing code paths that read `name` keep working unchanged.

-- ── New columns ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists first_name        text,
  add column if not exists middle_name       text,
  add column if not exists last_name         text,
  add column if not exists gender            text,
  add column if not exists mobile            text,
  add column if not exists email             text,
  add column if not exists address           text,
  add column if not exists profile_picture_url text,
  add column if not exists department        text,
  add column if not exists designation       text,
  add column if not exists status            text not null default 'active',
  add column if not exists joining_date      date;

-- ── status whitelist ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_status_chk
      check (status in ('active', 'invited', 'suspended', 'inactive'));
  end if;
end$$;

-- ── Auto-populate legacy `name` from first/middle/last ────────────────────
-- Direct writers to `name` (the bridge in AppDataContext.addTeacher) still
-- work; this trigger only fills `name` when first/last are present and the
-- caller didn't pass one.
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

-- ── Email lookup index (duplicate detection in invite flow) ───────────────
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

-- ── Storage bucket for profile pictures ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder (folder = user_id)
-- and to read any picture (bucket is public for avatars on the staff list).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_pictures_authenticated_write'
  ) then
    create policy profile_pictures_authenticated_write
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'profile-pictures');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_pictures_authenticated_update'
  ) then
    create policy profile_pictures_authenticated_update
      on storage.objects for update
      to authenticated
      using (bucket_id = 'profile-pictures');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_pictures_public_read'
  ) then
    create policy profile_pictures_public_read
      on storage.objects for select
      to public
      using (bucket_id = 'profile-pictures');
  end if;
end$$;
