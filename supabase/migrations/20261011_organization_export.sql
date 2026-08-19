-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATION EXPORT — the read-only twin of the purge
--
-- ┌── WHY THIS EXISTS ─────────────────────────────────────────────────────┐
-- │ The pricing page tells every prospect "your data is yours to export    │
-- │ whenever you like", and until now nothing could produce it. Phase 11's │
-- │ Backups page reserved "per-organization export" and left it at that.   │
-- │                                                                        │
-- │ Two situations make it non-optional rather than a nicety:              │
-- │   • a customer leaving, who is owed their records before the tenant    │
-- │     is archived and eventually purged;                                 │
-- │   • a restore rehearsal, where the only way to prove a PITR restore    │
-- │     is CORRECT is to compare it against a known snapshot.              │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── IT SHARES THE PURGE'S DEFINITION OF "THE TENANT'S DATA" ─────────────┐
-- │ Same predicate, deliberately: every BASE TABLE in `public` carrying an │
-- │ organization_id column. Not a hand-written list.                       │
-- │                                                                        │
-- │ A curated list would drift the first time a table was added, and the   │
-- │ drift is asymmetric and silent — export would quietly omit a table     │
-- │ that purge still erases, so a customer's "complete" export would be    │
-- │ missing records that were then destroyed. Deriving both from the same  │
-- │ rule makes that impossible by construction.                            │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── READ-ONLY BY CONSTRUCTION ───────────────────────────────────────────┐
-- │ SECURITY DEFINER because it must see across RLS, and every statement   │
-- │ inside is a SELECT. The function is additionally declared STABLE,      │
-- │ which makes Postgres itself reject any write executed within it — so   │
-- │ "read-only" is enforced by the engine, not by review.                  │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHO MAY CALL IT ─────────────────────────────────────────────────────┐
-- │ Nobody, directly. EXECUTE is revoked from anon and authenticated and   │
-- │ granted only to service_role, so the sole path is the platform-admin   │
-- │ edge function — which checks the caller's platform capability and      │
-- │ writes the audit row. A SECURITY DEFINER function that dumps an entire │
-- │ tenant must not be reachable by anyone holding a tenant JWT, and the   │
-- │ cheapest way to guarantee that is to not grant it.                     │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Additive, idempotent, non-destructive: creates one function and grants on it.
-- Nothing is altered, nothing is dropped, no tenant row is touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Manifest: what an export WOULD contain, without moving any of it ───────
--
-- Separate from the export itself so the console can show an operator the size
-- of what they are about to download before they download it. A dry run that
-- streamed the data to decide how big it was would defeat its own purpose.
CREATE OR REPLACE FUNCTION public.platform_export_manifest(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _slug   text;
  _t      record;
  _n      bigint;
  _tables jsonb := '{}'::jsonb;
  _total  bigint := 0;
BEGIN
  SELECT slug INTO _slug FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'No such organization.' USING ERRCODE = 'P0002';
  END IF;

  FOR _t IN
    SELECT c.table_name::text AS tbl
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'organization_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name <> 'organizations'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', _t.tbl)
      INTO _n USING _org;
    -- Empty tables are omitted. A manifest of 200 zeroes buries the dozen
    -- lines that actually say what this tenant has.
    IF _n > 0 THEN
      _tables := _tables || jsonb_build_object(_t.tbl, _n);
      _total  := _total + _n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', _org,
    'slug',            _slug,
    'generated_at',    now(),
    'dry_run',         true,
    'total_rows',      _total,
    'tables',          _tables
  );
END $function$;

COMMENT ON FUNCTION public.platform_export_manifest(uuid) IS
  'Row counts per tenant table for one organization. Read-only; service_role only.';

-- ── The export itself ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_export_organization(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _slug   text;
  _t      record;
  _rows   jsonb;
  _n      bigint;
  _data   jsonb := '{}'::jsonb;
  _tables jsonb := '{}'::jsonb;
  _total  bigint := 0;
BEGIN
  SELECT slug INTO _slug FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'No such organization.' USING ERRCODE = 'P0002';
  END IF;

  -- The organization row itself, so the export identifies its own subject
  -- rather than being an anonymous pile of foreign keys.
  SELECT to_jsonb(o) INTO _rows FROM public.organizations o WHERE o.id = _org;
  _data := jsonb_build_object('organizations', jsonb_build_array(_rows));

  FOR _t IN
    SELECT c.table_name::text AS tbl
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'organization_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name <> 'organizations'
     ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) '
      'FROM public.%I x WHERE x.organization_id = $1', _t.tbl)
      INTO _rows, _n USING _org;

    IF _n > 0 THEN
      _data   := _data   || jsonb_build_object(_t.tbl, _rows);
      _tables := _tables || jsonb_build_object(_t.tbl, _n);
      _total  := _total + _n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', _org,
    'slug',            _slug,
    'generated_at',    now(),
    'dry_run',         false,
    'total_rows',      _total,
    'tables',          _tables,
    'data',            _data
  );
END $function$;

COMMENT ON FUNCTION public.platform_export_organization(uuid) IS
  'Every row belonging to one organization, as jsonb. Read-only; service_role only. '
  'Shares the purge''s table-discovery predicate so the two can never disagree.';

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- PUBLIC is revoked first: CREATE FUNCTION grants EXECUTE to PUBLIC by default,
-- and leaving that in place would make a whole-tenant dump callable by any
-- authenticated session — including a parent's.
REVOKE ALL ON FUNCTION public.platform_export_manifest(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_export_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_export_manifest(uuid)     FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_export_organization(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_export_manifest(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_export_organization(uuid) TO service_role;
