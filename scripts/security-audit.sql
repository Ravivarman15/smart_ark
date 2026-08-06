-- ════════════════════════════════════════════════════════════════════════════
-- SMART ARK — RUNTIME SECURITY AUDIT
--
-- Read-only. Safe to run against production at any time.
--
--   npx supabase db query --linked --file scripts/security-audit.sql
--   (or paste into the Supabase SQL editor)
--
-- WHY THIS EXISTS ALONGSIDE THE CI GATE
-- -------------------------------------
-- src/test/security/phase0.test.ts proves the REPOSITORY is correct: the right
-- SQL is committed, no edge function decodes a JWT unverified, the headers are
-- configured. It cannot prove the DATABASE is correct — a migration may have
-- been skipped, partially applied (several PARTs are wrapped in exception
-- handlers for exactly that reason), or hand-edited in the dashboard.
--
-- This script closes that gap. Run it after every deploy that touches
-- migrations, and before signing off any phase.
-- ════════════════════════════════════════════════════════════════════════════

\echo '══ 1. PUBLIC STORAGE BUCKETS ═══════════════════════════════════════════'
\echo 'Expected after Phase 0: profile-pictures ONLY (avatars, deliberate).'
\echo 'Anything else listed here is readable by anyone on the internet.'
SELECT id,
       public,
       CASE WHEN id = 'profile-pictures' THEN 'expected'
            ELSE '*** REVIEW — world-readable ***' END AS verdict
  FROM storage.buckets
 WHERE public
 ORDER BY (id <> 'profile-pictures') DESC, id;


\echo ''
\echo '══ 2. STORAGE POLICIES SCOPED BY bucket_id ALONE ═══════════════════════'
\echo 'Any row here is readable/writable by EVERY authenticated principal,'
\echo 'including students and parents.'
SELECT policyname, cmd, roles::text, COALESCE(qual, with_check) AS predicate
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename  = 'objects'
   AND COALESCE(qual, with_check) LIKE '%bucket_id%'
   AND COALESCE(qual, with_check) !~ 'has_any_role|is_staff|is_parent|get_user_role|current_profile_id|profiles'
 ORDER BY policyname;


\echo ''
\echo '══ 3. handle_new_user DEFAULT ROLE (S2) ════════════════════════════════'
\echo 'MUST be false. True means any signup becomes a staff member.'
SELECT prosrc ~ 'COALESCE\s*\(\s*meta_role::app_role\s*,\s*''teacher''\s*\)'
         AS defaults_to_teacher_VULNERABLE,
       prosrc ~ 'IF\s+meta_role\s+IS\s+NULL\s+THEN' AS has_null_role_guard
  FROM pg_proc
 WHERE proname = 'handle_new_user'
   AND pronamespace = 'public'::regnamespace;


\echo ''
\echo '══ 4. PRIVILEGE ESCALATION — parent/student holding a staff profile ════'
\echo 'is_staff() is "holds a profiles row". Anyone listed reads everything.'
SELECT 'parent' AS kind, p.id AS profile_id, p.user_id, p.name, p.role
  FROM public.profiles p JOIN public.parent_auth_accounts  a ON a.user_id = p.user_id
 UNION ALL
SELECT 'student', p.id, p.user_id, p.name, p.role
  FROM public.profiles p JOIN public.student_auth_accounts a ON a.user_id = p.user_id;


\echo ''
\echo '══ 5. TABLES WITHOUT RLS ENABLED ═══════════════════════════════════════'
\echo 'A public table without RLS is fully readable via PostgREST.'
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity
 ORDER BY c.relname;


\echo ''
\echo '══ 6. RLS-ENABLED TABLES WITH NO POLICIES ══════════════════════════════'
\echo 'RLS on + zero policies = deny-all. Usually a bug, not a decision.'
SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
   AND NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname)
 ORDER BY c.relname;


\echo ''
\echo '══ 7. FULLY-PERMISSIVE TABLE POLICIES (the Phase 1 backlog) ════════════'
\echo 'Correct while ARK is the only tenant; a total cross-tenant leak the'
\echo 'moment a second organization exists. Phase 1 adds the org conjunct.'
\echo 'Expected count at Phase 0: ~102. This number must reach 0 in Phase 1.'
SELECT count(*) AS permissive_policy_count
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true');

SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename, policyname;


\echo ''
\echo '══ 8. SECURITY DEFINER FUNCTIONS ═══════════════════════════════════════'
\echo 'These BYPASS RLS. Each must enforce its own authorization, and in'
\echo 'Phase 1 each must also enforce organization_id.'
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig::text                          AS config,
       (p.proconfig IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                        WHERE c LIKE 'search_path=%'))  AS missing_search_path
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.prosecdef
 ORDER BY missing_search_path DESC, p.proname;


\echo ''
\echo '══ 9. EXPECTED PHASE 0 POLICIES PRESENT ════════════════════════════════'
\echo 'Missing rows mean PART 4 hit insufficient_privilege and was skipped —'
\echo 're-run it from the SQL editor as the owner.'
WITH expected(policyname) AS (
  VALUES ('payslips_staff_read'),
         ('finance_attachments_read'),
         ('support_attachments_read'),
         ('support_attachments_write'),
         ('question_papers_read'),
         ('question_papers_write'),
         ('question_papers_delete'),
         ('task_attachments_storage_read'),
         ('task_attachments_storage_write'),
         ('profile_pictures_owner_write'),
         ('profile_pictures_owner_update')
)
SELECT e.policyname,
       CASE WHEN p.policyname IS NULL THEN '*** MISSING ***' ELSE 'ok' END AS status
  FROM expected e
  LEFT JOIN pg_policies p
         ON p.schemaname = 'storage' AND p.tablename = 'objects'
        AND p.policyname = e.policyname
 ORDER BY (p.policyname IS NULL) DESC, e.policyname;


\echo ''
\echo '══ 10. has_any_role() HELPER INSTALLED ═════════════════════════════════'
SELECT EXISTS (
  SELECT 1 FROM pg_proc
   WHERE proname = 'has_any_role' AND pronamespace = 'public'::regnamespace
) AS has_any_role_installed;


\echo ''
\echo '══ AUDIT COMPLETE ══════════════════════════════════════════════════════'
\echo 'Sections 1, 2, 3, 4, 5, 6, 9 and 10 must all be clean before Phase 0 is'
\echo 'signed off. Section 7 is the Phase 1 backlog and is EXPECTED to be'
\echo 'non-empty right now. Section 8 is a review list, not a pass/fail.'
