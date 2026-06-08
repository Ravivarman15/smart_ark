-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT & PARENT AUTHENTICATION PLATFORM   (2026-06-15)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Closes the architectural gap found in Communication Phase 2: staff have auth
-- accounts (profiles → auth.users) but students and parents do not, so student
-- credentials could never be verified or sent.
--
-- DESIGN: student & parent logins are REAL Supabase `auth.users` accounts (so
-- `signInWithPassword` truly proves a login and RLS works via `auth.uid()`).
-- When a student/parent has no real email, the provisioning edge function
-- synthesises a stable login email from the username (…@students.ark.local /
-- …@parents.ark.local). These tables map the app-level identity to that auth
-- account; the password lives ONLY in auth.users (never here).
--
--   student_auth_accounts  — one optional login per student
--   parent_auth_accounts   — one login per parent/guardian
--   parent_student_links   — a parent ↔ many students (multi-child portal)
--   auth_login_audit       — append-only login / lifecycle audit
--
-- Does NOT touch students / profiles / attendance / fees / exams.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. student_auth_accounts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_auth_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- The Supabase Auth login backing this account (NULL until provisioned).
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username        TEXT,
  login_email     TEXT,        -- real or synthesised; matches auth.users.email
  mobile          TEXT,
  -- 'pending' | 'active' | 'disabled' | 'locked'
  status          TEXT NOT NULL DEFAULT 'pending',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_login_at   TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_auth_username    ON public.student_auth_accounts (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_auth_login_email ON public.student_auth_accounts (lower(login_email)) WHERE login_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_auth_user_id     ON public.student_auth_accounts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_auth_status ON public.student_auth_accounts (status);

DO $$ BEGIN
  ALTER TABLE public.student_auth_accounts DROP CONSTRAINT IF EXISTS student_auth_status_check;
  ALTER TABLE public.student_auth_accounts
    ADD CONSTRAINT student_auth_status_check CHECK (status IN ('pending','active','disabled','locked'));
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 2. parent_auth_accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_auth_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name            TEXT,
  username        TEXT,
  login_email     TEXT,        -- real or synthesised; matches auth.users.email
  email           TEXT,        -- real contact email (optional)
  mobile          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_login_at   TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_auth_username    ON public.parent_auth_accounts (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_auth_login_email ON public.parent_auth_accounts (lower(login_email)) WHERE login_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_auth_user_id     ON public.parent_auth_accounts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_auth_status ON public.parent_auth_accounts (status);

DO $$ BEGIN
  ALTER TABLE public.parent_auth_accounts DROP CONSTRAINT IF EXISTS parent_auth_status_check;
  ALTER TABLE public.parent_auth_accounts
    ADD CONSTRAINT parent_auth_status_check CHECK (status IN ('pending','active','disabled','locked'));
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 3. parent_student_links (one parent ↔ many students) ─────────────────────
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id UUID NOT NULL REFERENCES public.parent_auth_accounts(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation          TEXT,       -- 'father' | 'mother' | 'guardian' | …
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_account_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_psl_parent  ON public.parent_student_links (parent_account_id);
CREATE INDEX IF NOT EXISTS idx_psl_student ON public.parent_student_links (student_id);

-- ── 4. auth_login_audit (append-only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_login_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'student' | 'parent' | 'staff'
  subject_type TEXT NOT NULL,
  account_id   UUID,           -- student_auth_accounts.id / parent_auth_accounts.id
  user_id      UUID,           -- auth.users.id
  -- 'login' | 'logout' | 'failed_login' | 'password_reset' | 'account_created'
  -- | 'account_disabled' | 'account_enabled' | 'account_locked' | 'verify'
  event        TEXT NOT NULL,
  detail       TEXT,
  device       TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_audit_subject ON public.auth_login_audit (subject_type, account_id);
CREATE INDEX IF NOT EXISTS idx_login_audit_event   ON public.auth_login_audit (event);
CREATE INDEX IF NOT EXISTS idx_login_audit_created ON public.auth_login_audit (created_at);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- Staff (admin/management/coordinator) manage all accounts; a student/parent may
-- read their OWN account row (user_id = auth.uid()). Audit: staff read, any
-- authenticated insert (so the app/edge can log events).
DO $$
DECLARE
  t TEXT;
  staff_write TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'')';
BEGIN
  -- account tables: staff full write; owner self-read
  FOREACH t IN ARRAY ARRAY['student_auth_accounts','parent_auth_accounts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "staff_all %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner_read %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "staff_all %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)', t, staff_write);
    EXECUTE format('CREATE POLICY "owner_read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (user_id = auth.uid())', t);
  END LOOP;

  -- links: staff full; authenticated read (portal needs to resolve children)
  EXECUTE 'ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY';
  DROP POLICY IF EXISTS "staff_all parent_student_links" ON public.parent_student_links;
  DROP POLICY IF EXISTS "read parent_student_links" ON public.parent_student_links;
  EXECUTE format('CREATE POLICY "staff_all parent_student_links" ON public.parent_student_links FOR ALL TO authenticated USING (%1$s) WITH CHECK (%1$s)', staff_write);
  CREATE POLICY "read parent_student_links" ON public.parent_student_links FOR SELECT TO authenticated USING (true);

  -- audit: staff read; any authenticated insert
  EXECUTE 'ALTER TABLE public.auth_login_audit ENABLE ROW LEVEL SECURITY';
  DROP POLICY IF EXISTS "staff_read auth_login_audit" ON public.auth_login_audit;
  DROP POLICY IF EXISTS "any_insert auth_login_audit" ON public.auth_login_audit;
  EXECUTE format('CREATE POLICY "staff_read auth_login_audit" ON public.auth_login_audit FOR SELECT TO authenticated USING (%1$s)', staff_write);
  CREATE POLICY "any_insert auth_login_audit" ON public.auth_login_audit FOR INSERT TO authenticated WITH CHECK (true);
END $$;

-- ── 6. updated_at triggers ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_student_auth_updated_at') THEN
    CREATE TRIGGER update_student_auth_updated_at BEFORE UPDATE ON public.student_auth_accounts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_parent_auth_updated_at') THEN
    CREATE TRIGGER update_parent_auth_updated_at BEFORE UPDATE ON public.parent_auth_accounts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ── 7. realtime (guarded) ────────────────────────────────────────────────────
DO $$
DECLARE tbl TEXT; tables TEXT[] := ARRAY['student_auth_accounts','parent_auth_accounts','parent_student_links','auth_login_audit'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY tables LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
