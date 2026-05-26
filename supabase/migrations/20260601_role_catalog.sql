-- Role Catalog (Phase 5) — central registry of every staff role.
--
-- Until now, "roles" were 4 hardcoded strings stored in profiles.role.
-- This migration adds a managed catalog so management can:
--   - Create custom roles (Accountant, Front Office, Exam Cell, …)
--   - Clone an existing role and tweak permissions
--   - Tag roles with category, hierarchy level, icon / colour
--   - Archive a role without destroying its audit trail
--
-- Compatibility:
--   - The 4 built-in roles are seeded as is_system=true rows. The slug
--     matches the existing profiles.role text (admin/management/coordinator/
--     teacher) so every existing query, RLS policy and matrix grant keeps
--     working — they all key off the same `role` text column.
--   - rbac_role_permissions.role and rbac_role_actions.role already accept
--     any text value, so no FK changes are required for custom-role grants.
--   - Older deployments without this migration applied just see no custom
--     roles — the existing 4 built-ins continue to work via the seeded
--     defaultRoles in the TS catalog.

create table if not exists public.rbac_roles (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  description        text,
  category           text,                                   -- 'leadership' | 'operations' | 'academic' | 'finance' | 'support' | etc
  hierarchy_level    int  not null default 50,               -- 0 highest (management) → 100 lowest
  base_role          text,                                   -- which layout/route the role lands in: admin/teacher/coordinator/management
  color              text default 'slate',
  icon               text default 'Shield',
  is_active          boolean not null default true,
  is_system          boolean not null default false,         -- built-in 4 roles — UI hides destructive actions
  is_archived        boolean not null default false,
  parent_role_slug   text,                                   -- soft hierarchy pointer (no FK so archives don't cascade)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null
);

create index if not exists rbac_roles_category_idx on public.rbac_roles (category);
create index if not exists rbac_roles_active_idx   on public.rbac_roles (is_active) where is_active = true;
create index if not exists rbac_roles_parent_idx   on public.rbac_roles (parent_role_slug);

-- Append-only audit of role lifecycle events. Permission-grant audits
-- continue to live in rbac_permission_audit / rbac_action_audit.
create table if not exists public.rbac_role_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  role_slug   text not null,
  event_type  text not null,    -- 'created' | 'updated' | 'cloned' | 'archived' | 'unarchived' | 'permissions_changed' | 'users_assigned'
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists rbac_role_audit_role_idx on public.rbac_role_audit (role_slug);
create index if not exists rbac_role_audit_event_idx on public.rbac_role_audit (event_type);

-- Seed the 4 built-in roles. Idempotent — re-running the migration is a no-op
-- and never overwrites operator edits to name/description/colour/etc.
insert into public.rbac_roles
  (slug, name, description, category, hierarchy_level, base_role, color, icon, is_system, parent_role_slug)
values
  ('management',  'Management',  'Executive role with full system access. Bypasses RBAC.', 'leadership', 0,  'management',  'amber',   'Crown',          true, null),
  ('admin',       'Admin',       'Operations administrator. Day-to-day control of staff, students, fees.', 'operations', 20, 'admin',       'blue',    'ShieldCheck',    true, 'management'),
  ('coordinator', 'Coordinator', 'Academic coordinator. Owns enquiries, tasks and a slice of students.',  'academic',   40, 'coordinator', 'emerald', 'Users',          true, 'admin'),
  ('teacher',     'Teacher',     'Teaching staff. Attendance, marks, leave, support requests.',          'academic',   60, 'teacher',     'sky',     'GraduationCap',  true, 'coordinator')
on conflict (slug) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.rbac_roles      enable row level security;
alter table public.rbac_role_audit enable row level security;

do $$
begin
  -- Read: any authenticated user (catalog drives the UI's role pickers).
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_roles' and policyname='rbac_roles_read'
  ) then
    create policy rbac_roles_read
      on public.rbac_roles for select
      to authenticated
      using (true);
  end if;

  -- Write: management or admin only — matches the existing grant matrix.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_roles' and policyname='rbac_roles_write'
  ) then
    create policy rbac_roles_write
      on public.rbac_roles for all
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

  -- Audit: management can read, anyone authenticated can insert via service.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rbac_role_audit' and policyname='rbac_role_audit_read'
  ) then
    create policy rbac_role_audit_read
      on public.rbac_role_audit for select
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
    where schemaname='public' and tablename='rbac_role_audit' and policyname='rbac_role_audit_insert'
  ) then
    create policy rbac_role_audit_insert
      on public.rbac_role_audit for insert
      to authenticated
      with check (true);
  end if;
end$$;
