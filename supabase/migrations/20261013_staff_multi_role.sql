-- ─────────────────────────────────────────────────────────────────────────────
-- ONE PERSON, SEVERAL ROLES — and a portal switch that is actually real.
--
-- THE REQUIREMENT
-- Magi is both a teacher and a coordinator at abc-academi. One login. After
-- signing in she picks which portal to enter, and she can switch between them
-- afterwards without signing in again, with everything changing.
--
-- WHY THIS CANNOT BE A CLIENT-SIDE TOGGLE
-- The parent portal's child switcher IS client-side, and correctly so: RLS
-- already grants a parent every one of their children, so choosing a child only
-- narrows what is displayed. Nothing about the database changes.
--
-- Staff roles are the opposite. 195 of the 572 RLS policies in this database
-- resolve the caller's role through get_user_role() / has_any_role() /
-- has_role(), all of which read profiles.role. If the active role lived only in
-- React, Magi would see the coordinator portal render and every query inside it
-- return nothing. The active role has to be a fact the database can see.
--
-- THE MODEL — three distinct ideas that were previously one column
--
--   profiles.role         WHAT SHE IS. Her home role. Drives the staff
--                         directory, teacher dropdowns, payroll grouping. Never
--                         touched by a portal switch, so switching does not
--                         change how anyone ELSE sees her.
--   staff_role_grants     WHAT SHE MAY BE. The additional hats she is allowed
--                         to wear, granted by an admin.
--   profiles.active_role  WHICH HAT SHE IS WEARING RIGHT NOW. The only thing a
--                         portal switch writes.
--
-- effective_role() folds the three into the one answer RLS wants, and the three
-- role functions are re-pointed at it. That is the entire mechanism: no policy
-- is rewritten, and no table gains a join.
--
-- PROVABLY A NO-OP UNTIL SOMEONE OPTS IN
-- active_role is NULL on every existing row and staff_role_grants starts empty,
-- so effective_role() returns profiles.role for all 30 staff — byte-identical
-- to today's behaviour across all 195 policies. Verified before and after.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Which hat is being worn ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists active_role public.app_role;

comment on column public.profiles.active_role is
  'The role this person is currently acting as. NULL = their primary `role`. Only ever written by switch_active_role(), which validates the target against staff_role_grants. Never read as "what this person is" — that is `role`.';

-- ── 2. Which hats they are allowed to wear ──────────────────────────────────

create table if not exists public.staff_role_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            public.app_role not null,
  granted_by      uuid references public.profiles(id) on delete set null,
  granted_at      timestamptz not null default now(),
  -- One grant per role per person. Without this, revoking "coordinator" could
  -- leave a second coordinator row behind and silently fail to revoke anything.
  unique (profile_id, role)
);

create index if not exists idx_staff_role_grants_profile on public.staff_role_grants (profile_id);
create index if not exists idx_staff_role_grants_org on public.staff_role_grants (organization_id);

comment on table public.staff_role_grants is
  'Additional roles a staff member may act as, beyond profiles.role. A grant is permission to SWITCH to a role, not the act of being in it.';

alter table public.staff_role_grants enable row level security;

do $$
begin
  -- Readable by staff of the same organization: the staff directory shows who
  -- holds which roles, and a person must be able to see their own grants to be
  -- offered the portal switch at all.
  if not exists (select 1 from pg_policy
                  where polrelid = 'public.staff_role_grants'::regclass
                    and polname = 'staff_role_grants_read') then
    create policy staff_role_grants_read on public.staff_role_grants
      for select to authenticated
      using (organization_id = public.current_org_id() and public.is_staff());
  end if;

  -- Granting a role is granting access. Restricted to admin/management, and
  -- deliberately NOT to coordinators, who manage staff in other respects.
  if not exists (select 1 from pg_policy
                  where polrelid = 'public.staff_role_grants'::regclass
                    and polname = 'staff_role_grants_write') then
    create policy staff_role_grants_write on public.staff_role_grants
      for all to authenticated
      using (organization_id = public.current_org_id()
             and public.has_any_role(array['admin', 'management']))
      with check (organization_id = public.current_org_id()
             and public.has_any_role(array['admin', 'management']));
  end if;
end $$;

-- ── 3. The one definition of "which role is in force" ───────────────────────

create or replace function public.effective_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
           -- Never switched: exactly today's behaviour.
           when p.active_role is null      then p.role
           -- Switched back to their own home role.
           when p.active_role = p.role     then p.role
           -- Wearing a granted hat.
           when exists (select 1 from public.staff_role_grants g
                         where g.profile_id = p.id
                           and g.role = p.active_role
                           and g.organization_id = p.organization_id)
                                           then p.active_role
           -- The grant was REVOKED while they were wearing it. Fall straight
           -- back to the primary role rather than honouring a stale pointer:
           -- revocation must take effect on the next query, not whenever
           -- someone remembers to clear active_role.
           else p.role
         end
    from public.profiles p
   where p.user_id = _user_id
     and p.organization_id = public.current_org_id()
   limit 1;
$function$;

comment on function public.effective_role(uuid) is
  'The role in force for this session: active_role when it is still granted, otherwise the primary role. The single definition behind get_user_role/has_any_role/has_role.';

-- ── 4. Re-point the three role functions ────────────────────────────────────
--
-- Bodies only; signatures, volatility and security are unchanged, so all 195
-- policies pick this up without being touched.

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.effective_role(_user_id);
$function$;

create or replace function public.has_any_role(_roles text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and p.is_active
       and p.organization_id = public.current_org_id()
       -- `is_active` stays part of the test: a deactivated account must not
       -- pass a role check just because it still holds a role.
       and public.effective_role(auth.uid())::text = any (_roles)
  );
$function$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.effective_role(_user_id) = _role;
$function$;

-- ── 5. Which portals a person may enter ─────────────────────────────────────

create or replace function public.staff_available_roles(_profile_id uuid)
returns setof public.app_role
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- The primary role first: it is the home portal, and the UI orders by this.
  select p.role from public.profiles p where p.id = _profile_id
  union
  select g.role from public.staff_role_grants g where g.profile_id = _profile_id;
$function$;

-- ── 6. The switch itself ────────────────────────────────────────────────────

create or replace function public.switch_active_role(_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _profile uuid;
  _org     uuid;
begin
  -- SECURITY DEFINER because it writes profiles.active_role, which no staff
  -- member may write directly. If this were a client UPDATE, a teacher could
  -- set active_role = 'admin' and every one of the 195 policies would believe
  -- them. The grant check below is the only thing standing there, so it runs
  -- before the write and against the database's own tables, never against
  -- anything the caller supplied.
  _profile := public.current_profile_id();
  if _profile is null then
    raise exception 'No staff profile for this session' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.staff_available_roles(_profile) r where r = _role
  ) then
    raise exception 'The % portal has not been granted to you', _role
      using errcode = '42501';
  end if;

  update public.profiles
     set active_role = _role,
         updated_at  = now()
   where id = _profile
  returning organization_id into _org;

  -- Audited: a role switch changes what ~195 policies allow, which is exactly
  -- the kind of event that has to be reconstructable afterwards.
  -- organization_id is NOT NULL here and has no usable default, so it is
  -- stamped explicitly.
  insert into public.auth_login_audit (subject_type, user_id, event, detail, organization_id)
  values ('staff', auth.uid(), 'role_switch', _role::text, _org);

  return _role;
end;
$function$;

comment on function public.switch_active_role(public.app_role) is
  'Enter one of your granted portals. Validates against staff_available_roles before writing profiles.active_role, and audits the change.';

-- Callable by any signed-in staff member: it authorises itself against that
-- person''s own grants. Admin rights are needed to GRANT a role, never to enter
-- one already granted — otherwise an admin who switched to the teacher portal
-- could not switch back out of it.
revoke all on function public.switch_active_role(public.app_role) from public;
grant execute on function public.switch_active_role(public.app_role) to authenticated;

revoke all on function public.staff_available_roles(uuid) from public;
grant execute on function public.staff_available_roles(uuid) to authenticated;
