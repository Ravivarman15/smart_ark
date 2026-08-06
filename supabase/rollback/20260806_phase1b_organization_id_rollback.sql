-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 1B (organization_id COLUMNS)                    2026-08-06
--
-- Run AFTER the 1C rollback (order: 1C → 1B → 1A).
--
-- ┌── READ THIS BEFORE RUNNING ────────────────────────────────────────────┐
-- │ DROP COLUMN organization_id IS DESTRUCTIVE AND IRREVERSIBLE.           │
-- │ It discards which tenant every row belongs to. On a single-tenant      │
-- │ database that information is trivially recoverable (everything is      │
-- │ ARK's), which is why this is tolerable here and NOWHERE ELSE.          │
-- │                                                                        │
-- │ In almost every real incident the right move is to roll back 1C only.  │
-- │ That removes the tenant ENFORCEMENT and restores previous behaviour    │
-- │ completely, while leaving the harmless, unread columns in place.       │
-- │ A nullable extra column costs nothing; re-backfilling 167 tables does. │
-- │                                                                        │
-- │ DEFAULT MODE IS THEREFORE NON-DESTRUCTIVE: this script drops only the  │
-- │ DEFAULT, the NOT NULL and the guard trigger. To also drop the columns  │
-- │ you must explicitly opt in — see PART 4.                               │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 0 — refuse on a genuinely multi-tenant database ────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.organizations WHERE deleted_at IS NULL;
  IF n > 1 THEN
    RAISE EXCEPTION
      'Refusing to roll back organization_id: % organizations exist. Their rows '
      'would become indistinguishable and the data could not be re-separated.', n;
  END IF;
END $$;


-- ── PART 1 — remove the guard trigger ───────────────────────────────────────
DROP TRIGGER  IF EXISTS trg_assert_multi_tenant_ready ON public.organizations;
DROP FUNCTION IF EXISTS public.assert_multi_tenant_ready();


-- ── PART 2 — relax the columns (NON-DESTRUCTIVE) ────────────────────────────
-- Drops DEFAULT + NOT NULL so writes behave exactly as they did pre-1B, while
-- keeping the data. This alone is enough to undo 1B's behavioural effect.
DO $$
DECLARE rec RECORD; n int := 0;
BEGIN
  FOR rec IN
    SELECT c.relname AS tbl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND public.is_tenant_scoped_table(c.relname)
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname
                      AND column_name='organization_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id DROP DEFAULT', rec.tbl);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id DROP NOT NULL', rec.tbl);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Rollback 1B: relaxed organization_id on % table(s). Data retained.', n;
END $$;


-- ── PART 3 — drop the composite FKs ─────────────────────────────────────────
-- These enforce same-tenant references. Harmless to keep on one tenant, but
-- they are 1B's constraints, so a full 1B rollback removes them.
DO $$
DECLARE rec RECORD; n int := 0;
BEGIN
  FOR rec IN
    SELECT conrelid::regclass::text AS tbl, conname
      FROM pg_constraint
     WHERE conname LIKE '%\_same\_org' OR conname LIKE '%\_org\_id\_uq'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', rec.tbl, rec.conname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Rollback 1B: dropped % composite constraint(s).', n;
END $$;


-- ── PART 4 — DESTRUCTIVE COLUMN DROP (OPT-IN ONLY) ──────────────────────────
--
-- Deliberately inert. To actually drop the columns, uncomment the body below
-- and run it as a separate, considered step. The friction is the point: this
-- is the only irreversible statement in the whole of Phase 1, and it must
-- never be reached by someone pasting a rollback file in a hurry at 2am.
--
-- DO $$
-- DECLARE rec RECORD; n int := 0;
-- BEGIN
--   FOR rec IN
--     SELECT c.relname AS tbl
--       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--      WHERE n.nspname='public' AND c.relkind='r'
--        AND public.is_tenant_scoped_table(c.relname)
--        AND EXISTS (SELECT 1 FROM information_schema.columns
--                     WHERE table_schema='public' AND table_name=c.relname
--                       AND column_name='organization_id')
--   LOOP
--     EXECUTE format('DROP INDEX IF EXISTS public.%I', 'idx_' || rec.tbl || '_org');
--     EXECUTE format('ALTER TABLE public.%I DROP COLUMN organization_id', rec.tbl);
--     n := n + 1;
--   END LOOP;
--   RAISE NOTICE 'Rollback 1B: DROPPED organization_id from % table(s).', n;
-- END $$;

UPDATE public.tenancy_readiness
   SET ready = false, updated_at = now()
 WHERE flag = 'organization_id_columns';

NOTIFY pgrst, 'reload schema';
