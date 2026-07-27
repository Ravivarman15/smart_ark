-- ════════════════════════════════════════════════════════════════════════════
-- PARENT ACCOUNT ↔ STUDENT RECORD AUTO-SYNC   (2026-07-28)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
-- Requires 20260615_student_parent_auth.sql and 20260727_parent_portal.sql.
--
-- THE PROBLEM
-- A parent portal login is provisioned FROM the student record (father /
-- mother / guardian name, mobile, email). The moment the office corrects a
-- mobile number on the student, the parent account silently disagrees with it —
-- and nobody notices until credentials are sent to a dead number.
--
-- THE FIX
-- A database trigger, not application code. The student record is edited from
-- the Student module, the Import engine, the Lead→Admission conversion and
-- bulk SQL fixes; a client-side sync would cover exactly one of those. Putting
-- it in the database means the guarantee holds no matter who writes the row.
--
-- PROVENANCE
-- `parent_student_links.relation` already records WHICH guardian slot an
-- account came from ('father' | 'mother' | 'guardian'), so the trigger knows
-- which columns to read. No new join table.
--
-- CONSENT
-- `parent_auth_accounts.auto_sync` (default true) is the opt-out. Management
-- editing a parent's details directly turns it off, so a deliberate manual
-- correction is never clobbered by a stale student row on the next save.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.parent_auth_accounts
  -- When true, the trigger below keeps name/mobile/email in step with the
  -- student record. Set false automatically the moment a human edits the
  -- account by hand.
  ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN NOT NULL DEFAULT true,
  -- Audit breadcrumb: when the last automatic sync ran, and from where.
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_from UUID REFERENCES public.students(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.parent_auth_accounts.auto_sync IS
  'When true, sync_parent_from_student() mirrors the linked student''s guardian '
  'fields onto this account. Set false when a human edits the account directly.';

-- ── 2. Sync helper ───────────────────────────────────────────────────────────
-- Applies one student's guardian slot onto every auto-sync account linked to
-- that student through the matching relation.
--
-- COALESCE(NULLIF(new,''), old) throughout: clearing a field on the student
-- record must not blank a working login's contact details. A correction
-- overwrites; a deletion is ignored.
CREATE OR REPLACE FUNCTION public.sync_parent_from_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when a guardian field actually changed. Student rows are
  -- updated constantly (attendance rollups, risk scores, batch moves) and this
  -- trigger must not fire on any of that.
  IF  NEW.parent_name      IS NOT DISTINCT FROM OLD.parent_name
  AND NEW.parent_contact   IS NOT DISTINCT FROM OLD.parent_contact
  AND NEW.parent_email     IS NOT DISTINCT FROM OLD.parent_email
  AND NEW.mother_name      IS NOT DISTINCT FROM OLD.mother_name
  AND NEW.mother_contact   IS NOT DISTINCT FROM OLD.mother_contact
  AND NEW.mother_email     IS NOT DISTINCT FROM OLD.mother_email
  AND NEW.guardian_name    IS NOT DISTINCT FROM OLD.guardian_name
  AND NEW.guardian_contact IS NOT DISTINCT FROM OLD.guardian_contact
  THEN
    RETURN NEW;
  END IF;

  -- Father slot
  UPDATE public.parent_auth_accounts pa
     SET name             = COALESCE(NULLIF(NEW.parent_name, ''),    pa.name),
         mobile           = COALESCE(NULLIF(NEW.parent_contact, ''), pa.mobile),
         email            = COALESCE(NULLIF(NEW.parent_email, ''),   pa.email),
         last_synced_at   = now(),
         last_synced_from = NEW.id
    FROM public.parent_student_links l
   WHERE l.parent_account_id = pa.id
     AND l.student_id        = NEW.id
     AND lower(COALESCE(l.relation, 'father')) = 'father'
     AND pa.auto_sync;

  -- Mother slot
  UPDATE public.parent_auth_accounts pa
     SET name             = COALESCE(NULLIF(NEW.mother_name, ''),    pa.name),
         mobile           = COALESCE(NULLIF(NEW.mother_contact, ''), pa.mobile),
         email            = COALESCE(NULLIF(NEW.mother_email, ''),   pa.email),
         last_synced_at   = now(),
         last_synced_from = NEW.id
    FROM public.parent_student_links l
   WHERE l.parent_account_id = pa.id
     AND l.student_id        = NEW.id
     AND lower(l.relation)   = 'mother'
     AND pa.auto_sync;

  -- Guardian slot (students carries no guardian_email — parent_email is the
  -- shared fallback, matching what the provisioning UI reads).
  UPDATE public.parent_auth_accounts pa
     SET name             = COALESCE(NULLIF(NEW.guardian_name, ''),    pa.name),
         mobile           = COALESCE(NULLIF(NEW.guardian_contact, ''), pa.mobile),
         email            = COALESCE(NULLIF(NEW.parent_email, ''),     pa.email),
         last_synced_at   = now(),
         last_synced_from = NEW.id
    FROM public.parent_student_links l
   WHERE l.parent_account_id = pa.id
     AND l.student_id        = NEW.id
     AND lower(l.relation) NOT IN ('father', 'mother')
     AND l.relation IS NOT NULL
     AND pa.auto_sync;

  RETURN NEW;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_sync_parent_from_student ON public.students;
  CREATE TRIGGER trg_sync_parent_from_student
    AFTER UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_parent_from_student();
END $$;

-- ── 3. Turn auto-sync OFF when a human edits the account ─────────────────────
-- Without this, management corrects a parent's mobile, the next student-record
-- save silently reverts it, and the correction looks like it never happened.
--
-- Guarded on the sync columns: the trigger above sets last_synced_at on every
-- automatic write, so an update carrying a fresh last_synced_at is the
-- trigger's own work and must NOT disable auto-sync.
CREATE OR REPLACE FUNCTION public.parent_account_manual_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_synced_at IS DISTINCT FROM OLD.last_synced_at THEN
    RETURN NEW;                       -- written by sync_parent_from_student()
  END IF;

  IF  NEW.name   IS DISTINCT FROM OLD.name
  OR  NEW.mobile IS DISTINCT FROM OLD.mobile
  OR  NEW.email  IS DISTINCT FROM OLD.email
  THEN
    NEW.auto_sync := false;           -- a human decided; stop overwriting them
  END IF;

  RETURN NEW;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_parent_account_manual_edit ON public.parent_auth_accounts;
  CREATE TRIGGER trg_parent_account_manual_edit
    BEFORE UPDATE ON public.parent_auth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.parent_account_manual_edit();
END $$;

-- ── 4. Backfill provenance for accounts created before this migration ────────
-- Links created by the provisioning console always carry a relation; links
-- created by hand may not. Default those to 'father', which is the slot the
-- old console used, so they start syncing instead of silently never syncing.
UPDATE public.parent_student_links
   SET relation = 'father'
 WHERE relation IS NULL;

NOTIFY pgrst, 'reload schema';
