-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — Phase 9B entitlement history de-duplication
--
-- Restores the Phase 2C trigger body and the Phase 9A RPC body, both without
-- the transaction-local suppression flag. The consequence of rolling back is
-- the return of the duplicate anonymous history row, so this is a correctness
-- regression, not a cleanup — run it only to get back to a known prior state.
--
-- No data is deleted. The history rows already written stay exactly as they
-- are: rewriting an audit log to match a code change is never the fix.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.feature_flag_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.feature_flag_assignments
    (organization_id, feature_key, enabled, reason, assigned_by)
  VALUES (NEW.organization_id, NEW.feature_key, NEW.enabled, NEW.reason,
          public.current_platform_user_id());
  RETURN NEW;
END $$;

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

  RETURN jsonb_build_object('ok', true, 'organization', _slug, 'module', _module,
                            'enabled', _enabled, 'changed', _before IS DISTINCT FROM _enabled);
END $$;

REVOKE ALL ON FUNCTION public.platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid)
  TO service_role;
