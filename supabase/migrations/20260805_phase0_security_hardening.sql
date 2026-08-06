-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 0 — SECURITY HARDENING                                     2026-08-05
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
-- Paired rollback: 20260805_phase0_security_hardening_rollback.sql
--
-- Closes the findings that are exploitable TODAY, on the single-tenant
-- database, before any multi-tenant work begins. Nothing here depends on
-- `organization_id` — that arrives in Phase 1.
--
-- ┌── WHAT THIS FIXES ─────────────────────────────────────────────────────┐
-- │ S2  handle_new_user() hands every new auth user a STAFF profile        │
-- │ S3a payslips bucket is PUBLIC — salary slips readable by the internet  │
-- │ S3b finance-attachments bucket is PUBLIC                               │
-- │ S3c support-attachments bucket is PUBLIC                               │
-- │ S3d question-papers readable AND DELETABLE by any authenticated user   │
-- │ S3e task-attachments readable/writable by any authenticated user       │
-- │ S3f support-attachments readable/writable by any authenticated user    │
-- │ S3g finance-attachments readable by any authenticated user             │
-- │ S3h profile-pictures writable by any authenticated user                │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- DELIBERATELY NOT IN THIS MIGRATION
--   • The 102 `USING (true)` table policies. Those are correct today: every
--     authenticated principal belongs to ARK. They become wrong only when a
--     second organization exists, and the fix (a tenant conjunct) needs the
--     `organization_id` column. Tightening them now would break the app and
--     buy no security. → Phase 1.
--   • get_financial_summary(). Re-read during Phase 0: it already raises
--     'Access denied: 403 Forbidden' for any role except management. The
--     p_campus_id argument is a filter, not an authorization bypass. It needs
--     an org conjunct in Phase 1, not a fix now.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — S2: a signup must never mint a staff profile
--
-- Before: COALESCE(meta_role::app_role, 'teacher')
--         → an auth.users INSERT carrying no `role` metadata produced a
--           `profiles` row with role 'teacher'.
--
-- Why that is critical: public.is_staff() is defined as "holds a profiles
-- row", and 102 policies are `USING (true)` for authenticated users. So any
-- principal who could reach GoTrue's /signup endpoint with the anon key —
-- which ships in the browser bundle — became a teacher with read access to
-- every student, fee, payroll and staff record in the database.
--
-- VERIFIED SAFE FOR ARK before changing the default:
--   • `signUp(` appears NOWHERE in src/ or supabase/functions/ — the product
--     never self-registers anyone.
--   • invite-staff/index.ts:779 → createUser({ user_metadata: { name, role } })
--     and line 751 rejects the request unless `profile.role` is present.
--   • seed-users/index.ts:72   → createUser({ user_metadata: { name, role } })
--   • student-parent-accounts  → role 'student' / 'parent', already skipped.
-- Every legitimate creator therefore passes an explicit role and is unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role   TEXT   := NULLIF(NEW.raw_user_meta_data->>'role', '');
  staff_roles TEXT[] := ARRAY['teacher', 'admin', 'management', 'coordinator'];
BEGIN
  -- (a) Non-staff principals are backed by student_auth_accounts /
  --     parent_auth_accounts, never by profiles. Unchanged from 20260729 —
  --     this is the branch that keeps the Parent Portal scoped to a family.
  IF meta_role IN ('parent', 'student') THEN
    RETURN NEW;
  END IF;

  -- (b) THE FIX. No role in metadata → no profile, no staff credential.
  --     Previously this fell through to 'teacher'. A user with no profile can
  --     still authenticate; they simply resolve to no principal and
  --     AuthContext signs them out. That is the correct deny-by-default.
  IF meta_role IS NULL THEN
    RAISE WARNING
      'handle_new_user: auth user % created with no role metadata — no staff '
      'profile created. Staff must be provisioned via the invite-staff edge '
      'function, which always sets user_metadata.role.', NEW.id;
    RETURN NEW;
  END IF;

  -- (c) An unrecognised role is skipped, not raised: a future module inventing
  --     a metadata role must not be able to take down signup.
  IF NOT (meta_role = ANY (staff_roles)) THEN
    RAISE WARNING 'handle_new_user: unrecognised role % for auth user % — no profile created',
      meta_role, NEW.id;
    RETURN NEW;
  END IF;

  -- (d) Genuine staff, with an explicit recognised role. Never let a failure
  --     here roll back the auth.users INSERT: a half-provisioned profile is
  --     recoverable, an un-creatable user is not.
  BEGIN
    INSERT INTO public.profiles (user_id, name, role)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
      meta_role::app_role
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

-- CREATE OR REPLACE does not rebind an existing trigger.
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not rebind on_auth_user_created — run this block from the '
               'Supabase SQL editor as the owner.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — helper: "is this caller staff with one of these roles?"
--
-- Every storage policy below needs the same shape. Existing helpers are close
-- but not sufficient: get_user_role() returns app_role and forces a cast at
-- every call site, and is_staff() has no role filter.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_any_role(_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND is_active
       AND role::text = ANY (_roles)
  );
$$;

COMMENT ON FUNCTION public.has_any_role(TEXT[]) IS
  'True when the caller holds an ACTIVE staff profile whose role is in _roles. '
  'Note the is_active filter — get_user_role() has none, so a deactivated '
  'staff member still passes it.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — S3a/b/c: three buckets are PUBLIC. Make them private.
--
-- `public = true` is not "readable by any logged-in user" — it is readable by
-- ANYONE ON THE INTERNET holding the URL, with no auth and no RLS evaluation
-- at all. Storage SELECT policies do not apply to public-bucket reads.
--
--   payslips             → every salary slip ever emailed
--   finance-attachments  → bills, invoices, financial documents
--   support-attachments  → whatever users attach to tickets
--
-- profile-pictures stays public ON PURPOSE: avatars are low-sensitivity, are
-- rendered in <img> tags across the app, and a signed URL would expire
-- mid-session and show broken images. Its WRITE side is tightened in PART 4.
--
-- ⚠ CODE DEPENDENCY: this flip breaks getPublicUrl(), which those three
-- features used. The paired application changes (createSignedUrl) ship in the
-- SAME commit — see payrollEmail.service.ts, financeAttachment.service.ts and
-- help/attachments.service.ts. Deploying this migration WITHOUT that frontend
-- build will break attachment downloads.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  UPDATE storage.buckets SET public = false
   WHERE id IN ('payslips', 'finance-attachments', 'support-attachments');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not flip bucket visibility — run PART 3 from the Supabase '
               'SQL editor as the owner, or toggle "Public" off in Storage settings.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — storage object policies
--
-- Wrapped in one DO block: on a hosted Supabase project the migration runner
-- may not own storage.objects. Failing loudly here would abort PARTS 1-3,
-- which DO apply. Better to apply what we can and tell the operator exactly
-- what to re-run.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
-- NOTE: the role lists are written inline on purpose. They were once PL/pgSQL
-- DECLARE variables, but plpgsql does not substitute variables into utility
-- statements: CREATE POLICY stores its expression verbatim, so Postgres parsed
-- `staff_mgmt` as a COLUMN and every policy below failed with 42703. Caught on
-- first deployment against the live database.

  -- ── payslips ──────────────────────────────────────────────────────────────
  -- Was: `payslips_public_read` FOR SELECT TO public USING (bucket_id=...)
  -- i.e. world-readable, forever, with no expiry.
  --
  -- The emailed download link keeps working because payrollEmail.service.ts
  -- now mints a 30-day signed URL. Signing requires the SIGNER to hold SELECT
  -- on the object, hence the admin/management read policy below (that service
  -- only ever runs for admin/management).
  DROP POLICY IF EXISTS payslips_public_read       ON storage.objects;
  DROP POLICY IF EXISTS payslips_staff_read        ON storage.objects;
  CREATE POLICY payslips_staff_read ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payslips' AND public.has_any_role(ARRAY['admin','management']));

  -- ── finance-attachments ───────────────────────────────────────────────────
  -- Read was `bucket_id` only, so any authenticated principal could pull every
  -- financial document. Writes were already admin/management; align reads.
  DROP POLICY IF EXISTS "All read finance attachments" ON storage.objects;
  DROP POLICY IF EXISTS finance_attachments_read       ON storage.objects;
  CREATE POLICY finance_attachments_read ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'finance-attachments' AND public.has_any_role(ARRAY['admin','management']));

  -- ── support-attachments ───────────────────────────────────────────────────
  -- Was fully open in both directions to any authenticated principal.
  -- The Help module is a staff surface (parent-portal touches no storage),
  -- so staff-only is behaviour-preserving for every real caller.
  DROP POLICY IF EXISTS "support_attachments_read"  ON storage.objects;
  DROP POLICY IF EXISTS "support_attachments_write" ON storage.objects;
  DROP POLICY IF EXISTS support_attachments_read    ON storage.objects;
  DROP POLICY IF EXISTS support_attachments_write   ON storage.objects;
  CREATE POLICY support_attachments_read ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'support-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));
  CREATE POLICY support_attachments_write ON storage.objects
    FOR ALL TO authenticated
    USING      (bucket_id = 'support-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']))
    WITH CHECK (bucket_id = 'support-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));

  -- ── question-papers ───────────────────────────────────────────────────────
  -- The sharpest of the set. Previous policies:
  --   FOR SELECT TO authenticated USING (bucket_id = 'question-papers')
  --   FOR DELETE TO authenticated USING (bucket_id = 'question-papers')
  -- Students and parents hold `authenticated` sessions. That is unsat exam
  -- papers readable before the exam, and DELETABLE by anyone who can log in.
  DROP POLICY IF EXISTS "question_papers_read"   ON storage.objects;
  DROP POLICY IF EXISTS "question_papers_write"  ON storage.objects;
  DROP POLICY IF EXISTS "question_papers_delete" ON storage.objects;
  DROP POLICY IF EXISTS question_papers_read     ON storage.objects;
  DROP POLICY IF EXISTS question_papers_write    ON storage.objects;
  DROP POLICY IF EXISTS question_papers_delete   ON storage.objects;
  CREATE POLICY question_papers_read ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'question-papers' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));
  CREATE POLICY question_papers_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'question-papers' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));
  CREATE POLICY question_papers_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'question-papers' AND public.has_any_role(ARRAY['admin','management']));

  -- ── task-attachments ──────────────────────────────────────────────────────
  -- Was open in both directions to any authenticated principal. Tasks are a
  -- staff module.
  DROP POLICY IF EXISTS "task_attachments_storage_read"  ON storage.objects;
  DROP POLICY IF EXISTS "task_attachments_storage_write" ON storage.objects;
  CREATE POLICY task_attachments_storage_read ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'task-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));
  CREATE POLICY task_attachments_storage_write ON storage.objects
    FOR ALL TO authenticated
    USING      (bucket_id = 'task-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']))
    WITH CHECK (bucket_id = 'task-attachments' AND public.has_any_role(ARRAY['admin','management','coordinator','teacher']));

  -- ── profile-pictures ──────────────────────────────────────────────────────
  -- Read stays public (see PART 3). The WRITE side was
  --   FOR INSERT TO authenticated WITH CHECK (bucket_id = 'profile-pictures')
  -- so any authenticated principal — including a student or parent — could
  -- overwrite ANY staff member's avatar. storage.service.ts keys objects as
  -- `{ownerId}/{ts}.{ext}`, so the first path segment is the owner's profile
  -- id: scope writes to your own folder, or to admin/management.
  DROP POLICY IF EXISTS profile_pictures_authenticated_write  ON storage.objects;
  DROP POLICY IF EXISTS profile_pictures_authenticated_update ON storage.objects;
  DROP POLICY IF EXISTS profile_pictures_owner_write          ON storage.objects;
  DROP POLICY IF EXISTS profile_pictures_owner_update         ON storage.objects;
  CREATE POLICY profile_pictures_owner_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND (
        (storage.foldername(name))[1] = public.current_profile_id()::text
        OR public.has_any_role(ARRAY['admin','management'])
      )
    );
  CREATE POLICY profile_pictures_owner_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'profile-pictures'
      AND (
        (storage.foldername(name))[1] = public.current_profile_id()::text
        OR public.has_any_role(ARRAY['admin','management'])
      )
    );

EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping storage.objects policies — insufficient privilege. '
               'Re-run PART 4 from the Supabase SQL editor as the owner.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — post-migration audit
--
-- Reports rather than fixes. Two of these findings need a human decision, and
-- silently "fixing" them could revoke a real person's access.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r     RECORD;
  found INT := 0;
BEGIN
  -- (a) Any bucket still public.
  FOR r IN SELECT id FROM storage.buckets WHERE public LOOP
    IF r.id <> 'profile-pictures' THEN
      found := found + 1;
      RAISE WARNING 'PUBLIC BUCKET: "%" is world-readable. Intentional?', r.id;
    END IF;
  END LOOP;

  -- (b) Storage policies that still gate on bucket_id alone. The regex looks
  --     for a qual mentioning bucket_id but no role/ownership helper.
  FOR r IN
    SELECT policyname, qual
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND qual IS NOT NULL
       AND qual LIKE '%bucket_id%'
       AND qual NOT LIKE '%has_any_role%'
       AND qual NOT LIKE '%is_staff%'
       AND qual NOT LIKE '%is_parent%'
       AND qual NOT LIKE '%get_user_role%'
       AND qual NOT LIKE '%current_profile_id%'
       AND qual NOT LIKE '%profiles%'
  LOOP
    found := found + 1;
    RAISE WARNING 'UNSCOPED STORAGE POLICY: % → %', r.policyname, r.qual;
  END LOOP;

  -- (c) Staff profiles that shadow a student/parent login (carried forward
  --     from 20260729 — still the fastest privilege-escalation path).
  FOR r IN
    SELECT p.id, p.user_id, p.name, 'parent' AS kind
      FROM public.profiles p JOIN public.parent_auth_accounts a ON a.user_id = p.user_id
     UNION ALL
    SELECT p.id, p.user_id, p.name, 'student'
      FROM public.profiles p JOIN public.student_auth_accounts a ON a.user_id = p.user_id
  LOOP
    found := found + 1;
    RAISE WARNING
      'PRIVILEGE ESCALATION: % login % ("%") also holds profiles row % — '
      'is_staff() is TRUE for them. Delete it unless they are genuinely staff.',
      r.kind, r.user_id, r.name, r.id;
  END LOOP;

  IF found = 0 THEN
    RAISE NOTICE 'Phase 0 storage/identity audit: clean (0 findings).';
  ELSE
    RAISE NOTICE 'Phase 0 audit: % finding(s) above need review.', found;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
