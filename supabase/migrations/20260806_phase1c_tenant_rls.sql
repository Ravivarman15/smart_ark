-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1C — TENANT-SCOPED RLS + STORAGE ISOLATION              2026-08-06
--
-- IDEMPOTENT. Paired rollback: 20260806_phase1c_tenant_rls_rollback.sql
-- Requires: 1A (foundation) and 1B (columns).
--
-- ┌── HOW 362 POLICIES ARE SCOPED WITHOUT REWRITING ONE OF THEM ───────────┐
-- │ The existing policies encode months of hard-won authorization logic:   │
-- │ coordinator-owns-standard, parent-of-this-student, teacher-owns-own-   │
-- │ row, fee-collector, leave-approver. Hand-rewriting 362 of them would   │
-- │ be the single most likely way to break ARK in this entire programme.   │
-- │                                                                        │
-- │ So we do not rewrite them. We WRAP them:                               │
-- │                                                                        │
-- │   ALTER POLICY <name> ON <table>                                       │
-- │     USING (organization_id = current_org_id() AND (<existing qual>))   │
-- │                                                                        │
-- │ pg_policies.qual gives the current expression; ALTER POLICY replaces   │
-- │ it with the conjunction. Every existing rule survives byte-for-byte    │
-- │ inside the parentheses, and gains a tenant guard in front.             │
-- │                                                                        │
-- │ For ARK the behaviour is IDENTICAL: every row already belongs to the   │
-- │ only organization, so the new conjunct is always true.                 │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 0 — BACK UP EVERY POLICY EXPRESSION BEFORE TOUCHING IT
--
-- The rollback must restore the ORIGINAL expressions exactly. Two ways to do
-- that: regex the wrapper back off at rollback time, or record the originals
-- now. Regex-editing 362 live SQL predicates to undo a security change is
-- precisely the kind of clever-but-fragile move that corrupts an
-- authorization rule and nobody notices until a teacher sees payroll.
--
-- So we snapshot. Rollback becomes a lossless UPDATE from this table.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tenancy_policy_backup (
  id          bigserial PRIMARY KEY,
  schema_name text NOT NULL,
  table_name  text NOT NULL,
  policy_name text NOT NULL,
  cmd         text,
  orig_qual   text,
  orig_check  text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_name, table_name, policy_name)
);

ALTER TABLE public.tenancy_policy_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancy_policy_backup FORCE ROW LEVEL SECURITY;
-- No policies: service role / migrations only. This table is the rollback's
-- source of truth for authorization logic and must never be tenant-writable.

INSERT INTO public.tenancy_policy_backup
  (schema_name, table_name, policy_name, cmd, orig_qual, orig_check)
SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
  FROM pg_policies p
 WHERE (p.schemaname = 'public' AND public.is_tenant_scoped_table(p.tablename))
    OR (p.schemaname = 'storage' AND p.tablename = 'objects')
ON CONFLICT (schema_name, table_name, policy_name) DO NOTHING;
-- DO NOTHING, not DO UPDATE: on a re-run the stored value must remain the
-- PRE-WRAP original. Overwriting would capture the already-wrapped expression
-- and make the rollback a no-op.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — wrap every policy on every tenant-scoped table
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pol       RECORD;
  new_qual  text;
  new_check text;
  n_wrapped int := 0;
  n_skipped int := 0;
BEGIN
  FOR pol IN
    SELECT p.schemaname, p.tablename, p.policyname, p.qual, p.with_check, p.cmd
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND public.is_tenant_scoped_table(p.tablename)
       -- Only tables that actually carry the column (a table could be new and
       -- not yet processed by 1B; scoping it here would be a syntax error).
       AND EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema='public' AND c.table_name=p.tablename
            AND c.column_name='organization_id')
     ORDER BY p.tablename, p.policyname
  LOOP
    -- Idempotency: a policy already carrying the conjunct is left alone.
    -- Without this, re-running would nest the guard repeatedly.
    IF COALESCE(pol.qual, '') LIKE '%current_org_id%'
       OR COALESCE(pol.with_check, '') LIKE '%current_org_id%' THEN
      n_skipped := n_skipped + 1;
      CONTINUE;
    END IF;

    new_qual := CASE
      WHEN pol.qual IS NULL THEN NULL
      ELSE format('(organization_id = public.current_org_id() AND (%s))', pol.qual)
    END;

    new_check := CASE
      WHEN pol.with_check IS NULL THEN NULL
      ELSE format('(organization_id = public.current_org_id() AND (%s))', pol.with_check)
    END;

    BEGIN
      IF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                       pol.policyname, pol.tablename, new_qual, new_check);
      ELSIF new_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                       pol.policyname, pol.tablename, new_qual);
      ELSIF new_check IS NOT NULL THEN
        -- INSERT policies have WITH CHECK only.
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                       pol.policyname, pol.tablename, new_check);
      END IF;
      n_wrapped := n_wrapped + 1;
    EXCEPTION WHEN others THEN
      -- Report and continue: one exotic policy must not abort the cutover and
      -- leave the database half-scoped. PART 5 lists anything left unscoped.
      RAISE WARNING 'Could not scope policy % on %: %', pol.policyname, pol.tablename, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Phase 1C: wrapped % policies (% already scoped).', n_wrapped, n_skipped;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — ENABLE + FORCE RLS everywhere
--
-- FORCE matters: without it the table OWNER bypasses RLS entirely. That is the
-- role migrations run as, and in some configurations PostgREST too.
-- A table with RLS enabled but no policy is deny-all — reported in PART 5
-- rather than silently left broken.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE rec RECORD; n int := 0;
BEGIN
  FOR rec IN
    SELECT c.relname AS tbl, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND public.is_tenant_scoped_table(c.relname)
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname
                      AND column_name='organization_id')
  LOOP
    IF NOT rec.relrowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tbl);
      n := n + 1;
    END IF;
    IF NOT rec.relforcerowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', rec.tbl);
    END IF;
  END LOOP;
  RAISE NOTICE 'Phase 1C: enabled RLS on % additional table(s); FORCE applied to all.', n;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — make the existing identity helpers tenant-aware
--
-- These are called from inside many of the wrapped policies. Scoping them here
-- means a policy whose own qual is only `current_profile_id() = x` still gets
-- tenant containment through the helper, defence in depth.
-- ════════════════════════════════════════════════════════════════════════════

-- Consolidated. NOTE: current_profile_id() was defined FOUR separate times
-- across 20260614 / 20260617 / 20260718 / 20260723. Whichever ran last won.
-- This is now the single definition; later migrations must not redefine it.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles
   WHERE user_id = auth.uid()
     AND organization_id = public.current_org_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND organization_id = public.current_org_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_roles TEXT[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = auth.uid()
       AND is_active
       AND organization_id = public.current_org_id()
       AND role::text = ANY (_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles
   WHERE user_id = _user_id
     AND organization_id = public.current_org_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = _user_id AND role = _role
       AND organization_id = public.current_org_id()
  );
$$;

-- Parent helpers: a parent must never reach a child in another organization.
CREATE OR REPLACE FUNCTION public.current_parent_account_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.parent_auth_accounts
   WHERE user_id = auth.uid()
     AND status = 'active'
     AND organization_id = public.current_org_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_parent_account_id() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.parent_child_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.student_id
    FROM public.parent_student_links l
   WHERE l.parent_account_id = public.current_parent_account_id()
     AND l.organization_id = public.current_org_id();
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of(_student_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_child_ids() AS c(id) WHERE c.id = _student_id
  );
$$;

-- get_financial_summary is SECURITY DEFINER, so it BYPASSES RLS. Its role gate
-- was already correct (management only — re-verified in Phase 0); what it
-- lacked was a tenant bound. Without this it would aggregate every tenant's
-- fee_transactions into one number.
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_campus_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
  user_role app_role;
  org uuid := public.current_org_id();
BEGIN
  SELECT role INTO user_role FROM public.profiles
   WHERE user_id = auth.uid() AND organization_id = org;
  IF user_role IS DISTINCT FROM 'management' THEN
    RAISE EXCEPTION 'Access denied: 403 Forbidden';
  END IF;
  IF org IS NULL THEN
    RAISE EXCEPTION 'Access denied: no organization context';
  END IF;

  SELECT json_build_object(
    'total_collected', COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END), 0),
    'total_pending',   COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END), 0),
    'total_fees',      COALESCE(SUM(amount), 0),
    'paid_count',      COUNT(*) FILTER (WHERE paid),
    'total_count',     COUNT(*),
    'collection_pct',  CASE WHEN COUNT(*) > 0
                            THEN ROUND((COUNT(*) FILTER (WHERE paid)::NUMERIC / COUNT(*)::NUMERIC) * 100, 1)
                            ELSE 0 END
  ) INTO result
  FROM public.fee_transactions
  WHERE organization_id = org
    AND (p_campus_id IS NULL OR campus_id = p_campus_id);
  RETURN result;
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — STORAGE ISOLATION
--
-- New uploads are keyed `{organization_id}/…` (see src/lib/orgStorage.ts).
-- Existing ARK objects have no such prefix and MUST keep working — relocating
-- thousands of live files is not something to do inside a transaction.
--
-- storage_path_org_ok() therefore accepts either shape, with the SAME
-- self-disabling guard as fallback_org_id(): the legacy branch is trusted only
-- while EXACTLY ONE organization exists. With a second tenant it returns false
-- and unprefixed objects become unreadable — fail closed, never leak.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.storage_path_org_ok(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL THEN false
    -- New shape: first path segment is the owning organization.
    WHEN (storage.foldername(_name))[1] = public.current_org_id()::text THEN true
    -- Legacy shape: tolerated only while ARK is the sole tenant.
    WHEN (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL) = 1 THEN true
    ELSE false
  END
$$;

COMMENT ON FUNCTION public.storage_path_org_ok(text) IS
  'Tenant check for a storage object path. Accepts the legacy un-prefixed shape '
  'ONLY while exactly one organization exists, so pre-Phase-1 files keep working '
  'without a risky bulk relocation, and the tolerance disappears automatically '
  'the moment a second tenant is created.';

-- ┌── THE SEGMENT-SHIFT BUG THIS PART EXISTS TO PREVENT ───────────────────┐
-- │ Two live policies identify an ENTITY by the FIRST folder segment:      │
-- │                                                                        │
-- │   student_docs_read_parent (20260727):                                 │
-- │       is_parent_of(((storage.foldername(name))[1])::uuid)              │
-- │   profile_pictures_owner_write (Phase 0):                              │
-- │       (storage.foldername(name))[1] = current_profile_id()::text       │
-- │                                                                        │
-- │ Prefixing uploads with {organization_id}/ shifts that entity id from   │
-- │ segment 1 to segment 2. Left alone, parents would silently lose access │
-- │ to their own children's documents and staff could no longer upload an  │
-- │ avatar — a regression introduced by the isolation work itself.         │
-- │                                                                        │
-- │ storage_entity_segment() reads the LAST folder segment instead, which  │
-- │ is the entity id under BOTH layouts:                                   │
-- │     {student}/file.pdf            → student   (legacy)                 │
-- │     {org}/{student}/file.pdf      → student   (new)                    │
-- └────────────────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.storage_entity_segment(_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (storage.foldername(_name))[array_length(storage.foldername(_name), 1)]
$$;

COMMENT ON FUNCTION public.storage_entity_segment(text) IS
  'The folder segment immediately containing the file — the entity id under '
  'both the legacy {entity}/file and the org-partitioned {org}/{entity}/file '
  'layouts. Use this instead of foldername(name)[1] in any policy that '
  'identifies an entity by path.';

DO $$ BEGIN
  -- Parent access to their own children's documents.
  DROP POLICY IF EXISTS "student_docs_read_parent" ON storage.objects;
  CREATE POLICY "student_docs_read_parent" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'student-documents'
      AND public.storage_path_org_ok(name)
      AND public.is_parent()
      -- Guard the cast: a malformed path must yield "no access", not an error
      -- that aborts the parent's whole request. (Preserved from 20260727.)
      AND public.storage_entity_segment(name) ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.is_parent_of(public.storage_entity_segment(name)::uuid)
    );

  -- Staff uploading their own avatar.
  DROP POLICY IF EXISTS profile_pictures_owner_write  ON storage.objects;
  DROP POLICY IF EXISTS profile_pictures_owner_update ON storage.objects;
  CREATE POLICY profile_pictures_owner_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND public.storage_path_org_ok(name)
      AND (public.storage_entity_segment(name) = public.current_profile_id()::text
           OR public.has_any_role(ARRAY['admin','management']))
    );
  CREATE POLICY profile_pictures_owner_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'profile-pictures'
      AND public.storage_path_org_ok(name)
      AND (public.storage_entity_segment(name) = public.current_profile_id()::text
           OR public.has_any_role(ARRAY['admin','management']))
    );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping segment-shift policy fixes — insufficient privilege. '
               'Re-run from the SQL editor as owner, or parents lose document access.';
END $$;

-- Add the tenant conjunct to every remaining Phase 0 storage policy, preserving
-- the role checks exactly as written there. The three rebuilt above already
-- carry storage_path_org_ok and are skipped by the NOT LIKE filter.
DO $$
DECLARE
  pol RECORD; n int := 0;
BEGIN
  FOR pol IN
    SELECT policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND COALESCE(qual,'') NOT LIKE '%storage_path_org_ok%'
       AND COALESCE(with_check,'') NOT LIKE '%storage_path_org_ok%'
       -- profile-pictures read is deliberately public (avatars) — see Phase 0.
       AND policyname <> 'profile_pictures_public_read'
  LOOP
    BEGIN
      IF pol.qual IS NOT NULL AND pol.with_check IS NOT NULL THEN
        EXECUTE format(
          'ALTER POLICY %I ON storage.objects USING (public.storage_path_org_ok(name) AND (%s)) '
          'WITH CHECK (public.storage_path_org_ok(name) AND (%s))',
          pol.policyname, pol.qual, pol.with_check);
      ELSIF pol.qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON storage.objects USING (public.storage_path_org_ok(name) AND (%s))',
                       pol.policyname, pol.qual);
      ELSIF pol.with_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (public.storage_path_org_ok(name) AND (%s))',
                       pol.policyname, pol.with_check);
      END IF;
      n := n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not scope storage policy %: %', pol.policyname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Phase 1C: scoped % storage policies.', n;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping storage policy scoping — insufficient privilege. '
               'Re-run PART 4 from the SQL editor as owner.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — VERIFICATION + READINESS FLAGS
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  unscoped int; norls int; nopolicy int; permissive int;
BEGIN
  SELECT count(*) INTO unscoped
    FROM pg_policies p
   WHERE p.schemaname='public' AND public.is_tenant_scoped_table(p.tablename)
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=p.tablename
                    AND column_name='organization_id')
     AND COALESCE(p.qual,'')       NOT LIKE '%current_org_id%'
     AND COALESCE(p.with_check,'') NOT LIKE '%current_org_id%';

  SELECT count(*) INTO norls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND public.is_tenant_scoped_table(c.relname)
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);

  SELECT count(*) INTO nopolicy
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
     AND public.is_tenant_scoped_table(c.relname)
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname='public' AND p.tablename=c.relname);

  -- The 102 fully-permissive policies from Phase 0 should now all read
  -- (organization_id = current_org_id() AND (true)) — i.e. zero remain bare.
  SELECT count(*) INTO permissive
    FROM pg_policies
   WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true');

  RAISE NOTICE 'Phase 1C verification — unscoped policies: %, tables without FORCE RLS: %, '
               'RLS-on-but-no-policy: %, bare permissive policies: %',
               unscoped, norls, nopolicy, permissive;

  IF unscoped = 0 AND norls = 0 AND permissive = 0 THEN
    UPDATE public.tenancy_readiness
       SET ready = true, updated_at = now()
     WHERE flag IN ('rls_tenant_scoped', 'storage_org_partitioned');
    RAISE NOTICE 'Phase 1C: CLEAN — rls_tenant_scoped and storage_org_partitioned marked ready.';
  ELSE
    RAISE WARNING 'Phase 1C: NOT clean — readiness flags left false. A second '
                  'organization remains blocked (by design).';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
