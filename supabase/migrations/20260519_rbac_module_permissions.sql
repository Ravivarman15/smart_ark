-- RBAC module/submodule permission system (Phase 2).
--
-- Schema design notes:
--   - The *catalog* of modules/submodules lives in TypeScript
--     (src/features/rbac/constants/catalog.ts), not the DB. Adding a new
--     module is a code change, not a migration — keeps the deploy story
--     simple as the catalog evolves.
--   - The DB stores **grants**: per-role defaults + per-user overrides.
--   - submodule_id is nullable so a row can represent "module-wide" access.
--
-- Effective permission resolution (implemented in TS, mirrored on the
-- server when an edge-function gate is added):
--   user override → role grant → catalog default (permissive = visible)
--
-- Backwards compat: the legacy `staff_rights` / `staff_action_rights`
-- tables are NOT touched. The new RBAC layer sits ABOVE them — if a
-- module/submodule has no rows here, the legacy system still applies.
-- The merge happens in `useSidebarAccess` on the client.

-- ── Per-role grants ────────────────────────────────────────────────────────
create table if not exists public.rbac_role_permissions (
  id            uuid primary key default gen_random_uuid(),
  role          text not null,
  module_id     text not null,
  submodule_id  text, -- null = module-level grant
  can_view      boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null,
  constraint rbac_role_permissions_unique unique (role, module_id, submodule_id)
);

create index if not exists rbac_role_permissions_role_idx
  on public.rbac_role_permissions (role);

-- ── Per-user overrides ─────────────────────────────────────────────────────
create table if not exists public.rbac_user_permission_overrides (
  id               uuid primary key default gen_random_uuid(),
  user_profile_id  uuid not null references public.profiles(id) on delete cascade,
  module_id        text not null,
  submodule_id     text,
  can_view         boolean not null,
  reason           text,
  granted_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint rbac_user_overrides_unique unique (user_profile_id, module_id, submodule_id)
);

create index if not exists rbac_user_overrides_user_idx
  on public.rbac_user_permission_overrides (user_profile_id);

-- ── Permission change audit ────────────────────────────────────────────────
-- Append-only log of every grant change. Read by the future "permission
-- history" view; nothing in the app consumes it yet.
create table if not exists public.rbac_permission_audit (
  id               uuid primary key default gen_random_uuid(),
  actor_id         uuid references public.profiles(id) on delete set null,
  target_role      text,
  target_user_id   uuid references public.profiles(id) on delete set null,
  module_id        text,
  submodule_id     text,
  prev_can_view    boolean,
  new_can_view     boolean,
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists rbac_permission_audit_target_role_idx
  on public.rbac_permission_audit (target_role);
create index if not exists rbac_permission_audit_target_user_idx
  on public.rbac_permission_audit (target_user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Enable RLS on all three tables and gate writes to management/admin.
-- Reads are allowed to any authenticated user so the client can resolve
-- "what can I see?" without needing a service-role round-trip.
alter table public.rbac_role_permissions       enable row level security;
alter table public.rbac_user_permission_overrides enable row level security;
alter table public.rbac_permission_audit       enable row level security;

do $$
begin
  -- ── rbac_role_permissions ────────────────────────────────────────────
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_role_permissions'
      and policyname='rbac_role_permissions_read'
  ) then
    create policy rbac_role_permissions_read
      on public.rbac_role_permissions for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_role_permissions'
      and policyname='rbac_role_permissions_write_management'
  ) then
    create policy rbac_role_permissions_write_management
      on public.rbac_role_permissions for all
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      );
  end if;

  -- ── rbac_user_permission_overrides ───────────────────────────────────
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_user_permission_overrides'
      and policyname='rbac_user_overrides_read_own_or_mgmt'
  ) then
    create policy rbac_user_overrides_read_own_or_mgmt
      on public.rbac_user_permission_overrides for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = user_profile_id and p.user_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_user_permission_overrides'
      and policyname='rbac_user_overrides_write_management'
  ) then
    create policy rbac_user_overrides_write_management
      on public.rbac_user_permission_overrides for all
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      );
  end if;

  -- ── rbac_permission_audit ────────────────────────────────────────────
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_permission_audit'
      and policyname='rbac_audit_read_management'
  ) then
    create policy rbac_audit_read_management
      on public.rbac_permission_audit for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role in ('management', 'admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_permission_audit'
      and policyname='rbac_audit_insert_authenticated'
  ) then
    -- Anyone may insert (the API enforces actor_id = current user); reads
    -- are still gated to management.
    create policy rbac_audit_insert_authenticated
      on public.rbac_permission_audit for insert
      to authenticated
      with check (true);
  end if;
end$$;
