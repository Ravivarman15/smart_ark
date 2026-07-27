-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE PARENT PORTAL   (2026-07-27)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Builds on 20260615_student_parent_auth.sql (parent_auth_accounts /
-- parent_student_links / auth_login_audit). It adds NO duplicate domain tables:
-- the portal reads students / student_attendance / exams / exam_results /
-- student_fees / fee_installments / student_documents / message_queue /
-- live_classes / class_schedules exactly as the staff portals do.
--
-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ WHY THIS MIGRATION IS SECURITY-CRITICAL                                │
-- │                                                                        │
-- │ Every existing broad read policy in this database is                   │
-- │     FOR SELECT TO authenticated USING (true)                           │
-- │ which was safe while the ONLY holders of an auth.users session were    │
-- │ staff. The Parent Portal gives parents REAL auth.users sessions — so   │
-- │ from the moment a parent can log in, `USING (true)` means a parent can │
-- │ read every student, every mark, every fee ledger, every payroll-       │
-- │ adjacent finance row and every support ticket in the institution.      │
-- │                                                                        │
-- │ PART 3 therefore REWRITES those policies from `true` to `is_staff()`.  │
-- │ Staff are exactly the users holding a `profiles` row, so this is a     │
-- │ NO-OP for every user that exists today (admin / management /           │
-- │ coordinator / teacher all have profiles). It is a hard deny for the    │
-- │ new parent principal, which PART 4 then re-opens on a strictly         │
-- │ child-scoped basis.                                                    │
-- │                                                                        │
-- │ Deny-by-default first, grant-by-child second. Never the reverse.       │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- LOGIN: parents authenticate exactly like staff — email + password through
-- the existing `/login` page and supabase.auth.signInWithPassword. Credentials
-- are provisioned and delivered by the EXISTING `student-parent-accounts` edge
-- function (which already synthesises a stable …@parents.ark.local login email
-- and proves the password) plus the Communication Center's credential-send
-- flow. No new login mechanism, no OTP table, no second auth path.
--
-- PART 1  identity helpers (is_staff / is_parent / parent_child_ids / …)
-- PART 2  portal tables (audit, preferences)
-- PART 3  TIGHTEN every `USING (true)` authenticated SELECT → is_staff()
-- PART 4  GRANT child-scoped parent SELECT on the portal's data surface
-- PART 5  storage — child-scoped document download
-- PART 6  realtime publication
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — IDENTITY HELPERS
--
-- All SECURITY DEFINER + STABLE with a pinned search_path. SECURITY DEFINER is
-- required because a parent has no SELECT grant on parent_auth_accounts beyond
-- their own row, and a policy that queried it directly would recurse.
-- ════════════════════════════════════════════════════════════════════════════

-- A staff principal = a user holding a profiles row. Deliberately role-agnostic:
-- role-level gating stays in the existing per-table policies + app RBAC.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid());
$$;

-- The calling parent's account id, or NULL. A disabled / locked / pending
-- account resolves to NULL, so suspending a parent instantly revokes every
-- row-level grant below without touching a single policy.
CREATE OR REPLACE FUNCTION public.current_parent_account_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.id
    FROM public.parent_auth_accounts pa
   WHERE pa.user_id = auth.uid()
     AND pa.status = 'active'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_parent_account_id() IS NOT NULL;
$$;

-- Every student id the calling parent is linked to. One place defines
-- "my children" — every policy below delegates here, so the linkage rule can
-- never drift between tables.
CREATE OR REPLACE FUNCTION public.parent_child_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.student_id
    FROM public.parent_student_links l
   WHERE l.parent_account_id = public.current_parent_account_id();
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of(_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _student_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.parent_student_links l
            WHERE l.parent_account_id = public.current_parent_account_id()
              AND l.student_id = _student_id
         );
$$;

-- Does the calling parent have a child in this batch / standard? Used by the
-- class-timetable + live-class policies, which are addressed to a cohort
-- rather than to an individual student.
CREATE OR REPLACE FUNCTION public.parent_has_child_in_batch(_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _batch_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.students s
            WHERE s.batch_id = _batch_id
              AND s.id IN (SELECT public.parent_child_ids())
         );
$$;

CREATE OR REPLACE FUNCTION public.parent_has_child_in_standard(_standard_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _standard_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.students s
            WHERE s.standard_id = _standard_id
              AND s.id IN (SELECT public.parent_child_ids())
         );
$$;

-- Schema probe used by PART 4. A Smart ARK database may legitimately be missing
-- a module's table, or have an older shape of one — this migration must skip
-- such a policy, never abort. (Learned the hard way: study_materials carries
-- batch_id but no standard_id, and assuming otherwise failed the whole run.)
CREATE OR REPLACE FUNCTION public.pp_col_exists(_table TEXT, _column TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = _table AND column_name = _column
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_parent_account_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_ids()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_of(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_has_child_in_batch(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_has_child_in_standard(UUID)  TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — PORTAL TABLES
--
-- Two tables, neither of which duplicates an existing one:
--   parent_portal_audit       — login / download / profile-change audit
--   parent_portal_preferences — language, theme, per-event notification opt-outs
--
-- No login table: parents authenticate through the existing auth.users +
-- parent_auth_accounts path that 20260615 already established.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 2a. parent_portal_audit ──────────────────────────────────────────────────
-- Append-only. auth_login_audit already covers login lifecycle; this records
-- what a parent DID inside the portal (downloads, views, preference changes),
-- which auth_login_audit was never shaped for.
CREATE TABLE IF NOT EXISTS public.parent_portal_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id UUID REFERENCES public.parent_auth_accounts(id) ON DELETE CASCADE,
  student_id        UUID REFERENCES public.students(id) ON DELETE SET NULL,
  -- 'login' | 'logout' | 'view_child' | 'download_report' | 'download_receipt'
  -- | 'download_document' | 'update_preferences' | 'change_password'
  -- | 'access_denied'
  event             TEXT NOT NULL,
  detail            TEXT,
  device            TEXT,
  ip                TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppa_parent  ON public.parent_portal_audit (parent_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppa_student ON public.parent_portal_audit (student_id);
CREATE INDEX IF NOT EXISTS idx_ppa_event   ON public.parent_portal_audit (event);

-- ── 2b. parent_portal_preferences ────────────────────────────────────────────
-- Per-parent portal settings. Channel preference for OUTBOUND institutional
-- messaging still lives on students.communication_preference (the
-- Communication engine's source of truth) — this table holds only what is
-- genuinely parent-owned and had nowhere else to live.
CREATE TABLE IF NOT EXISTS public.parent_portal_preferences (
  parent_account_id UUID PRIMARY KEY REFERENCES public.parent_auth_accounts(id) ON DELETE CASCADE,
  language          TEXT NOT NULL DEFAULT 'en',
  theme             TEXT NOT NULL DEFAULT 'system',   -- 'light' | 'dark' | 'system'
  -- Per-event opt-outs, e.g. {"attendance":true,"fee_due":false}. Absent key
  -- = opted in. These SUPPRESS delivery; they never enable a message the
  -- institution's comms_automation_settings has switched off.
  notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.parent_portal_preferences DROP CONSTRAINT IF EXISTS parent_pref_theme_check;
  ALTER TABLE public.parent_portal_preferences
    ADD CONSTRAINT parent_pref_theme_check CHECK (theme IN ('light','dark','system'));
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_parent_prefs_updated_at') THEN
    CREATE TRIGGER update_parent_prefs_updated_at BEFORE UPDATE ON public.parent_portal_preferences
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ── 2c. RLS for the portal's own tables ──────────────────────────────────────
DO $$
DECLARE staff TEXT := 'public.is_staff()';
BEGIN
  -- Audit: staff read all; a parent reads only their own trail; any
  -- authenticated principal may append (the client logs its own downloads).
  EXECUTE 'ALTER TABLE public.parent_portal_audit ENABLE ROW LEVEL SECURITY';
  DROP POLICY IF EXISTS "staff_read parent_portal_audit"   ON public.parent_portal_audit;
  DROP POLICY IF EXISTS "parent_read parent_portal_audit"  ON public.parent_portal_audit;
  DROP POLICY IF EXISTS "any_insert parent_portal_audit"   ON public.parent_portal_audit;
  EXECUTE format(
    'CREATE POLICY "staff_read parent_portal_audit" ON public.parent_portal_audit '
    'FOR SELECT TO authenticated USING (%s)', staff);
  CREATE POLICY "parent_read parent_portal_audit" ON public.parent_portal_audit
    FOR SELECT TO authenticated
    USING (parent_account_id = public.current_parent_account_id());
  CREATE POLICY "any_insert parent_portal_audit" ON public.parent_portal_audit
    FOR INSERT TO authenticated WITH CHECK (true);

  -- Preferences: a parent fully owns their own row; staff may read for support.
  EXECUTE 'ALTER TABLE public.parent_portal_preferences ENABLE ROW LEVEL SECURITY';
  DROP POLICY IF EXISTS "staff_read parent_portal_preferences"  ON public.parent_portal_preferences;
  DROP POLICY IF EXISTS "parent_own parent_portal_preferences"  ON public.parent_portal_preferences;
  EXECUTE format(
    'CREATE POLICY "staff_read parent_portal_preferences" ON public.parent_portal_preferences '
    'FOR SELECT TO authenticated USING (%s)', staff);
  CREATE POLICY "parent_own parent_portal_preferences" ON public.parent_portal_preferences
    FOR ALL TO authenticated
    USING      (parent_account_id = public.current_parent_account_id())
    WITH CHECK (parent_account_id = public.current_parent_account_id());
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — TIGHTEN `USING (true)`  →  `is_staff()`
--
-- Rewrites every authenticated-only SELECT policy whose qualifier is the
-- literal `true` so that it grants staff only.
--
-- Scope guards (deliberately conservative):
--   • roles = '{authenticated}' EXACTLY — a policy also addressed to `anon` or
--     `public` backs a deliberate unauthenticated flow (the public lead-capture
--     form, the proctored exam kiosk) and is left completely untouched.
--   • cmd = 'SELECT' — write policies already gate on get_user_role(), which
--     returns NULL for a parent, so they are closed already.
--   • qual = 'true' — a policy with any real predicate is already scoped.
--
-- Idempotent: after the first run the qualifier is no longer `true`, so a
-- re-run matches nothing. Every rewrite is recorded in parent_portal_rls_audit
-- so the change is reviewable after the fact.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.parent_portal_rls_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  policy_name  TEXT NOT NULL,
  old_qual     TEXT,
  new_qual     TEXT,
  migrated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parent_portal_rls_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read parent_portal_rls_audit" ON public.parent_portal_rls_audit;
CREATE POLICY "staff_read parent_portal_rls_audit" ON public.parent_portal_rls_audit
  FOR SELECT TO authenticated USING (public.is_staff());

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd        = 'SELECT'
       AND qual       = 'true'
       AND roles      = '{authenticated}'
       -- The portal's own tables are configured explicitly above / below.
       AND tablename NOT IN (
             'parent_portal_audit',
             'parent_portal_preferences',
             'parent_portal_rls_audit'
           )
  LOOP
    INSERT INTO public.parent_portal_rls_audit (table_name, policy_name, old_qual, new_qual)
    VALUES (r.tablename, r.policyname, 'true', 'public.is_staff()');

    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (public.is_staff())',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- parent_student_links shipped with `USING (true)` so the portal could "resolve
-- children" — which let ANY authenticated user enumerate the entire
-- parent↔student graph. PART 3 has now narrowed it to staff; re-open it to a
-- parent for their OWN links only.
DROP POLICY IF EXISTS "parent_read parent_student_links" ON public.parent_student_links;
CREATE POLICY "parent_read parent_student_links" ON public.parent_student_links
  FOR SELECT TO authenticated
  USING (parent_account_id = public.current_parent_account_id());


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — CHILD-SCOPED PARENT READ GRANTS
--
-- Purely ADDITIVE SELECT policies. Postgres ORs permissive policies together,
-- so each of these widens access for the parent principal ONLY — staff access
-- is untouched, and a parent with zero links reads nothing anywhere.
--
-- Every policy funnels through is_parent_of() / parent_child_ids(), so the
-- definition of "my child" lives in exactly one place.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- table  →  owning column  →  predicate
  -- The column is named separately so it can be PROBED before the policy is
  -- built: a table whose shape differs on this database is skipped, not fatal.
  spec TEXT[][] := ARRAY[
    -- Student record itself (profile, class, section, medical, transport flags…)
    ['students',               'id',                   'public.is_parent_of(id)'],
    -- Attendance
    ['student_attendance',     'student_id',           'public.is_parent_of(student_id)'],
    -- Examination
    ['exam_results',           'student_id',           'public.is_parent_of(student_id)'],
    -- Fees
    ['student_fees',           'student_id',           'public.is_parent_of(student_id)'],
    -- Documents (metadata; the binary is gated separately in PART 5)
    ['student_documents',      'student_id',           'public.is_parent_of(student_id)'],
    -- Leave
    ['student_leave_requests', 'student_id',           'public.is_parent_of(student_id)'],
    -- Communication history addressed to this child
    ['message_queue',          'recipient_student_id', 'public.is_parent_of(recipient_student_id)']
  ];
  i INT;
  tbl TEXT;
  col TEXT;
  pred TEXT;
BEGIN
  FOR i IN 1 .. array_length(spec, 1) LOOP
    tbl  := spec[i][1];
    col  := spec[i][2];
    pred := spec[i][3];

    -- Missing table OR missing column (module not migrated / older shape on
    -- this database) must not abort the whole migration.
    IF NOT public.pp_col_exists(tbl, col) THEN
      RAISE NOTICE 'parent portal: skipping %.% — not present on this database', tbl, col;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "parent_read %1$s" ON public.%1$s', tbl);
    EXECUTE format(
      'CREATE POLICY "parent_read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (%2$s)',
      tbl, pred
    );
  END LOOP;
END $$;

-- ── 4b. Rows joined through a child rather than owned by one ────────────────
DO $$ BEGIN
  -- fee_installments (receipts) — reached via student_fees.
  IF public.pp_col_exists('fee_installments', 'student_fee_id') THEN
    DROP POLICY IF EXISTS "parent_read fee_installments" ON public.fee_installments;
    CREATE POLICY "parent_read fee_installments" ON public.fee_installments
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.student_fees sf
         WHERE sf.id = fee_installments.student_fee_id
           AND public.is_parent_of(sf.student_id)
      ));
  END IF;

  -- exams — a parent sees an exam their child actually sat / is enrolled for,
  -- or one scheduled for their child's batch or standard (upcoming timetable).
  IF public.pp_col_exists('exams', 'batch_id')
     AND public.pp_col_exists('exams', 'standard_id') THEN
    DROP POLICY IF EXISTS "parent_read exams" ON public.exams;
    CREATE POLICY "parent_read exams" ON public.exams
      FOR SELECT TO authenticated
      USING (
        public.parent_has_child_in_batch(batch_id)
        OR public.parent_has_child_in_standard(standard_id)
        OR EXISTS (
          SELECT 1 FROM public.exam_results er
           WHERE er.exam_id = exams.id
             AND public.is_parent_of(er.student_id)
        )
      );
  END IF;

  -- live_classes — cohort-addressed (standard) or batch-addressed.
  IF public.pp_col_exists('live_classes', 'standard_id')
     AND public.pp_col_exists('live_class_batches', 'batch_id') THEN
    DROP POLICY IF EXISTS "parent_read live_classes" ON public.live_classes;
    CREATE POLICY "parent_read live_classes" ON public.live_classes
      FOR SELECT TO authenticated
      USING (
        public.parent_has_child_in_standard(standard_id)
        OR EXISTS (
          SELECT 1 FROM public.live_class_batches lcb
           WHERE lcb.live_class_id = live_classes.id
             AND public.parent_has_child_in_batch(lcb.batch_id)
        )
      );
  END IF;

  IF public.pp_col_exists('live_class_batches', 'batch_id') THEN
    DROP POLICY IF EXISTS "parent_read live_class_batches" ON public.live_class_batches;
    CREATE POLICY "parent_read live_class_batches" ON public.live_class_batches
      FOR SELECT TO authenticated
      USING (public.parent_has_child_in_batch(batch_id));
  END IF;

  -- live_class_attendance — only my child's own join record.
  IF public.pp_col_exists('live_class_attendance', 'student_id') THEN
    DROP POLICY IF EXISTS "parent_read live_class_attendance" ON public.live_class_attendance;
    CREATE POLICY "parent_read live_class_attendance" ON public.live_class_attendance
      FOR SELECT TO authenticated
      USING (public.is_parent_of(student_id));
  END IF;

  -- class_schedules — the daily timetable for my child's batch / standard.
  IF public.pp_col_exists('class_schedules', 'batch_id')
     AND public.pp_col_exists('class_schedules', 'standard_id') THEN
    DROP POLICY IF EXISTS "parent_read class_schedules" ON public.class_schedules;
    CREATE POLICY "parent_read class_schedules" ON public.class_schedules
      FOR SELECT TO authenticated
      USING (
        public.parent_has_child_in_batch(batch_id)
        OR public.parent_has_child_in_standard(standard_id)
      );
  END IF;

  -- Study material shared with my child's batch.
  --
  -- study_materials is keyed by BATCH and SUBJECT — it has no standard_id.
  -- It also already ships its own read policy (`visibility = 'shared'` for any
  -- authenticated user), which PART 3 left alone because it is not `USING(true)`.
  -- This policy is therefore additive and deliberately NARROWER than that one:
  -- a parent gets material for their child's batch. The pre-existing shared-
  -- visibility rule is the institution's own choice and is not touched here.
  IF public.pp_col_exists('study_materials', 'batch_id') THEN
    DROP POLICY IF EXISTS "parent_read study_materials" ON public.study_materials;
    CREATE POLICY "parent_read study_materials" ON public.study_materials
      FOR SELECT TO authenticated
      USING (public.parent_has_child_in_batch(batch_id));
  END IF;
END $$;

-- ── 4c. Reference lookups a parent needs to RENDER their child's data ───────
-- Class / section / subject / campus names. These carry no per-student
-- information — without them the portal would show raw UUIDs. Narrowed to the
-- cohorts the parent's children actually belong to where the table has a
-- usable discriminator, and left as a flat read where it is pure reference
-- data (subjects, campuses, academic years).
DO $$
DECLARE
  t TEXT;
BEGIN
  -- Pure reference data — no student-identifying content whatsoever.
  FOREACH t IN ARRAY ARRAY['subjects','campuses','academic_years','course_types'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "parent_read %1$s" ON public.%1$s', t);
      EXECUTE format(
        'CREATE POLICY "parent_read %1$s" ON public.%1$s '
        'FOR SELECT TO authenticated USING (public.is_parent())', t);
    END IF;
  END LOOP;

  -- Standards / batches / sections — scoped to the cohorts of my children so a
  -- parent cannot enumerate the institution's full class structure.
  IF public.pp_col_exists('standards', 'id') THEN
    DROP POLICY IF EXISTS "parent_read standards" ON public.standards;
    CREATE POLICY "parent_read standards" ON public.standards
      FOR SELECT TO authenticated USING (public.parent_has_child_in_standard(id));
  END IF;

  IF public.pp_col_exists('batches', 'id') THEN
    DROP POLICY IF EXISTS "parent_read batches" ON public.batches;
    CREATE POLICY "parent_read batches" ON public.batches
      FOR SELECT TO authenticated USING (public.parent_has_child_in_batch(id));
  END IF;

  IF public.pp_col_exists('sections', 'standard_id') THEN
    DROP POLICY IF EXISTS "parent_read sections" ON public.sections;
    CREATE POLICY "parent_read sections" ON public.sections
      FOR SELECT TO authenticated USING (public.parent_has_child_in_standard(standard_id));
  END IF;
END $$;

-- NOTE ON `profiles`: deliberately NOT re-opened to parents. Teacher names the
-- portal needs are already denormalised onto the rows a parent may read
-- (exams.* has no teacher, live_classes.teacher_name, class_schedules.
-- teacher_name), so the portal never needs to read the staff directory. PART 3
-- has closed "Authenticated users can view all profiles" to staff — a parent
-- can no longer enumerate every employee's name, role and campus.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — STORAGE: child-scoped document download
--
-- documents.service uploads to `<studentId>/<timestamp>_<file>`, so the first
-- path segment is the owning student id. The pre-existing read policy granted
-- every authenticated user the whole bucket; narrow it to staff and add a
-- parent grant keyed on that first segment.
-- ════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  DROP POLICY IF EXISTS "student_docs_read"        ON storage.objects;
  DROP POLICY IF EXISTS "student_docs_read_staff"  ON storage.objects;
  DROP POLICY IF EXISTS "student_docs_read_parent" ON storage.objects;

  CREATE POLICY "student_docs_read_staff" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'student-documents' AND public.is_staff());

  CREATE POLICY "student_docs_read_parent" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'student-documents'
      AND public.is_parent()
      -- Guard the cast: a malformed path must yield "no access", not an error
      -- that aborts the parent's whole request.
      AND (storage.foldername(name))[1] ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.is_parent_of(((storage.foldername(name))[1])::uuid)
    );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping storage.objects policies — insufficient privilege. '
               'Apply PART 5 from the Supabase SQL editor as the owner.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — REALTIME
--
-- The portal's "no refresh" requirement is served by the existing per-table
-- publication. Add only the new tables; every domain table the portal watches
-- (student_attendance, student_fees, exams, exam_results, message_queue,
-- live_classes) is already published by its own module's migration.
--
-- Realtime respects RLS, so a parent's subscription only ever delivers rows
-- that PART 4 lets them SELECT.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'parent_portal_audit',
    'parent_portal_preferences'
  ];
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

-- Domain tables the portal subscribes to. Guarded — each is a no-op if its own
-- module migration already published it.
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'student_attendance', 'student_fees', 'fee_installments',
    'exams', 'exam_results', 'message_queue', 'live_classes',
    'class_schedules', 'student_documents'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY tables LOOP
      IF EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name=tbl)
         AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=tbl
         ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
