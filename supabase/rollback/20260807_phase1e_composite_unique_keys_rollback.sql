-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 1E (COMPOSITE UNIQUE KEYS)                      2026-08-07
--
-- Restores each converted constraint to its original, organization-agnostic
-- column list and clears the composite_unique_keys readiness flag, which
-- re-arms the second-organization guard.
--
-- ⚠ REVERT THE FRONTEND IN THE SAME DEPLOY.
--   The Phase 1E build sends `onConflict: "organization_id,scope,month"` and
--   friends. Postgres matches ON CONFLICT against an index by exact column
--   SET, so running the 1E frontend against rolled-back constraints fails
--   EVERY affected upsert at runtime: attendance locks, attendance closings,
--   attendance settings, comms automation, payroll rates, RBAC grants,
--   dashboard layouts, SMS automations and alert dedup all stop writing.
--   These two must move together, in both directions.
--
-- ⚠ REFUSES to run if a second organization exists — by then the composite
--   keys are the only thing preventing tenants from overwriting each other's
--   settings, roles and campuses.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 0 — preconditions ──────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.organizations WHERE deleted_at IS NULL;
  IF n > 1 THEN
    RAISE EXCEPTION
      'Refusing to roll back composite unique keys: % organizations exist. '
      'Reverting would let tenants collide on settings, roles and campus names.', n;
  END IF;
END $$;


-- ── PART 1 — restore the original constraints ───────────────────────────────
-- Same data-driven shape as the forward migration; `orig_name` is the exact
-- identifier the original module migration used, so the restored constraint is
-- indistinguishable from the pre-1E state.
DO $$
DECLARE
  t        RECORD;
  rel      oid;
  n_done   int := 0;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('settings_sms_automations',  ARRAY['automation_key'],                     false, 'settings_sms_automations_automation_key_key'),
      ('attendance_alerts',         ARRAY['dedupe_key'],                         false, 'attendance_alerts_dedupe_key_key'),
      ('comms_automation_settings', ARRAY['event_key'],                          false, 'comms_automation_settings_event_key_key'),
      ('payroll_role_rates',        ARRAY['role'],                               false, 'payroll_role_rates_role_key'),
      ('rbac_role_actions',         ARRAY['role','action_id'],                   false, 'rbac_role_actions_unique'),
      ('rbac_role_permissions',     ARRAY['role','module_id','submodule_id'],    false, 'rbac_role_permissions_unique'),
      ('dashboard_layouts',         ARRAY['scope'],                              false, 'dashboard_layouts_scope_key'),
      ('attendance_closings',       ARRAY['scope','month'],                      false, 'attendance_closings_scope_month_key'),
      ('attendance_locks',          ARRAY['scope','period_type','period_key'],   false, 'attendance_locks_scope_period_type_period_key_key'),
      ('attendance_settings',       ARRAY['singleton'],                          false, 'attendance_settings_singleton_key'),
      ('campuses',                  ARRAY['name'],                               false, 'campuses_name_key'),
      ('system_settings',           ARRAY['key'],                                false, 'system_settings_key_key'),
      ('rbac_roles',                ARRAY['slug'],                               false, 'rbac_roles_slug_key'),
      ('comms_templates',           ARRAY['template_key','version','language'],  false, 'comms_templates_template_key_version_language_key'),
      ('daily_report_log',          ARRAY['date'],                               false, 'daily_report_log_date_key'),
      ('settings_whatsapp_config',  ARRAY['singleton'],                          true,  'settings_whatsapp_singleton')
    ) AS v(tbl, cols, is_index, orig_name)
  LOOP
    rel := to_regclass(format('public.%I', t.tbl));
    IF rel IS NULL THEN CONTINUE; END IF;

    BEGIN
      IF t.is_index THEN
        EXECUTE format('DROP INDEX IF EXISTS public.%I', t.tbl || '_org_uq');
        EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%s)',
                       t.orig_name, t.tbl,
                       (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.cols) c));
      ELSE
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                       t.tbl, t.tbl || '_org_uq');
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = rel AND conname = t.orig_name) THEN
          EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)',
                         t.tbl, t.orig_name,
                         (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.cols) c));
        END IF;
      END IF;
      n_done := n_done + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Rollback 1E: could not restore %(%): %',
        t.tbl, array_to_string(t.cols, ','), SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Rollback 1E: restored % constraint(s).', n_done;
END $$;


-- ── PART 2 — re-arm the second-organization guard ───────────────────────────
UPDATE public.tenancy_readiness
   SET ready = false,
       note  = 'Rolled back by 20260807_phase1e..._rollback — composite unique keys reverted.',
       updated_at = now()
 WHERE flag IN ('composite_unique_keys', 'storage_org_partitioned');

DROP FUNCTION IF EXISTS public.mark_storage_partitioned(text);
DROP FUNCTION IF EXISTS public.unsafe_unique_constraints();

NOTIFY pgrst, 'reload schema';
