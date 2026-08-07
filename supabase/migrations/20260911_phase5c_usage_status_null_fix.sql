-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5C — usage_status() RETURNED NULL USAGE AND CRASHED THE SETTINGS SCREEN
--
-- Symptom, reported from production:
--   "Cannot read properties of null (reading 'toLocaleString')"
--   — the error boundary replaced the whole Settings module.
--
-- Cause, in usage_status():
--
--     used := 0;                                    -- looks like a safe default
--     ...
--     ELSE SELECT COALESCE(u.used, 0) INTO used
--            FROM public.usage_counters u WHERE ...;
--
-- `SELECT ... INTO` in PL/pgSQL assigns NULL when the query returns ZERO ROWS.
-- It does not leave the variable alone. So the `used := 0` default is
-- overwritten, and COALESCE(u.used, 0) never runs — it guards a NULL COLUMN in
-- a row that was found, not the absence of a row.
--
-- `usage_counters` is empty (0 rows), so this fired for storage_mb, whatsapp
-- and email on EVERY organization. The RPC emitted {"used": null}, and the
-- Billing & Subscription tab called .toLocaleString() on it.
--
-- Two independent fixes, because either alone leaves a gap:
--   • here — the function stops emitting null
--   • BillingPage — stops assuming non-null, so a future null degrades to a
--     dash instead of white-screening the module
--
-- Additive: replaces one function body. No schema change, no policy change,
-- no data touched. The access check and every other branch are byte-identical.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.usage_status(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid := COALESCE(_org, public.current_org_id()); result jsonb; m text; used numeric; lim int;
BEGIN
  IF target IS NULL THEN RETURN NULL; END IF;
  IF target IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('usage.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  result := '{}'::jsonb;
  FOREACH m IN ARRAY ARRAY['students','staff','branches','storage_mb','whatsapp','email'] LOOP
    used := 0;
    BEGIN
      CASE m
        WHEN 'students' THEN SELECT count(*) INTO used FROM public.students
                              WHERE organization_id = target AND is_active;
        WHEN 'staff'    THEN SELECT count(*) INTO used FROM public.profiles
                              WHERE organization_id = target AND is_active;
        WHEN 'branches' THEN SELECT count(*) INTO used FROM public.campuses
                              WHERE organization_id = target;
        ELSE SELECT COALESCE(u.used, 0) INTO used FROM public.usage_counters u
              WHERE u.organization_id = target AND u.metric = m
                AND u.period = CASE WHEN m IN ('whatsapp','email','ai','api')
                                    THEN to_char(CURRENT_DATE, 'YYYY-MM') ELSE 'current' END;
      END CASE;
    EXCEPTION WHEN others THEN used := 0;
    END;

    -- THE FIX. A zero-row SELECT INTO above has just set `used` to NULL,
    -- silently discarding the default. Re-assert it after the CASE so every
    -- branch — including one added later — is covered by construction rather
    -- than by each branch remembering.
    used := COALESCE(used, 0);

    lim := public.plan_limit(target, m);
    result := result || jsonb_build_object(m, jsonb_build_object(
      'used', used, 'limit', lim,
      'percent', CASE WHEN lim IS NULL OR lim = 0 THEN NULL
                      ELSE round(used * 100.0 / lim, 1) END,
      'over', lim IS NOT NULL AND used > lim,
      -- Warn at 80%: enough runway to upgrade calmly, not so early it is noise.
      'warn', lim IS NOT NULL AND used >= lim * 0.8));
  END LOOP;

  RETURN result;
END $$;

COMMENT ON FUNCTION public.usage_status(uuid) IS
  'Per-metric usage against plan limits. `used` is COALESCEd after the CASE '
  'because SELECT ... INTO assigns NULL on zero rows, which overwrote the '
  'default and shipped {"used": null} to the Billing tab — crashing it.';


-- ── Verification ────────────────────────────────────────────────────────────
--
-- Deliberately does NOT call usage_status(): it raises 'Access denied' unless
-- the caller has an organization claim or usage.read, and a migration session
-- has neither. So the check has two parts that together prove the fix without
-- needing a tenant identity:
--
--   1. the guard is present in the installed function body
--   2. the underlying PL/pgSQL behaviour still needs guarding — i.e. a zero-row
--      SELECT INTO really does null the variable, so the guard is load-bearing
--      rather than decorative
DO $$
DECLARE src text; probe numeric;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'usage_status';

  IF src IS NULL OR position('used := COALESCE(used, 0)' in src) = 0 THEN
    RAISE EXCEPTION 'usage_status is missing the null guard';
  END IF;

  probe := 0;
  SELECT 1 INTO probe WHERE false;
  IF probe IS NOT NULL THEN
    RAISE EXCEPTION 'zero-row SELECT INTO no longer nulls the target — re-check the guard';
  END IF;

  RAISE NOTICE 'Phase 5C — usage_status null guard installed and load-bearing';
END $$;

NOTIFY pgrst, 'reload schema';
