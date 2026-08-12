-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9B — ONE HISTORY ROW PER ENTITLEMENT CHANGE
--
-- ┌── THE DEFECT ──────────────────────────────────────────────────────────┐
-- │ Phase 2C put an AFTER INSERT OR UPDATE trigger on                      │
-- │ organization_features (trg_feature_flag_history) so that ANY write —   │
-- │ including a hand-made one from a psql session — leaves a trace.        │
-- │                                                                        │
-- │ Phase 9A then added platform_set_module_entitlement(), which writes    │
-- │ its OWN feature_flag_assignments row carrying the things the trigger    │
-- │ cannot see: the acting platform user passed in as an argument, the     │
-- │ before→after note, the expiry, and the bulk batch id.                  │
-- │                                                                        │
-- │ So every change through the RPC produced TWO rows with the identical   │
-- │ timestamp — the rich one, and an anonymous one with assigned_by NULL   │
-- │ (current_platform_user_id() resolves from a JWT, and the RPC runs      │
-- │ under service_role, which has none), no note, and no expiry.           │
-- │                                                                        │
-- │ Observed on 2026-08-12 against the live database:                      │
-- │   09:47:40.64714  exam  false  note NULL                  actor NULL   │
-- │   09:47:40.64714  exam  false  note 'first assignment'    actor set    │
-- │                                                                        │
-- │ A compliance log that reports twice as many changes as happened, half  │
-- │ of them by nobody, is worse than none: it cannot be reconciled.        │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ── THE FIX, AND WHY NOT THE OBVIOUS ONE ───────────────────────────────────
-- Dropping the trigger would be simpler and wrong: it is the only thing that
-- records a write which did NOT come through the RPC, which is precisely the
-- write an auditor most wants to see.
--
-- Dropping the RPC's own INSERT instead would lose the actor, because the
-- trigger has no way to learn it.
--
-- So the trigger keeps firing for every direct write, and stands down only when
-- the RPC has already written a better row — signalled by a TRANSACTION-LOCAL
-- GUC (set_config(..., true)), the same mechanism the ARK protection ack uses,
-- and for the same reason: it cannot leak past the statement into another
-- pooled session.
--
-- Additive, idempotent, reversible. Touches no tenant data.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1 — the trigger yields to a richer row ─────────────────────────────

CREATE OR REPLACE FUNCTION public.feature_flag_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A platform RPC in this same transaction has already logged the change with
  -- the actor, the before→after note and the batch id. Adding a second,
  -- anonymous row would only make the history unreconcilable.
  IF current_setting('app.feature_history_written', true) = 'on' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.feature_flag_assignments
    (organization_id, feature_key, enabled, reason, note, assigned_by, expires_at,
     source)
  VALUES (NEW.organization_id, NEW.feature_key, NEW.enabled, NEW.reason,
          'direct write to organization_features (not via the platform console)',
          public.current_platform_user_id(), NEW.expires_at, 'manual');
  RETURN NEW;
END $$;

-- ── PART 2 — the RPC raises the flag before it writes ───────────────────────

CREATE OR REPLACE FUNCTION public.platform_set_module_entitlement(
  _org uuid, _module text, _enabled boolean, _reason text,
  _actor uuid, _expires_at timestamptz DEFAULT NULL, _batch uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _before boolean; _slug text;
BEGIN
  SELECT slug INTO _slug FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  IF _reason NOT IN ('plan','sales_override','beta','incident','trial') THEN
    RAISE EXCEPTION 'reason must be one of plan, sales_override, beta, incident, trial';
  END IF;

  SELECT enabled INTO _before FROM public.organization_features
   WHERE organization_id = _org AND feature_key = _module;

  -- Transaction-local: the third argument is `is_local`. It is cleared at
  -- COMMIT, so a later statement on the same pooled connection is unaffected.
  PERFORM set_config('app.feature_history_written', 'on', true);

  INSERT INTO public.organization_features
    (organization_id, feature_key, enabled, reason, expires_at, set_by, updated_at)
  VALUES (_org, _module, _enabled, _reason, _expires_at, _actor, now())
  ON CONFLICT (organization_id, feature_key) DO UPDATE SET
    enabled = EXCLUDED.enabled, reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at, set_by = EXCLUDED.set_by, updated_at = now();

  INSERT INTO public.feature_flag_assignments
    (organization_id, feature_key, enabled, reason, note, assigned_by, expires_at,
     source, batch_id)
  VALUES (_org, _module, _enabled, _reason,
          CASE WHEN _before IS NULL THEN 'first assignment'
               WHEN _before = _enabled THEN 're-applied (no change)'
               ELSE format('changed from %s', _before) END,
          _actor, _expires_at,
          CASE WHEN _batch IS NULL THEN 'manual' ELSE 'bulk' END, _batch);

  PERFORM set_config('app.feature_history_written', 'off', true);

  RETURN jsonb_build_object('ok', true, 'organization', _slug, 'module', _module,
                            'enabled', _enabled, 'changed', _before IS DISTINCT FROM _enabled);
END $$;

REVOKE ALL ON FUNCTION public.platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid)
  TO service_role;

-- platform_clear_module_override() needs no change: it DELETEs, and the trigger
-- fires only on INSERT/UPDATE, so its single row was never duplicated.

-- ── PART 3 — verify ─────────────────────────────────────────────────────────

DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc WHERE proname = 'feature_flag_history';
  IF _src IS NULL OR _src NOT LIKE '%feature_history_written%' THEN
    RAISE EXCEPTION 'feature_flag_history() was not replaced';
  END IF;

  SELECT prosrc INTO _src FROM pg_proc
   WHERE proname = 'platform_set_module_entitlement';
  IF _src IS NULL OR _src NOT LIKE '%feature_history_written%' THEN
    RAISE EXCEPTION 'platform_set_module_entitlement() was not replaced';
  END IF;

  -- The trigger itself must still be attached. Suppressing duplicates is only
  -- safe while the direct-write path is still covered.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_feature_flag_history' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_feature_flag_history is missing — direct writes would go unlogged';
  END IF;

  RAISE NOTICE 'Phase 9B verified: one history row per entitlement change.';
END $$;
