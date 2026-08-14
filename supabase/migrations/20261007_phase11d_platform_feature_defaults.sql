-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 11D — PLATFORM FEATURE DEFAULTS ("all existing AND upcoming")
--
-- ┌── THE GAP ──────────────────────────────────────────────────────────────┐
-- │ "Grant to all organizations" wrote one override row per tenant. That    │
-- │ covers the organizations that exist at the moment it runs, and nothing  │
-- │ else. The school that signs up tomorrow inherits none of it, and the    │
-- │ only way to notice is a customer asking why they do not have a module   │
-- │ every other customer has.                                              │
-- │                                                                         │
-- │ Bulk-writing overrides is also the wrong shape for a platform-wide      │
-- │ decision: 25 identical rows that each look like a deliberate,           │
-- │ per-customer exception six months later, and 25 more to undo.          │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- So a platform DEFAULT is recorded once, and the resolver reads it at the
-- layer that currently hardcodes `true`.
--
-- WHERE IT SITS — deliberately at the BOTTOM, layer 6:
--
--     audience → governance → status → essential → override → plan → DEFAULT
--
-- Below plan and override, so a per-organization decision still wins. That is
-- what makes "all existing and upcoming" coherent rather than destructive: a
-- customer with a negotiated exception keeps it, and everyone else — today and
-- in future — follows the platform.
--
-- NOT the same as `is_globally_available = false`, which is a hard WITHDRAWAL
-- that outranks everything. That column is unchanged and keeps its meaning.
--
-- Additive and idempotent: one nullable column, and NULL means "no platform
-- default", which is exactly today's behaviour. Nothing changes for any
-- existing organization until somebody sets one.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The column ──────────────────────────────────────────────────────────
ALTER TABLE public.platform_module_governance
  ADD COLUMN IF NOT EXISTS default_enabled boolean;

COMMENT ON COLUMN public.platform_module_governance.default_enabled IS
  'Platform default for this feature key, applied at the resolver''s LAST layer. '
  'NULL = no default (feature is included when nothing else says otherwise). '
  'Applies to organizations with no override and no plan rule, including ones '
  'created after it was set. Distinct from is_globally_available, which is a '
  'hard withdrawal outranking every other layer.';

-- The table was created as an exceptions list, so `module_key` is the key and
-- `is_globally_available` is NOT NULL DEFAULT true. A row that exists only to
-- carry a default must therefore leave availability alone — true.

-- ── 2. Surface it in the layers the resolver reads ─────────────────────────
-- Adding a key to the returned jsonb is additive: every existing consumer
-- ignores what it does not read.
CREATE OR REPLACE FUNCTION public.entitlement_layers(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan_id  uuid;
  _plan_code text;
  _status   text;
BEGIN
  SELECT o.status INTO _status FROM public.organizations o WHERE o.id = _org;
  IF _status IS NULL THEN RETURN NULL; END IF;

  SELECT s.plan_id INTO _plan_id
    FROM public.subscriptions s
   WHERE s.organization_id = _org
     AND s.status IN ('trialing','active','past_due','grace')
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF _plan_id IS NULL THEN
    SELECT os.plan_code INTO _plan_code
      FROM public.organization_subscriptions os
     WHERE os.organization_id = _org
     LIMIT 1;
    SELECT p.id INTO _plan_id FROM public.plans p WHERE p.code = _plan_code;
  ELSE
    SELECT p.code INTO _plan_code FROM public.plans p WHERE p.id = _plan_id;
  END IF;

  RETURN jsonb_build_object(
    'organization_id', _org,
    'status', _status,
    'plan_code', _plan_code,
    'plan_id', _plan_id,

    -- Global withdrawals. Exceptions only — an absent key means available.
    'governance', COALESCE((
      SELECT jsonb_object_agg(g.module_key, g.is_globally_available)
        FROM public.platform_module_governance g
       WHERE NOT g.is_globally_available), '{}'::jsonb),

    -- PHASE 11D: platform defaults. Read at the resolver's last layer, so a
    -- plan rule or a per-organization override still outranks them. An absent
    -- key means "no default", which the resolver reads as included.
    'defaults', COALESCE((
      SELECT jsonb_object_agg(g.module_key, g.default_enabled)
        FROM public.platform_module_governance g
       WHERE g.default_enabled IS NOT NULL), '{}'::jsonb),

    'plan', COALESCE((
      SELECT jsonb_object_agg(pf.feature_key,
               jsonb_build_object('enabled', pf.enabled, 'limit', pf.limit_value))
        FROM public.plan_features pf
       WHERE pf.plan_id = _plan_id), '{}'::jsonb),

    'overrides', COALESCE((
      SELECT jsonb_object_agg(f.feature_key, jsonb_build_object(
               'enabled', f.enabled, 'reason', f.reason,
               'expires_at', f.expires_at, 'updated_at', f.updated_at))
        FROM public.organization_features f
       WHERE f.organization_id = _org
         AND (f.expires_at IS NULL OR f.expires_at > now())), '{}'::jsonb),

    'generated_at', now()
  );
END $$;

-- ── 3. Set / clear a platform default ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_set_feature_default(
  _feature text, _enabled boolean, _note text, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _before boolean;
BEGIN
  SELECT default_enabled INTO _before
    FROM public.platform_module_governance WHERE module_key = _feature;

  IF _enabled IS NULL THEN
    -- Clearing the default. The row itself is kept ONLY when it still carries
    -- a withdrawal; otherwise it has nothing left to say and is removed, so
    -- the table stays what it claims to be — a list of exceptions.
    UPDATE public.platform_module_governance
       SET default_enabled = NULL, updated_by = _actor, updated_at = now()
     WHERE module_key = _feature;

    DELETE FROM public.platform_module_governance
     WHERE module_key = _feature
       AND default_enabled IS NULL
       AND is_globally_available;
  ELSE
    INSERT INTO public.platform_module_governance
      (module_key, is_globally_available, default_enabled, note, updated_by, updated_at)
    VALUES (_feature, true, _enabled, _note, _actor, now())
    ON CONFLICT (module_key) DO UPDATE SET
      default_enabled = EXCLUDED.default_enabled,
      note            = COALESCE(EXCLUDED.note, platform_module_governance.note),
      updated_by      = EXCLUDED.updated_by,
      updated_at      = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'feature', _feature, 'default_enabled', _enabled,
    'changed', _before IS DISTINCT FROM _enabled);
END $$;

REVOKE ALL ON FUNCTION public.platform_set_feature_default(text, boolean, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_feature_default(text, boolean, text, uuid) TO service_role;

-- ── 4. Clear per-organization overrides that contradict a new default ──────
--
-- "Apply to all organizations" means everyone FOLLOWS the platform, so the
-- overrides that disagree are REMOVED rather than rewritten. Removing returns
-- each organization to the default instead of pinning 25 rows that each look
-- like a deliberate per-customer exception a year later — and it leaves the
-- decision in one place, so undoing it is one edit rather than 25.
--
-- Protected organizations are never touched: reaching ARK requires opening ARK.
CREATE OR REPLACE FUNCTION public.platform_clear_conflicting_overrides(
  _feature text, _enabled boolean, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _cleared int := 0; _skipped int := 0; _row record;
BEGIN
  FOR _row IN
    SELECT f.organization_id, f.enabled
      FROM public.organization_features f
     WHERE f.feature_key = _feature
       AND f.enabled IS DISTINCT FROM _enabled
  LOOP
    IF public.is_protected_organization(_row.organization_id) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    DELETE FROM public.organization_features
     WHERE organization_id = _row.organization_id AND feature_key = _feature;

    INSERT INTO public.feature_flag_assignments
      (organization_id, feature_key, enabled, reason, note, assigned_by, source)
    VALUES (_row.organization_id, _feature, _row.enabled, 'plan',
            format('Override removed — follows the platform default (%s).', _enabled),
            _actor, 'manual');

    _cleared := _cleared + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cleared', _cleared, 'protected_skipped', _skipped);
END $$;

REVOKE ALL ON FUNCTION public.platform_clear_conflicting_overrides(text, boolean, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_clear_conflicting_overrides(text, boolean, uuid) TO service_role;

-- ── 5. Proof ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='platform_module_governance'
       AND column_name='default_enabled')
  THEN
    RAISE EXCEPTION '11D failed: default_enabled column was not added.';
  END IF;

  IF (public.entitlement_layers(
        (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
      ) -> 'defaults') IS NULL
  THEN
    RAISE EXCEPTION
      '11D failed: entitlement_layers() does not return a defaults key, so the '
      'resolver would never see a platform default.';
  END IF;

  RAISE NOTICE '11D: platform feature defaults ready. NULL default = today''s behaviour.';
END $$;
