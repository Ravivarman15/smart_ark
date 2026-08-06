-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 3A (MARKETING, CMS, ONBOARDING, DEMO MODE)      2026-08-15
--
-- Phase 3A added new tables plus ONE change to existing behaviour: the demo
-- write-guard wrapped every tenant WRITE policy with `NOT is_demo_org()`.
-- PART 1 undoes that from the snapshot Phase 3A took before wrapping, so the
-- original expressions are RESTORED rather than reconstructed.
--
-- ⚠ REVERT THE FRONTEND TOO. The marketing site calls public_status() and
--   reads plans as anon; against a rolled-back database those requests fail.
--   The ERP itself is unaffected either way — nothing in it reads Phase 3
--   tables.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 0 — refuse if a demo tenant is live ────────────────────────────────
-- Removing the guard while a demo organization exists makes it writable by
-- every anonymous visitor who can reach a login for it.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.organizations WHERE is_demo AND deleted_at IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'Refusing to remove the demo write-guard: % demo organization(s) exist. '
      'Set is_demo = false (or delete them) first.', n;
  END IF;
END $$;


-- ── PART 1 — restore the pre-3A write policies ──────────────────────────────
DO $$
DECLARE b RECORD; n int := 0;
BEGIN
  FOR b IN
    SELECT * FROM public.tenancy_policy_backup
     WHERE schema_name = 'public'
     ORDER BY table_name, policy_name
  LOOP
    -- Only policies that currently carry the demo guard.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = b.schema_name AND p.tablename = b.table_name
         AND p.policyname = b.policy_name
         AND (COALESCE(p.qual,'') LIKE '%is_demo_org%'
              OR COALESCE(p.with_check,'') LIKE '%is_demo_org%')
    ) THEN CONTINUE; END IF;

    BEGIN
      IF b.orig_qual IS NOT NULL AND b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                       b.policy_name, b.table_name, b.orig_qual, b.orig_check);
      ELSIF b.orig_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                       b.policy_name, b.table_name, b.orig_qual);
      ELSIF b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                       b.policy_name, b.table_name, b.orig_check);
      END IF;
      n := n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Rollback 3A: could not restore %.%: %', b.table_name, b.policy_name, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Rollback 3A: restored % write policy/policies.', n;
END $$;

DROP FUNCTION IF EXISTS public.is_demo_org();

-- is_demo is left in place: it is a nullable-defaulted boolean that nothing
-- reads once the guard is gone, and dropping a column is the one irreversible
-- act this file could commit.


-- ── PART 2 — public plan visibility ─────────────────────────────────────────
DROP POLICY IF EXISTS plans_anon_read         ON public.plans;
DROP POLICY IF EXISTS plan_prices_anon_read   ON public.plan_prices;
DROP POLICY IF EXISTS plan_features_anon_read ON public.plan_features;


-- ── PART 3 — drop Phase 3 tables ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.public_status();

DROP TABLE IF EXISTS public.marketing_events;
DROP TABLE IF EXISTS public.status_incidents;
DROP TABLE IF EXISTS public.status_components;
DROP TABLE IF EXISTS public.content_posts;
DROP TABLE IF EXISTS public.content_categories;
DROP TABLE IF EXISTS public.content_authors;
DROP TABLE IF EXISTS public.platform_enquiries;
DROP TABLE IF EXISTS public.platform_trial_signups;
DROP TABLE IF EXISTS public.platform_demo_requests;

NOTIFY pgrst, 'reload schema';
