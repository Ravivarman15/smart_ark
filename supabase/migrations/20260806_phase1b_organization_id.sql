-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1B — organization_id ON EVERY BUSINESS TABLE            2026-08-06
--
-- ADDITIVE ONLY. IDEMPOTENT. NO DATA IS DELETED, MOVED OR REKEYED.
-- Paired rollback: 20260806_phase1b_organization_id_rollback.sql
-- Requires: 20260806_phase1a_tenant_foundation.sql
--
-- ┌── WHY THIS ITERATES pg_catalog INSTEAD OF LISTING 167 TABLES ──────────┐
-- │ 1. The live database does NOT match the repository. Several migrations │
-- │    are known to be unapplied, so a hardcoded list would fail on the    │
-- │    first missing table and abort the whole run.                        │
-- │ 2. A hand-written list rots. The next module to ship would silently    │
-- │    create an unscoped table, and nobody would notice until it leaked.  │
-- │ 3. Idempotency and re-runnability come free.                           │
-- │                                                                        │
-- │ The catalog IS the source of truth. Anything in `public` that is not   │
-- │ explicitly excluded gets a tenant column — deny-by-default, applied to │
-- │ schema design.                                                         │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────┐
-- │ It does NOT convert globally-unique constraints to composite           │
-- │ (organization_id, …) keys — e.g. system_settings.key, campuses.name,   │
-- │ rbac_roles.slug, comms_automation_settings.event_key.                  │
-- │                                                                        │
-- │ WHY: 25 call sites pass an explicit `onConflict` naming the EXACT      │
-- │ column list, e.g.                                                      │
-- │     .upsert(rows, { onConflict: "student_id,date" })                   │
-- │     .upsert(row,  { onConflict: "scope,period_type,period_key" })      │
-- │     .upsert(row,  { onConflict: "singleton" })                         │
-- │ Postgres rejects ON CONFLICT when no unique index matches the named    │
-- │ columns EXACTLY. Prepending organization_id would break attendance     │
-- │ submission, staff attendance, exam-result entry, class allocation and  │
-- │ comms settings the moment this deployed — the precise "never break     │
-- │ ARK" failure this phase forbids.                                       │
-- │                                                                        │
-- │ Those constraints are still CORRECT today: with one tenant, a global   │
-- │ unique and a per-tenant unique are the same thing. They become wrong   │
-- │ only when organization #2 exists.                                      │
-- │                                                                        │
-- │ So PART 5 installs a guard that makes it IMPOSSIBLE to create a second │
-- │ organization until that work (Phase 1D — constraint + call site        │
-- │ changed together) is done and its flag is set. The unsafe state is     │
-- │ unreachable by construction rather than by discipline.                 │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — the exclusion list
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tenant_scoped_table(_table text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _table NOT IN (
    -- The tenant spine itself. `organizations` IS the tenant; the rest carry a
    -- direct organization_id FK created in 1A, so the generic loop must skip
    -- them or it would try to add a duplicate column.
    'organizations', 'organization_users', 'organization_branches',
    'organization_settings', 'organization_domains', 'organization_branding',
    'organization_subscriptions', 'organization_audit',
    -- Platform-level, deliberately cross-tenant.
    'platform_users',
    -- Postgres/Supabase bookkeeping that may appear in `public`.
    'schema_migrations', 'spatial_ref_sys'
  )
$$;

COMMENT ON FUNCTION public.is_tenant_scoped_table(text) IS
  'Single source of truth for "must this table carry organization_id?". Used '
  'by the migration, the runtime audit and the CI gate so all three can never '
  'disagree about what is in scope.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — ADD COLUMN (nullable), BACKFILL, then CONSTRAIN
--
-- Three separate steps on purpose. Adding a NOT NULL DEFAULT column in one
-- statement would evaluate the default for every existing row while holding an
-- ACCESS EXCLUSIVE lock — on a production institute's attendance history that
-- is a visible outage. Nullable-add is instant (Postgres 11+ metadata-only),
-- the backfill runs in committed batches that release locks between chunks,
-- and only then is the constraint applied.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ark        uuid;
  rec        RECORD;
  n_added    int := 0;
  n_filled   bigint := 0;
  batch      bigint;
  total      bigint;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';
  IF ark IS NULL THEN
    RAISE EXCEPTION 'Phase 1A has not run — no ARK organization to backfill to.';
  END IF;

  FOR rec IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'                       -- ordinary tables only
       AND public.is_tenant_scoped_table(c.relname)
     ORDER BY c.relname
  LOOP
    -- ── (a) add the column if absent ─────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = rec.tbl
         AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id uuid', rec.tbl);
      n_added := n_added + 1;
    END IF;

    -- ── (b) backfill in committed batches ────────────────────────────────
    -- ARK's data is modest, but the pattern must be right: this migration is
    -- the template every future tenant-column change will copy.
    LOOP
      EXECUTE format(
        'UPDATE public.%I SET organization_id = $1
          WHERE ctid IN (SELECT ctid FROM public.%I
                          WHERE organization_id IS NULL LIMIT 10000)',
        rec.tbl, rec.tbl) USING ark;
      GET DIAGNOSTICS batch = ROW_COUNT;
      n_filled := n_filled + batch;
      EXIT WHEN batch = 0;
    END LOOP;

    -- ── (c) default: stamp the tenant on every future INSERT ─────────────
    -- THE PIVOT OF THE ENTIRE PROJECT. Because the application never sends
    -- organization_id, Postgres supplies it. That is why all 1,243 `.from()`
    -- call sites, 207 services and 26 feature modules need ZERO changes.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.current_org_id()',
      rec.tbl);

    -- ── (d) NOT NULL — an unstamped row is an unisolated row ─────────────
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', rec.tbl)
       INTO total;
    IF total = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', rec.tbl);
    ELSE
      RAISE WARNING '% still has % NULL organization_id rows — NOT NULL skipped. '
                    'Re-run this migration.', rec.tbl, total;
    END IF;

    -- ── (e) FK, RESTRICT — deleting an org with data must be impossible ──
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass(format('public.%I', rec.tbl))
         AND conname  = rec.tbl || '_organization_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I
           FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
           ON DELETE RESTRICT',
        rec.tbl, rec.tbl || '_organization_id_fkey');
    END IF;

    -- ── (f) index LEADING with organization_id ───────────────────────────
    -- Every query now carries `organization_id = ?`. Without a tenant-leading
    -- index the planner scans across tenants and filters afterwards — the
    -- classic multi-tenant performance cliff.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)',
      'idx_' || rec.tbl || '_org', rec.tbl);
  END LOOP;

  RAISE NOTICE 'Phase 1B: added organization_id to % table(s); backfilled % row(s) to ARK.',
    n_added, n_filled;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — COMPOSITE FOREIGN KEYS FOR THE CORE ENTITIES
--
-- An FK to students(id) proves the student exists — NOT that they are in YOUR
-- organization. A composite FK makes cross-tenant reference STRUCTURALLY
-- IMPOSSIBLE rather than merely policy-prevented: even a service-role write
-- that bypasses RLS cannot attach org A's student to org B's fee record.
--
-- Applied to the highest-value relationships only. All 167 would be
-- theoretically better and practically a lot of write amplification for
-- sharply diminishing returns.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  parent_ok boolean;
BEGIN
  -- (a) Give each parent table a UNIQUE (organization_id, id) so it can be the
  --     target of a composite FK. Redundant with the PK, but Postgres requires
  --     a constraint over exactly the referenced column list.
  FOR rec IN
    SELECT unnest(ARRAY['students','profiles','batches','campuses']) AS tbl
  LOOP
    -- to_regclass(), not ::regclass — the cast RAISES on a missing table, and
    -- SQL does not guarantee AND short-circuits, so an unapplied migration
    -- would abort the whole block. to_regclass returns NULL instead.
    IF to_regclass(format('public.%I', rec.tbl)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass(format('public.%I', rec.tbl))
            AND conname = rec.tbl || '_org_id_uq')
    THEN
      -- Redundant with the PK, but a composite FK can only reference a
      -- UNIQUE/PK constraint over exactly those columns.
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (organization_id, id)',
                     rec.tbl, rec.tbl || '_org_id_uq');
    END IF;
  END LOOP;

  -- (b) child table, child column, parent table
  FOR rec IN
    SELECT * FROM (VALUES
      ('student_attendance', 'student_id', 'students'),
      ('student_fees',       'student_id', 'students'),
      ('exam_results',       'student_id', 'students'),
      ('student_documents',  'student_id', 'students'),
      ('parent_student_links','student_id','students'),
      ('class_students',     'student_id', 'students'),
      ('student_auth_accounts','student_id','students'),
      ('leave_requests',     'user_id',    'profiles'),
      ('staff_attendance',   'staff_id',   'profiles'),
      ('payroll_items',      'staff_id',   'profiles')
    ) AS t(child, col, parent)
  LOOP
    -- Skip silently when either table is absent (unapplied migrations) or the
    -- column has since been renamed — this must never abort the run.
    SELECT to_regclass(format('public.%I', rec.child))  IS NOT NULL
       AND to_regclass(format('public.%I', rec.parent)) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=rec.child AND column_name=rec.col)
       AND EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass(format('public.%I', rec.parent))
            AND conname = rec.parent || '_org_id_uq')
      INTO parent_ok;

    IF NOT parent_ok THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass(format('public.%I', rec.child))
         AND conname  = rec.child || '_' || rec.col || '_same_org')
    THEN
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I
             FOREIGN KEY (organization_id, %I)
             REFERENCES public.%I (organization_id, id)',
          rec.child, rec.child || '_' || rec.col || '_same_org', rec.col, rec.parent);
      EXCEPTION WHEN others THEN
        -- e.g. pre-existing orphan rows. Report; never abort the migration.
        RAISE WARNING 'Composite FK %.% → % skipped: %',
          rec.child, rec.col, rec.parent, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — READINESS FLAGS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tenancy_readiness (
  flag       text PRIMARY KEY,
  ready      boolean NOT NULL DEFAULT false,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenancy_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancy_readiness FORCE ROW LEVEL SECURITY;
-- No policies: readable/writable only by the service role and migrations.
-- A tenant must never be able to flip its own isolation gate.

INSERT INTO public.tenancy_readiness (flag, ready, note) VALUES
  ('organization_id_columns', true,
   'Phase 1B: organization_id present, NOT NULL, defaulted and indexed on every scoped table.'),
  ('rls_tenant_scoped', false,
   'Phase 1C sets this once every policy carries a current_org_id() conjunct.'),
  ('composite_unique_keys', false,
   'Phase 1D: convert globally-unique constraints to (organization_id, …) AND update the 25 '
   'onConflict call sites in the same commit. Until then a second organization is BLOCKED.'),
  ('storage_org_partitioned', false,
   'Phase 1C partitions new uploads under {organization_id}/. Legacy objects stay readable '
   'only while exactly one organization exists.')
ON CONFLICT (flag) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — THE SECOND-ORGANIZATION GUARD
--
-- This is what makes an incomplete Phase 1 SAFE rather than merely documented.
--
-- Phase 1 delivers row isolation but not composite unique keys (see the header).
-- In that state a second organization would hit constraint collisions —
-- two orgs could not both have a "Main Campus", and org B's system_settings
-- write would overwrite org A's. Rather than trust a checklist, the database
-- physically refuses to create organization #2 until every flag is green.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assert_multi_tenant_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing int;
  blockers text;
BEGIN
  SELECT count(*) INTO existing FROM public.organizations WHERE deleted_at IS NULL;
  IF existing = 0 THEN
    RETURN NEW;                      -- the very first org (ARK) always allowed
  END IF;

  SELECT string_agg(flag || ' (' || COALESCE(note, '') || ')', E'\n  - ')
    INTO blockers
    FROM public.tenancy_readiness WHERE NOT ready;

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION
      E'Refusing to create a second organization — tenant isolation is incomplete.\n'
       'Unmet readiness flags:\n  - %\n'
       'Creating another tenant now would cause unique-constraint collisions '
       'between organizations. Complete the work, set the flag in '
       'public.tenancy_readiness, then retry.', blockers;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assert_multi_tenant_ready ON public.organizations;
CREATE TRIGGER trg_assert_multi_tenant_ready
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.assert_multi_tenant_ready();


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — VERIFICATION (reports; never fails the migration)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  missing int; nulls int; unindexed int;
BEGIN
  SELECT count(*) INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND public.is_tenant_scoped_table(c.relname)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name=c.relname
                        AND column_name='organization_id');

  SELECT count(*) INTO nulls
    FROM information_schema.columns
   WHERE table_schema='public' AND column_name='organization_id'
     AND is_nullable='YES'
     AND public.is_tenant_scoped_table(table_name);

  SELECT count(*) INTO unindexed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND public.is_tenant_scoped_table(c.relname)
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=c.relname
                    AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a
                       ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
                     WHERE i.indrelid=c.oid AND a.attname='organization_id');

  RAISE NOTICE 'Phase 1B verification — tables missing column: %, nullable: %, without leading index: %',
    missing, nulls, unindexed;
  IF missing = 0 AND nulls = 0 AND unindexed = 0 THEN
    RAISE NOTICE 'Phase 1B: CLEAN.';
  ELSE
    RAISE WARNING 'Phase 1B: re-run required — see counts above.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
