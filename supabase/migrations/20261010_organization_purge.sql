-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATION PURGE — making "delete" mean delete
--
-- ┌── WHAT EXISTED ────────────────────────────────────────────────────────┐
-- │ Phase 9A shipped an honest placeholder: `organization_delete_requests` │
-- │ with a typed-slug confirmation, a 7-day cooling-off and approval by    │
-- │ someone other than the requester — and approval deleted NOTHING.       │
-- │ Archive was the terminal state. The header on that migration says so   │
-- │ outright: erasure across 200+ tenant tables "is not a capability this  │
-- │ platform has".                                                         │
-- │                                                                        │
-- │ This migration gives it that capability, and keeps every existing      │
-- │ safeguard in front of it.                                              │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHY A FIXPOINT LOOP AND NOT `DELETE FROM organizations` ─────────────┐
-- │ Measured on the live database: 211 foreign keys reference              │
-- │ organizations — 30 CASCADE, 7 SET NULL and **174 RESTRICT**. A plain   │
-- │ delete fails on the first of those 174 and tells you nothing useful.   │
-- │                                                                        │
-- │ Turning them all into CASCADE was the other option and is rejected:    │
-- │ RESTRICT is what stops an accidental one-line delete taking a live     │
-- │ tenant's fees and payroll with it. The safety belongs in the schema;   │
-- │ the deliberate path goes around it.                                    │
-- │                                                                        │
-- │ So this walks the 209 tables carrying organization_id, deleting what   │
-- │ it can each pass and retrying what a child row still blocks, until a   │
-- │ pass empties nothing more. Dependency order is DISCOVERED rather than  │
-- │ hardcoded, so a table added next month is covered by construction.     │
-- │                                                                        │
-- │ If tables remain when progress stops it RAISES, rolling the whole      │
-- │ thing back and naming them. A half-purged tenant — no students but     │
-- │ still billed, or fees pointing at deleted people — is far worse than   │
-- │ a refusal.                                                             │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- WHAT SURVIVES, DELIBERATELY:
--   platform_audit_log   its organization_id FK is ON DELETE SET NULL, so the
--                        record that this tenant existed and was erased
--                        outlives the tenant. A deletion with no evidence it
--                        happened is not an auditable platform.
--
-- WHAT THIS FUNCTION DOES NOT TOUCH — the caller's job, in this order:
--   storage objects      files live in S3, not Postgres; deleting the rows
--                        would orphan the bytes. platform-admin removes them
--                        through the storage API after this returns.
--   auth.users           service-role admin API only.
--
-- ARK is refused before anything else happens, by the same
-- is_protected_organization() the trigger uses.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — release the audit log's foreign key
--
-- ┌── WHY AN ORGANIZATION COULD NEVER BE DELETED, EVEN WITH THE FKs FIXED ──┐
-- │ platform_audit_log carries `organization_id REFERENCES organizations    │
-- │ ON DELETE SET NULL`, and it also carries trg_platform_audit_immutable,  │
-- │ which raises on EVERY update and every delete:                          │
-- │                                                                         │
-- │   platform_audit_log is append-only (attempted UPDATE)                  │
-- │                                                                         │
-- │ The cascade's SET NULL *is* an UPDATE. So deleting an organization that │
-- │ had ever been audited — which is all of them, since provisioning        │
-- │ writes an audit row — aborted on the audit table. Found by running the  │
-- │ purge, not by reading the schema: the two mechanisms are correct        │
-- │ individually and only conflict at the moment of deletion.               │
-- │                                                                         │
-- │ The fix is to DROP the foreign key rather than weaken the immutability  │
-- │ trigger. An audit log must outlive the thing it describes, so a         │
-- │ referential constraint tying it to a live row is the wrong shape: with  │
-- │ the FK gone the column KEEPS the organization id after the tenant is    │
-- │ erased, which is more evidence, not less. Nothing needs to write to     │
-- │ platform_audit_log during a delete any more, so append-only stays       │
-- │ absolute.                                                               │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The other six SET NULL references (billing_events, organization_audit,
-- platform_trial_signups, …) have no immutability trigger and are left alone —
-- they null out on delete as designed.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.platform_audit_log
  DROP CONSTRAINT IF EXISTS platform_audit_log_organization_id_fkey;

COMMENT ON COLUMN public.platform_audit_log.organization_id IS
  'The tenant an action affected. Deliberately NOT a foreign key: this log '
  'outlives the organizations it references, and keeping the id after a purge '
  'is the point. Enforcing referential integrity here would instead require '
  'nulling the column during a delete, which the append-only trigger forbids.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — the purge itself
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_purge_organization(
  _org      uuid,
  _request  uuid,
  _dry_run  boolean DEFAULT true,
  _actor    uuid    DEFAULT NULL,
  _actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _slug     text;
  _status   text;
  _req      public.organization_delete_requests%ROWTYPE;
  _t        record;
  _n        bigint;
  _pass     int := 0;
  _progress boolean;
  _report   jsonb := '{}'::jsonb;
  _total    bigint := 0;
  _blocked  text;
  -- Rows that must OUTLIVE the tenant. Everything else goes.
  _retain   text[] := ARRAY['platform_audit_log'];
BEGIN
  SELECT slug, status INTO _slug, _status
    FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'No such organization.' USING ERRCODE = 'P0002';
  END IF;

  -- 1. Protection. First, and by the same predicate the trigger enforces, so
  --    the two can never disagree about what is protected.
  IF public.is_protected_organization(_org) THEN
    RAISE EXCEPTION
      'Organization "%" is protected and can never be purged.', _slug
      USING ERRCODE = '42501';
  END IF;

  -- 2. An approved request for THIS organization. Passing another tenant's
  --    request id must not authorise anything.
  SELECT * INTO _req FROM public.organization_delete_requests
   WHERE id = _request AND organization_id = _org;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'That delete request does not belong to "%".', _slug
      USING ERRCODE = '42501';
  END IF;
  IF _req.status <> 'approved' THEN
    RAISE EXCEPTION 'The delete request for "%" is "%", not approved.', _slug, _req.status
      USING ERRCODE = '42501';
  END IF;

  -- 3. Erase only what is already switched off. Purging a live tenant would
  --    pull the database out from under users mid-session; archiving first is
  --    the step that ends their access, and it is reversible right up to here.
  IF _status NOT IN ('archived', 'cancelled') THEN
    RAISE EXCEPTION
      'Archive "%" before purging it — it is currently "%". Archiving closes access and is reversible; this is not.',
      _slug, _status USING ERRCODE = '42501';
  END IF;

  -- 4. Target set: every BASE TABLE carrying organization_id. Views are
  --    excluded by table_type — format('DELETE FROM %I') on one would fail
  --    halfway through a purge.
  -- Dropped explicitly, not left to ON COMMIT: the intended flow is a dry run
  -- and then the purge, and a caller that does both inside ONE transaction
  -- would otherwise hit "relation _purge_targets already exists" on the second
  -- call — the first table is still alive because the transaction has not
  -- committed. Found by running the two calls back to back.
  DROP TABLE IF EXISTS _purge_targets;
  CREATE TEMP TABLE _purge_targets(tbl text PRIMARY KEY, done boolean NOT NULL DEFAULT false)
    ON COMMIT DROP;

  INSERT INTO _purge_targets(tbl)
  SELECT c.table_name::text
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND c.column_name = 'organization_id'
     AND t.table_type = 'BASE TABLE'
     AND c.table_name <> 'organizations'
     AND NOT (c.table_name = ANY (_retain));

  -- ── Dry run ──────────────────────────────────────────────────────────────
  -- Counts only. Anyone about to erase a customer should see the size of what
  -- they are erasing, from the same query that will do it.
  IF _dry_run THEN
    FOR _t IN SELECT tbl FROM _purge_targets LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', _t.tbl)
        INTO _n USING _org;
      IF _n > 0 THEN
        _report := _report || jsonb_build_object(_t.tbl, _n);
        _total := _total + _n;
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'dry_run', true, 'organization', _slug, 'status', _status,
      'total_rows', _total, 'tables', _report);
  END IF;

  -- ── Purge ────────────────────────────────────────────────────────────────
  LOOP
    _pass := _pass + 1;
    _progress := false;

    FOR _t IN SELECT tbl FROM _purge_targets WHERE NOT done LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', _t.tbl) USING _org;
        GET DIAGNOSTICS _n = ROW_COUNT;

        IF _n > 0 THEN
          _progress := true;
          _report := _report || jsonb_build_object(
            _t.tbl, COALESCE((_report ->> _t.tbl)::bigint, 0) + _n);
          _total := _total + _n;
        END IF;

        UPDATE _purge_targets SET done = true WHERE tbl = _t.tbl;
      EXCEPTION WHEN foreign_key_violation THEN
        -- A child row elsewhere still points here. The block is a
        -- subtransaction, so only this statement rolls back; the table stays
        -- un-done and is retried on the next pass, by which time its children
        -- may be gone.
        NULL;
      END;
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM _purge_targets WHERE NOT done);

    IF NOT _progress THEN
      SELECT string_agg(tbl, ', ' ORDER BY tbl) INTO _blocked
        FROM _purge_targets WHERE NOT done;
      RAISE EXCEPTION
        'Purge stopped after % passes: % could not be emptied. Nothing was deleted. '
        'These tables are referenced by rows the sweep does not reach — most likely a '
        'table with no organization_id column of its own.', _pass, _blocked
        USING ERRCODE = '23503';
    END IF;

    -- Belt and braces. 209 tables cannot need 50 passes unless something is
    -- looping, and an unbounded LOOP inside a transaction holding locks on
    -- every tenant table is not a thing to leave to chance.
    IF _pass > 50 THEN
      RAISE EXCEPTION 'Purge exceeded 50 passes — aborting with nothing deleted.'
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  -- The organization row last: this fires guard_protected_organization (which
  -- has already passed step 1) and cascades the 30 CASCADE foreign keys.
  DELETE FROM public.organizations WHERE id = _org;

  -- Prove it. Every target table is re-counted AFTER the delete, and anything
  -- left standing rolls the whole transaction back.
  --
  -- Not paranoia: the sweep reports only the rows IT deleted, and some rows
  -- disappear underneath it via CASCADE from a parent it removed earlier —
  -- the first live run counted 123 rows in the dry run and deleted 118. That
  -- gap is expected and harmless, but it means the row count cannot be used
  -- as evidence of completeness. This can.
  FOR _t IN SELECT tbl FROM _purge_targets LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', _t.tbl)
      INTO _n USING _org;
    IF _n > 0 THEN
      RAISE EXCEPTION
        'Purge incomplete: % still holds % row(s) for this organization. Nothing was deleted.',
        _t.tbl, _n USING ERRCODE = '23503';
    END IF;
  END LOOP;

  -- organization_delete_requests is ON DELETE CASCADE, so the request row has
  -- just disappeared along with the tenant. This is the record that remains.
  INSERT INTO public.platform_audit_log(
    platform_user_id, actor_email, action, target_type, target_id,
    organization_id, detail, payload)
  VALUES (
    _actor, _actor_email, 'organization.purged', 'organization', _org::text,
    NULL,
    format('%s purged — %s rows across %s tables', _slug, _total,
           (SELECT count(*) FROM jsonb_object_keys(_report))),
    jsonb_build_object(
      'slug', _slug, 'organization_id', _org, 'request_id', _request,
      'requested_by', _req.requested_by, 'requested_email', _req.requested_email,
      'reason', _req.reason, 'reviewed_by', _req.reviewed_by,
      'total_rows', _total, 'passes', _pass, 'tables', _report));

  -- `rows_deleted` counts what the sweep removed directly. A dry run taken
  -- beforehand will usually report MORE, because some of those rows go by
  -- cascade from a parent this loop deleted first. Completeness is the check
  -- above, not this number.
  RETURN jsonb_build_object(
    'dry_run', false, 'organization', _slug, 'purged', true,
    'verified_empty', true,
    'rows_deleted', _total, 'total_rows', _total,
    'passes', _pass, 'tables', _report);
END $$;

COMMENT ON FUNCTION public.platform_purge_organization(uuid, uuid, boolean, uuid, text) IS
  'Irreversibly erases a tenant. Requires an APPROVED delete request for that '
  'organization and an archived/cancelled status, and refuses protected '
  'organizations outright. Pass _dry_run => true for per-table counts. Storage '
  'objects and auth users are the caller''s responsibility.';

-- Service role only: the only caller is the platform-admin edge function,
-- which checks the organizations.purge capability first. No client role has
-- any business invoking this, and Supabase grants EXECUTE on new public
-- functions to anon + authenticated by default, so REVOKE is the operative
-- statement here — the GRANT would be a no-op on its own.
REVOKE ALL ON FUNCTION public.platform_purge_organization(uuid, uuid, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ── Capability ─────────────────────────────────────────────────────────────
-- OWNER ONLY, and not granted to admin. Admin can already open a delete
-- request and archive; the irreversible step is deliberately a different
-- person's decision. Support keeps review_delete (it approves), which means no
-- single platform account can request, approve AND execute an erasure.
INSERT INTO public.platform_role_capabilities (role, capability)
VALUES ('owner', 'organizations.purge')
ON CONFLICT DO NOTHING;

-- ── Verification ───────────────────────────────────────────────────────────

DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'platform_purge_organization'
  ) THEN
    RAISE EXCEPTION 'organization_purge: function not created';
  END IF;

  -- It bypasses RLS; it must not be reachable from a browser.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'platform_purge_organization'
       AND array_to_string(COALESCE(p.proacl, '{}'), ',') ~ '(^|,)(anon|authenticated)?=[a-zA-Z]*X'
  ) THEN
    RAISE EXCEPTION 'organization_purge: the purge function is callable from a client role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'platform_purge_organization'
       AND p.prosecdef
       AND COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION 'organization_purge: SECURITY DEFINER without a pinned search_path';
  END IF;

  -- Only owner may execute an erasure.
  SELECT count(*) INTO _n FROM public.platform_role_capabilities
   WHERE capability = 'organizations.purge';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'organization_purge: expected exactly one role with organizations.purge, found %', _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_role_capabilities
                  WHERE capability = 'organizations.purge' AND role = 'owner') THEN
    RAISE EXCEPTION 'organization_purge: organizations.purge is not held by owner';
  END IF;

  -- The protection that makes ARK unpurgeable must still be in place.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'organizations' AND NOT t.tgisinternal
       AND t.tgname LIKE '%protect%'
  ) THEN
    RAISE EXCEPTION 'organization_purge: the protected-organization trigger is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organization_protections) THEN
    RAISE EXCEPTION 'organization_purge: organization_protections is empty — nothing is protected';
  END IF;

  -- The audit log must be detached, or a purge aborts on it every time.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_class rf ON rf.oid = c.confrelid
    WHERE c.contype = 'f' AND cl.relname = 'platform_audit_log'
      AND rf.relname = 'organizations'
  ) THEN
    RAISE EXCEPTION 'organization_purge: platform_audit_log still references organizations';
  END IF;

  -- …and it must still be append-only. Dropping the FK was NOT licence to
  -- start editing audit rows.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'platform_audit_log' AND NOT t.tgisinternal
       AND t.tgname = 'trg_platform_audit_immutable'
  ) THEN
    RAISE EXCEPTION 'organization_purge: the append-only trigger on platform_audit_log is gone';
  END IF;
END $$;
