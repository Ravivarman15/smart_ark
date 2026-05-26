-- RBAC realtime propagation fix.
--
-- Background: `RbacRealtimeProvider` subscribes to postgres_changes on the
-- seven RBAC tables so any grant or override edit fans out instantly to
-- every signed-in user's React Query cache. But those events only fire if
-- the tables are members of the `supabase_realtime` publication. The
-- earlier RBAC migrations created the tables and RLS but did NOT add them
-- to the publication, so events were silently dropped — management would
-- save a teacher-role change, the row would land in the database, but the
-- teacher's tab would not refresh until a hard reload.
--
-- This migration is purely additive and idempotent. Each `alter publication
-- add table` is wrapped in a duplicate_object catch so re-running the
-- migration after some tables were already added is a no-op.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'rbac_role_permissions',
    'rbac_user_permission_overrides',
    'rbac_role_actions',
    'rbac_user_action_overrides',
    'rbac_roles',
    'rbac_permission_audit',
    'rbac_role_audit'
  ]
  loop
    -- Only add the table if it exists in this deployment AND isn't already
    -- in the publication. Tables that haven't been created (because their
    -- creation migration wasn't run yet) are silently skipped.
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tbl and c.relkind = 'r'
    ) and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end$$;
