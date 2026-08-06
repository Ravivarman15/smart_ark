-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 1C (TENANT RLS)                                 2026-08-06
--
-- Rollback order for Phase 1:  1C → 1B → 1A.
--
-- Restores every policy expression from public.tenancy_policy_backup, which 1C
-- captured BEFORE wrapping anything. This is an exact restore of the original
-- authorization logic — not a regex attempting to unpick a wrapper from 362
-- live SQL predicates, which is how an authorization rule gets silently
-- corrupted.
--
-- ⚠ This removes tenant isolation. PART 0 refuses to run if a second
--   organization exists, because doing so would expose every tenant's data.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 0 — refuse to disarm isolation on a genuinely multi-tenant DB ──────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.organizations WHERE deleted_at IS NULL;
  IF n > 1 THEN
    RAISE EXCEPTION
      'Refusing to roll back tenant RLS: % organizations exist. Removing the '
      'tenant conjunct would expose every tenant''s data to every other tenant.', n;
  END IF;
END $$;


-- ── PART 1 — restore public + storage policy expressions ────────────────────
DO $$
DECLARE
  b RECORD;
  n int := 0;
  still int;
BEGIN
  FOR b IN
    SELECT * FROM public.tenancy_policy_backup ORDER BY schema_name, table_name, policy_name
  LOOP
    -- Skip policies that no longer exist (dropped by a later migration).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = b.schema_name AND tablename = b.table_name
         AND policyname = b.policy_name
    ) THEN CONTINUE; END IF;

    BEGIN
      IF b.orig_qual IS NOT NULL AND b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                       b.policy_name, b.schema_name, b.table_name, b.orig_qual, b.orig_check);
      ELSIF b.orig_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                       b.policy_name, b.schema_name, b.table_name, b.orig_qual);
      ELSIF b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                       b.policy_name, b.schema_name, b.table_name, b.orig_check);
      END IF;
      n := n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not restore policy %.%.%: % — inspect manually.',
        b.schema_name, b.table_name, b.policy_name, SQLERRM;
    END;
  END LOOP;

  SELECT count(*) INTO still FROM pg_policies
   WHERE (COALESCE(qual,'') LIKE '%current_org_id%'
          OR COALESCE(qual,'') LIKE '%storage_path_org_ok%'
          OR COALESCE(with_check,'') LIKE '%current_org_id%'
          OR COALESCE(with_check,'') LIKE '%storage_path_org_ok%');

  RAISE NOTICE 'Rollback 1C: restored % policies; % still carry a tenant conjunct.', n, still;
END $$;


-- ── PART 2 — restore the pre-1C helper definitions ──────────────────────────
-- Exactly as they stood after Phase 0, i.e. without the organization conjunct.

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

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE user_id = _user_id LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_parent_account_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.parent_auth_accounts
   WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.current_parent_account_id() IS NOT NULL; $$;

CREATE OR REPLACE FUNCTION public.parent_child_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.student_id FROM public.parent_student_links l
   WHERE l.parent_account_id = public.current_parent_account_id();
$$;

CREATE OR REPLACE FUNCTION public.get_financial_summary(p_campus_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result JSON; user_role app_role;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE user_id = auth.uid();
  IF user_role != 'management' THEN
    RAISE EXCEPTION 'Access denied: 403 Forbidden';
  END IF;
  SELECT json_build_object(
    'total_collected', COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END), 0),
    'total_pending',   COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END), 0),
    'total_fees',      COALESCE(SUM(amount), 0),
    'paid_count',      COUNT(*) FILTER (WHERE paid),
    'total_count',     COUNT(*),
    'collection_pct',  CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE paid)::NUMERIC / COUNT(*)::NUMERIC) * 100, 1) ELSE 0 END
  ) INTO result
  FROM public.fee_transactions
  WHERE (p_campus_id IS NULL OR campus_id = p_campus_id);
  RETURN result;
END; $$;


-- ── PART 3 — drop the storage tenant helper ─────────────────────────────────
DROP FUNCTION IF EXISTS public.storage_path_org_ok(text);

UPDATE public.tenancy_readiness
   SET ready = false, updated_at = now()
 WHERE flag IN ('rls_tenant_scoped', 'storage_org_partitioned');

-- tenancy_policy_backup is deliberately KEPT. It is the only record of the
-- pre-Phase-1 authorization logic; dropping it would make a second rollback
-- attempt impossible.

NOTIFY pgrst, 'reload schema';
