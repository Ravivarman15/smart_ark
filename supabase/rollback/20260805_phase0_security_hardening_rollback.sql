-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 0 SECURITY HARDENING                            2026-08-05
--
-- Restores the EXACT prior definitions from:
--   20260729_auth_user_trigger_fix.sql   (handle_new_user)
--   20260625_payslips_storage.sql        (payslips)
--   20260525_finance_module.sql          (finance-attachments)
--   20260528_help_module.sql             (support-attachments)
--   20260714_question_paper_import.sql   (question-papers)
--   20260616_tasks_module.sql            (task-attachments)
--   20260519_staff_profile_extensions.sql(profile-pictures)
--
-- ⚠ RUNNING THIS RE-OPENS EVERY HOLE PHASE 0 CLOSED, including world-readable
--   payslips and a signup path that mints staff profiles. It exists because
--   the contract requires a rollback for every migration — not because
--   reverting is ever the right first move.
--
-- ⚠ REVERT THE FRONTEND TOO. The Phase 0 build signs URLs instead of calling
--   getPublicUrl(). Signed URLs keep working against a public bucket, so a
--   DB-only rollback is safe in that direction; a frontend-only rollback
--   against private buckets is NOT.
--
-- PREFER A TARGETED FIX. Each PART below is independent — revert only the one
-- that is actually causing a problem.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1 — restore the 20260729 handle_new_user (defaults to 'teacher') ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  staff_roles TEXT[] := ARRAY['teacher', 'admin', 'management', 'coordinator'];
BEGIN
  IF meta_role IN ('parent', 'student') THEN
    RETURN NEW;
  END IF;

  IF meta_role IS NOT NULL AND NOT (meta_role = ANY (staff_roles)) THEN
    RAISE WARNING 'handle_new_user: unrecognised role % for auth user % — no profile created',
      meta_role, NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.profiles (user_id, name, role)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
      COALESCE(meta_role::app_role, 'teacher')
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not rebind on_auth_user_created — run from the SQL editor as owner.';
END $$;


-- ── PART 3 — restore public bucket visibility ───────────────────────────────
DO $$ BEGIN
  UPDATE storage.buckets SET public = true
   WHERE id IN ('payslips', 'finance-attachments', 'support-attachments');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not restore bucket visibility — run from the SQL editor as owner.';
END $$;


-- ── PART 4 — restore the prior storage policies ─────────────────────────────
DO $$ BEGIN

  -- payslips (20260625)
  DROP POLICY IF EXISTS payslips_staff_read ON storage.objects;
  CREATE POLICY payslips_public_read ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'payslips');

  -- finance-attachments (20260525)
  DROP POLICY IF EXISTS finance_attachments_read ON storage.objects;
  CREATE POLICY "All read finance attachments" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'finance-attachments');

  -- support-attachments (20260528)
  DROP POLICY IF EXISTS support_attachments_read  ON storage.objects;
  DROP POLICY IF EXISTS support_attachments_write ON storage.objects;
  CREATE POLICY "support_attachments_read" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'support-attachments');
  CREATE POLICY "support_attachments_write" ON storage.objects
    FOR ALL TO authenticated WITH CHECK (bucket_id = 'support-attachments');

  -- question-papers (20260714)
  DROP POLICY IF EXISTS question_papers_read   ON storage.objects;
  DROP POLICY IF EXISTS question_papers_write  ON storage.objects;
  DROP POLICY IF EXISTS question_papers_delete ON storage.objects;
  CREATE POLICY "question_papers_read" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'question-papers');
  CREATE POLICY "question_papers_write" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'question-papers');
  CREATE POLICY "question_papers_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'question-papers');

  -- task-attachments (20260616)
  DROP POLICY IF EXISTS task_attachments_storage_read  ON storage.objects;
  DROP POLICY IF EXISTS task_attachments_storage_write ON storage.objects;
  CREATE POLICY "task_attachments_storage_read" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'task-attachments');
  CREATE POLICY "task_attachments_storage_write" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'task-attachments')
    WITH CHECK (bucket_id = 'task-attachments');

  -- profile-pictures (20260519)
  DROP POLICY IF EXISTS profile_pictures_owner_write  ON storage.objects;
  DROP POLICY IF EXISTS profile_pictures_owner_update ON storage.objects;
  CREATE POLICY profile_pictures_authenticated_write ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'profile-pictures');
  CREATE POLICY profile_pictures_authenticated_update ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'profile-pictures');

EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping storage.objects rollback — run from the SQL editor as owner.';
END $$;


-- ── PART 2 — drop the helper (last: the policies above reference it) ────────
DROP FUNCTION IF EXISTS public.has_any_role(TEXT[]);

NOTIFY pgrst, 'reload schema';
