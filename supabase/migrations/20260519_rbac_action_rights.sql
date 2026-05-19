-- RBAC Action Rights (Phase 3).
--
-- Sibling layer to Phase 2's module/submodule grants. Where Phase 2
-- answers "can this role see X?", Phase 3 answers "can this role do X?".
-- The two layers are independent: a user might be able to see the Fees
-- module but not collect a fee, or vice versa.
--
-- Resolution order (mirrors Phase 2, implemented in TS):
--   user override action → role grant action → parent submodule visibility
--   → catalog default (allow)
--
-- The action catalog lives in TypeScript (see
-- src/features/rbac/constants/actionCatalog.ts) for the same reason as the
-- module catalog: adding actions shouldn't require a migration.

-- ── Per-role action grants ─────────────────────────────────────────────────
create table if not exists public.rbac_role_actions (
  id          uuid primary key default gen_random_uuid(),
  role        text not null,
  action_id   text not null,
  is_allowed  boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  constraint rbac_role_actions_unique unique (role, action_id)
);

create index if not exists rbac_role_actions_role_idx
  on public.rbac_role_actions (role);
create index if not exists rbac_role_actions_action_idx
  on public.rbac_role_actions (action_id);

-- ── Per-user overrides ─────────────────────────────────────────────────────
create table if not exists public.rbac_user_action_overrides (
  id               uuid primary key default gen_random_uuid(),
  user_profile_id  uuid not null references public.profiles(id) on delete cascade,
  action_id        text not null,
  is_allowed       boolean not null,
  reason           text,
  granted_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint rbac_user_actions_unique unique (user_profile_id, action_id)
);

create index if not exists rbac_user_actions_user_idx
  on public.rbac_user_action_overrides (user_profile_id);

-- ── Audit ──────────────────────────────────────────────────────────────────
create table if not exists public.rbac_action_audit (
  id               uuid primary key default gen_random_uuid(),
  actor_id         uuid references public.profiles(id) on delete set null,
  target_role      text,
  target_user_id   uuid references public.profiles(id) on delete set null,
  action_id        text,
  prev_is_allowed  boolean,
  new_is_allowed   boolean,
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists rbac_action_audit_role_idx
  on public.rbac_action_audit (target_role);
create index if not exists rbac_action_audit_user_idx
  on public.rbac_action_audit (target_user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Same policy shape as Phase 2: reads to any authenticated user (so the
-- client can resolve permissions); writes restricted to management/admin.
alter table public.rbac_role_actions          enable row level security;
alter table public.rbac_user_action_overrides enable row level security;
alter table public.rbac_action_audit          enable row level security;

do $$
begin
  -- ── role_actions ─────────────────────────────────────────────────────
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_role_actions'
                   and policyname='rbac_role_actions_read') then
    create policy rbac_role_actions_read
      on public.rbac_role_actions for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_role_actions'
                   and policyname='rbac_role_actions_write_management') then
    create policy rbac_role_actions_write_management
      on public.rbac_role_actions for all to authenticated
      using (exists (select 1 from public.profiles p
                     where p.user_id = auth.uid() and p.role in ('management','admin')))
      with check (exists (select 1 from public.profiles p
                          where p.user_id = auth.uid() and p.role in ('management','admin')));
  end if;

  -- ── user_action_overrides ────────────────────────────────────────────
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_user_action_overrides'
                   and policyname='rbac_user_actions_read_self_or_mgmt') then
    create policy rbac_user_actions_read_self_or_mgmt
      on public.rbac_user_action_overrides for select to authenticated
      using (
        exists (select 1 from public.profiles p where p.id = user_profile_id and p.user_id = auth.uid())
        or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role in ('management','admin'))
      );
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_user_action_overrides'
                   and policyname='rbac_user_actions_write_management') then
    create policy rbac_user_actions_write_management
      on public.rbac_user_action_overrides for all to authenticated
      using (exists (select 1 from public.profiles p
                     where p.user_id = auth.uid() and p.role in ('management','admin')))
      with check (exists (select 1 from public.profiles p
                          where p.user_id = auth.uid() and p.role in ('management','admin')));
  end if;

  -- ── action_audit ─────────────────────────────────────────────────────
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_action_audit'
                   and policyname='rbac_action_audit_read_management') then
    create policy rbac_action_audit_read_management
      on public.rbac_action_audit for select to authenticated
      using (exists (select 1 from public.profiles p
                     where p.user_id = auth.uid() and p.role in ('management','admin')));
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='rbac_action_audit'
                   and policyname='rbac_action_audit_insert_authenticated') then
    create policy rbac_action_audit_insert_authenticated
      on public.rbac_action_audit for insert to authenticated with check (true);
  end if;
end$$;
