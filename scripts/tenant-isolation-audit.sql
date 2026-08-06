-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — RUNTIME TENANT-ISOLATION AUDIT
--
-- Read-only. Safe against production.
--   npx supabase db query --linked --file scripts/tenant-isolation-audit.sql
--
-- The CI gate (src/test/security/phase1.test.ts) proves the REPOSITORY is
-- correct. This proves the DATABASE is. Both are required, because several
-- migration PARTs are wrapped in `EXCEPTION WHEN insufficient_privilege` —
-- a hosted Supabase migration runner may not own storage.objects, so a
-- PARTIAL APPLY is a real and silent outcome.
--
-- Run after every Phase 1 deployment. Sections 1-8 must be clean before the
-- phase is signed off.
-- ════════════════════════════════════════════════════════════════════════════

\echo '══ 0. ORGANIZATIONS ════════════════════════════════════════════════════'
\echo 'Expected after Phase 1: exactly one row — ARK Learning Arena.'
SELECT id, slug, display_name, status, provisioned_at FROM public.organizations;

SELECT principal_kind, count(*) AS members
  FROM public.organization_users GROUP BY principal_kind ORDER BY principal_kind;


\echo ''
\echo '══ 1. TABLES MISSING organization_id ═══════════════════════════════════'
\echo 'MUST be empty. Any row is a table with no tenant boundary at all.'
SELECT c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND public.is_tenant_scoped_table(c.relname)
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname
                      AND column_name='organization_id')
 ORDER BY 1;


\echo ''
\echo '══ 2. organization_id COLUMNS NOT FULLY CONSTRAINED ════════════════════'
\echo 'MUST be empty. Nullable = an unstamped row can exist; no default = the'
\echo 'application would have to send the tenant itself (it does not).'
SELECT table_name,
       is_nullable,
       column_default,
       CASE WHEN is_nullable = 'YES' THEN 'NOT NULL missing'
            WHEN column_default IS NULL THEN 'DEFAULT missing'
            ELSE 'ok' END AS problem
  FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'organization_id'
   AND public.is_tenant_scoped_table(table_name)
   AND (is_nullable = 'YES' OR column_default IS NULL)
 ORDER BY table_name;


\echo ''
\echo '══ 3. ROWS NOT ASSIGNED TO AN ORGANIZATION ═════════════════════════════'
\echo 'MUST report 0 for every table. A NULL here is an orphaned record.'
DO $$
DECLARE r RECORD; n bigint; total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS t FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r'
       AND public.is_tenant_scoped_table(c.relname)
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname
                      AND column_name='organization_id')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', r.t) INTO n;
    IF n > 0 THEN
      RAISE WARNING 'ORPHANED: %.% rows have NULL organization_id', r.t, n;
      total := total + n;
    END IF;
  END LOOP;
  IF total = 0 THEN RAISE NOTICE 'All rows assigned to an organization.';
  ELSE RAISE WARNING '% orphaned row(s) total — re-run migration 1B.', total; END IF;
END $$;


\echo ''
\echo '══ 4. POLICIES WITHOUT A TENANT CONJUNCT ═══════════════════════════════'
\echo 'MUST be empty. Each row is a policy that would return another tenant''s'
\echo 'rows the moment a second organization exists.'
SELECT tablename, policyname, cmd
  FROM pg_policies p
 WHERE schemaname='public' AND public.is_tenant_scoped_table(p.tablename)
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p.tablename
                  AND column_name='organization_id')
   AND COALESCE(qual,'')       NOT LIKE '%current_org_id%'
   AND COALESCE(with_check,'') NOT LIKE '%current_org_id%'
 ORDER BY tablename, policyname;


\echo ''
\echo '══ 5. TABLES WITHOUT ENABLED + FORCED RLS ══════════════════════════════'
\echo 'MUST be empty. Without FORCE, the table OWNER bypasses RLS — and that is'
\echo 'the role migrations run as.'
SELECT c.relname AS table_name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND public.is_tenant_scoped_table(c.relname)
   AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
 ORDER BY 1;


\echo ''
\echo '══ 6. STORAGE POLICIES WITHOUT A TENANT CHECK ══════════════════════════'
\echo 'MUST be empty except profile_pictures_public_read (avatars, deliberate).'
SELECT policyname, cmd
  FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND policyname <> 'profile_pictures_public_read'
   AND COALESCE(qual,'')       NOT LIKE '%storage_path_org_ok%'
   AND COALESCE(with_check,'') NOT LIKE '%storage_path_org_ok%'
 ORDER BY policyname;


\echo ''
\echo '══ 7. SECURITY DEFINER FUNCTIONS WITHOUT A TENANT BOUND ════════════════'
\echo 'These BYPASS RLS. Any function reading tenant tables without'
\echo 'current_org_id() is a hole RLS cannot close.'
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
   AND p.prosrc NOT LIKE '%current_org_id%'
   AND p.prosrc NOT LIKE '%organization_id%'
   -- The tenant primitives themselves must not reference it (they define it).
   AND p.proname NOT IN ('jwt_org_id','fallback_org_id','current_org_id',
                         'is_organization_member','resolve_organization',
                         'custom_access_token_hook','is_tenant_scoped_table',
                         'assert_multi_tenant_ready','storage_entity_segment',
                         'default_academic_year','update_updated_at_column')
 ORDER BY p.proname;


\echo ''
\echo '══ 8. READINESS FLAGS ══════════════════════════════════════════════════'
\echo 'A second organization is BLOCKED until every flag is ready.'
\echo 'composite_unique_keys is EXPECTED to be false after Phase 1.'
SELECT flag, ready, note FROM public.tenancy_readiness ORDER BY flag;


\echo ''
\echo '══ 9. THE SECOND-ORGANIZATION GUARD IS ARMED ═══════════════════════════'
SELECT EXISTS (
  SELECT 1 FROM pg_trigger
   WHERE tgname = 'trg_assert_multi_tenant_ready' AND NOT tgisinternal
) AS guard_installed;


\echo ''
\echo '══ 10. ACCESS-TOKEN HOOK ═══════════════════════════════════════════════'
\echo 'The function existing is NOT enough — it must also be REGISTERED in'
\echo 'Dashboard -> Authentication -> Hooks -> Customize Access Token.'
\echo 'Until then every session uses the single-tenant fallback.'
SELECT EXISTS (
  SELECT 1 FROM pg_proc
   WHERE proname='custom_access_token_hook' AND pronamespace='public'::regnamespace
) AS hook_function_exists;

\echo ''
\echo '══ 11. INDEX COVERAGE ══════════════════════════════════════════════════'
\echo 'Tables whose organization_id is not the LEADING index column. Each is a'
\echo 'cross-tenant scan waiting to happen at scale.'
SELECT c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND public.is_tenant_scoped_table(c.relname)
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=c.relname
                  AND column_name='organization_id')
   AND NOT EXISTS (
     SELECT 1 FROM pg_index i JOIN pg_attribute a
       ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
      WHERE i.indrelid=c.oid AND a.attname='organization_id')
 ORDER BY 1;


\echo ''
\echo '══ 12. ARK DATA INTEGRITY ══════════════════════════════════════════════'
\echo 'Row counts for the core tables. Compare against the pre-migration'
\echo 'baseline captured in the deployment checklist — they must match EXACTLY.'
SELECT 'students' AS t, count(*) FROM public.students
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'student_attendance', count(*) FROM public.student_attendance
UNION ALL SELECT 'student_fees', count(*) FROM public.student_fees
UNION ALL SELECT 'payroll_items', count(*) FROM public.payroll_items
UNION ALL SELECT 'leads', count(*) FROM public.leads
UNION ALL SELECT 'exam_results', count(*) FROM public.exam_results
ORDER BY 1;

\echo ''
\echo '══ AUDIT COMPLETE ══════════════════════════════════════════════════════'
\echo 'Sections 1-7, 9, 11 must be EMPTY/true. Section 8: composite_unique_keys'
\echo 'false is expected. Section 12 must match the pre-migration baseline.'
