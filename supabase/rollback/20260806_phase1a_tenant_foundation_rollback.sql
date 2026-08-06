-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 1A (TENANT FOUNDATION)                          2026-08-06
--
-- Run LAST (order: 1C → 1B → 1A).
--
-- 1A was purely additive — it created new tables and functions and touched no
-- existing business table or row. Rolling it back is therefore a clean DROP:
-- ARK's students, staff, fees, payroll and attendance are not referenced here
-- and cannot be affected.
--
-- ⚠ PREREQUISITE: 1C and 1B must be rolled back first. Business tables still
--   carrying an organization_id FK to organizations(id) would block the DROP.
--   PART 0 checks and refuses rather than half-dropping the spine.
--
-- ⚠ BEFORE RUNNING: deregister the access-token hook in the Supabase dashboard
--   (Authentication → Hooks). A registered hook pointing at a dropped function
--   makes GoTrue fail on every token issuance — i.e. nobody can log in.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 0 — preconditions ──────────────────────────────────────────────────
DO $$
DECLARE deps int;
BEGIN
  SELECT count(*) INTO deps
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.confrelid
   WHERE t.relname = 'organizations'
     AND c.contype = 'f'
     AND c.conrelid::regclass::text NOT LIKE 'organization%';

  IF deps > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop the tenant foundation: % business table(s) still '
      'reference organizations(id). Roll back 1C then 1B first.', deps;
  END IF;
END $$;


-- ── PART 1 — restore the pre-1C helper definitions ──────────────────────────
-- 1C redefined these to reference current_org_id(). If 1C's rollback was run
-- they are already restored; this is belt-and-braces so dropping
-- current_org_id() below can never leave a dangling reference.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.has_any_role(_roles TEXT[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                  WHERE user_id = auth.uid() AND is_active AND role::text = ANY (_roles));
$$;


-- ── PART 2 — drop tenant resolution ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS public.resolve_organization(text);
DROP FUNCTION IF EXISTS public.require_organization();
DROP FUNCTION IF EXISTS public.is_organization_member(uuid);
DROP FUNCTION IF EXISTS public.current_org_id();
DROP FUNCTION IF EXISTS public.fallback_org_id();
DROP FUNCTION IF EXISTS public.jwt_org_id();
DROP FUNCTION IF EXISTS public.is_tenant_scoped_table(text);


-- ── PART 3 — drop the foundation tables ─────────────────────────────────────
-- Child-first so no CASCADE is needed. CASCADE is avoided deliberately: it
-- would silently drop anything unexpectedly depending on these tables, and
-- "silently drop" is not a property a rollback script should have.
DROP TABLE IF EXISTS public.organization_audit;
DROP TABLE IF EXISTS public.organization_subscriptions;
DROP TABLE IF EXISTS public.organization_branding;
DROP TABLE IF EXISTS public.organization_domains;
DROP TABLE IF EXISTS public.organization_settings;
DROP TABLE IF EXISTS public.organization_branches;
DROP TABLE IF EXISTS public.organization_users;
DROP TABLE IF EXISTS public.organizations;

DROP TABLE IF EXISTS public.tenancy_readiness;
-- tenancy_policy_backup is KEPT: it holds the only record of the pre-Phase-1
-- authorization expressions. Drop it manually once you are certain Phase 1
-- will not be re-attempted.

NOTIFY pgrst, 'reload schema';
