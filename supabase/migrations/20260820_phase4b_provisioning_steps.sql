-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4B — PROVISIONING STEP HANDLERS + WHITE LABEL          2026-08-20
--
-- ADDITIVE. IDEMPOTENT. Paired rollback: ..._rollback.sql
-- Requires 4A.
--
-- ┌── EVERY HANDLER MUST BE IDEMPOTENT ────────────────────────────────────┐
-- │ Retry re-runs a failed step, and a step can fail AFTER doing half its  │
-- │ work — a network blip between two INSERTs is enough. So each handler   │
-- │ uses ON CONFLICT DO NOTHING or an EXISTS guard, never a bare INSERT.   │
-- │                                                                        │
-- │ Each also wraps optional work in its own BEGIN/EXCEPTION: several      │
-- │ tenant tables differ between environments (some migrations are known   │
-- │ unapplied), and one missing column must degrade ONE seeded default,    │
-- │ not fail the step and block the twenty after it.                       │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Handlers are SECURITY DEFINER and take the organization explicitly. They
-- NEVER read current_org_id(): the worker runs with no tenant context, and a
-- handler that fell back to the session's organization would provision into
-- the wrong tenant — the single worst bug this file could contain.
-- ════════════════════════════════════════════════════════════════════════════


-- ── branch ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_branch(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE campus uuid; created boolean := false;
BEGIN
  SELECT id INTO campus FROM public.campuses
   WHERE organization_id = _org ORDER BY created_at LIMIT 1;

  IF campus IS NULL THEN
    INSERT INTO public.campuses (name, organization_id) VALUES ('Main Branch', _org)
    RETURNING id INTO campus;
    created := true;
  END IF;

  INSERT INTO public.organization_branches (organization_id, campus_id, name, is_primary)
  SELECT _org, campus, 'Main Branch', true
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_branches
                      WHERE organization_id = _org AND campus_id = campus);

  RETURN jsonb_build_object('campus_id', campus, 'created', created);
END $$;

-- ── academic_year ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_academic_year(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text; country text;
BEGIN
  SELECT o.country INTO country FROM public.organizations o WHERE o.id = _org;
  label := public.default_academic_year(COALESCE(country, 'IN'));

  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE organization_id = _org) THEN
    INSERT INTO public.academic_years (year_label, is_active, organization_id)
    VALUES (label, true, _org);
  END IF;
  RETURN jsonb_build_object('year', label);
END $$;

-- ── departments ─────────────────────────────────────────────────────────────
-- There is no `departments` table in the schema; departments are expressed as
-- course types. Seeding a new table for a concept the ERP already models
-- differently would create two sources of truth for the same thing.
CREATE OR REPLACE FUNCTION public.provision_step_departments(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; d text;
BEGIN
  FOREACH d IN ARRAY ARRAY['Regular', 'Crash Course', 'Foundation', 'Repeater'] LOOP
    BEGIN
      INSERT INTO public.course_types (name, organization_id)
      SELECT d, _org
       WHERE NOT EXISTS (SELECT 1 FROM public.course_types
                          WHERE organization_id = _org AND name = d);
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('course_types', n);
END $$;

-- ── sections ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_sections(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; s RECORD;
BEGIN
  FOR s IN SELECT id FROM public.standards WHERE organization_id = _org LOOP
    BEGIN
      INSERT INTO public.sections (standard_id, name, organization_id)
      SELECT s.id, 'A', _org
       WHERE NOT EXISTS (SELECT 1 FROM public.sections
                          WHERE standard_id = s.id AND name = 'A');
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('sections', n);
END $$;

-- ── roles ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_roles(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('management','Management',0), ('admin','Admin',10),
      ('coordinator','Coordinator',20), ('teacher','Teacher',30)
    ) AS t(slug, name, lvl)
  LOOP
    INSERT INTO public.rbac_roles (slug, name, base_role, hierarchy_level, is_system, organization_id)
    SELECT r.slug, r.name, r.slug, r.lvl, true, _org
     WHERE NOT EXISTS (SELECT 1 FROM public.rbac_roles
                        WHERE organization_id = _org AND slug = r.slug);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('roles', n);
END $$;

-- ── permissions ─────────────────────────────────────────────────────────────
-- Grants the modules each role sees by default. Deliberately COARSE: a new
-- tenant should be able to work immediately, and the admin tightens from
-- there. Starting locked-down produces a support ticket on day one.
CREATE OR REPLACE FUNCTION public.provision_step_permissions(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; g RECORD;
BEGIN
  FOR g IN SELECT * FROM (VALUES
      ('management','*'), ('admin','*'),
      ('coordinator','student'), ('coordinator','attendance'),
      ('coordinator','academics'), ('coordinator','exam'),
      ('coordinator','reports'), ('coordinator','tasks'),
      ('teacher','attendance'), ('teacher','exam'), ('teacher','tasks'),
      ('teacher','student')
    ) AS t(role, module_id)
  LOOP
    BEGIN
      INSERT INTO public.rbac_role_permissions
        (role, module_id, submodule_id, can_view, can_edit, organization_id)
      SELECT g.role, g.module_id, NULL, true, g.role IN ('management','admin'), _org
       WHERE NOT EXISTS (
         SELECT 1 FROM public.rbac_role_permissions
          WHERE organization_id = _org AND role = g.role AND module_id = g.module_id);
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;   -- column drift between environments
    END;
  END LOOP;
  RETURN jsonb_build_object('grants', n);
END $$;

-- ── comms_templates ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_comms_templates(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; t RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('fee_receipt',        'Fee receipt',
     'Dear {{parent_name}}, we have received {{amount}} towards {{student_name}}''s fees. Receipt: {{receipt_no}}. Thank you. — {{org_name}}'),
    ('fee_reminder',       'Fee reminder',
     'Dear {{parent_name}}, a fee instalment of {{amount}} for {{student_name}} is due on {{due_date}}. — {{org_name}}'),
    ('attendance_absent',  'Absence alert',
     'Dear {{parent_name}}, {{student_name}} was marked absent on {{date}}. Please contact us if this is unexpected. — {{org_name}}'),
    ('exam_result',        'Result published',
     'Dear {{parent_name}}, {{student_name}}''s result for {{exam_name}} is now available in the parent portal. — {{org_name}}'),
    ('admission_welcome',  'Admission confirmed',
     'Welcome {{student_name}}! Your admission at {{org_name}} is confirmed. Classes begin {{start_date}}.'),
    ('class_cancelled',    'Class cancelled',
     'Dear {{parent_name}}, the {{subject}} class on {{date}} has been cancelled. A replacement will be scheduled. — {{org_name}}'),
    ('staff_welcome',      'Staff welcome',
     'Welcome to {{org_name}}, {{staff_name}}. Your account is ready — sign in at {{login_url}}.'),
    ('parent_credentials', 'Parent portal access',
     'Dear {{parent_name}}, your {{org_name}} parent portal account is ready. Username: {{username}}')
  ) AS x(key, title, body)
  LOOP
    BEGIN
      INSERT INTO public.comms_templates
        (template_key, version, language, category, title, body, is_active, organization_id)
      SELECT t.key, 1, 'en', 'transactional', t.title, t.body, true, _org
       WHERE NOT EXISTS (
         SELECT 1 FROM public.comms_templates
          WHERE organization_id = _org AND template_key = t.key
            AND version = 1 AND language = 'en');
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('templates', n);
END $$;

-- ── comms_automation ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_comms_automation(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; k text;
BEGIN
  FOREACH k IN ARRAY ARRAY[
    'fee_paid','fee_due','attendance_absent','exam_result',
    'class_cancelled','admission_confirmed'
  ] LOOP
    BEGIN
      -- enabled = FALSE, always. A brand-new tenant must never auto-message a
      -- real parent before its admin has decided it should — that is the
      -- fastest way to lose a customer in week one.
      INSERT INTO public.comms_automation_settings
        (event_key, channel, timing, enabled, organization_id)
      SELECT k, 'whatsapp', 'immediate', false, _org
       WHERE NOT EXISTS (SELECT 1 FROM public.comms_automation_settings
                          WHERE organization_id = _org AND event_key = k);
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('automations', n, 'all_disabled', true);
END $$;

-- ── certificates ────────────────────────────────────────────────────────────
-- The certificates MODULE is a 94-line stub, so there is no template table to
-- write to. The definitions are stored as an organization setting instead, so
-- when the module is built the data is already there — and no fake table is
-- created for a feature that does not exist.
CREATE OR REPLACE FUNCTION public.provision_step_certificates(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'certificate_templates', jsonb_build_object(
    'bonafide', jsonb_build_object(
      'title', 'Bonafide Certificate', 'enabled', true,
      'body', 'This is to certify that {{student_name}}, {{parent_relation}} of {{parent_name}}, is a bonafide student of {{org_name}} studying in {{standard}} during the academic year {{academic_year}}.'),
    'transfer', jsonb_build_object(
      'title', 'Transfer Certificate', 'enabled', true,
      'body', 'This is to certify that {{student_name}} was a student of {{org_name}} from {{admission_date}} to {{leaving_date}} and has left with a satisfactory record.'),
    'completion', jsonb_build_object(
      'title', 'Course Completion Certificate', 'enabled', true,
      'body', 'This is to certify that {{student_name}} has successfully completed {{course_name}} at {{org_name}} on {{completion_date}}.')
  ))
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN jsonb_build_object('templates', 3, 'note', 'stored as settings — certificates module not yet built');
END $$;

-- ── settings steps ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_fee_settings(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  SELECT currency INTO cur FROM public.organizations WHERE id = _org;
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'fees', jsonb_build_object(
    'currency', COALESCE(cur, 'INR'),
    'late_fee_enabled', false, 'late_fee_percent', 0,
    'receipt_prefix', 'RCPT', 'receipt_start', 1,
    'auto_receipt_delivery', false,     -- OFF: nothing reaches a parent by default
    'partial_payment_allowed', true))
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.provision_step_attendance_settings(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'attendance', jsonb_build_object(
    'lock_after_days', 7, 'allow_backdated_edit', true,
    'auto_notify_absent', false, 'min_attendance_percent', 75,
    'require_closing_approval', true))
  ON CONFLICT (organization_id, key) DO NOTHING;

  BEGIN
    INSERT INTO public.attendance_settings (singleton, organization_id)
    SELECT true, _org
     WHERE NOT EXISTS (SELECT 1 FROM public.attendance_settings WHERE organization_id = _org);
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.provision_step_payroll_settings(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  SELECT currency INTO cur FROM public.organizations WHERE id = _org;
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'payroll', jsonb_build_object(
    'cycle', 'monthly', 'currency', COALESCE(cur, 'INR'),
    'approval_required', true, 'payslip_email', false,
    'salary_from_teaching_hours', false))
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── dashboards ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_dashboards(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; d RECORD;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('management', '["revenue","admissions","attendance_summary","staff_ranking","fee_collection"]'),
    ('admin',      '["daily_checklist","fee_collection","admissions","attendance_summary"]'),
    ('coordinator','["my_standards","attendance_today","class_schedule","pending_tasks"]'),
    ('teacher',    '["my_classes","attendance_today","pending_tasks","my_salary"]')
  ) AS x(scope, items)
  LOOP
    BEGIN
      INSERT INTO public.dashboard_layouts (scope, items, organization_id)
      SELECT d.scope, d.items::jsonb, _org
       WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_layouts
                          WHERE organization_id = _org AND scope = d.scope);
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('layouts', n);
END $$;

-- ── reports ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_reports(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Fee collection — this month', 'fee_collection', '{"period":"current_month"}'),
    ('Outstanding fees',            'fee_outstanding', '{"status":"unpaid"}'),
    ('Attendance below 75%',        'attendance_summary', '{"below_percent":75}'),
    ('New admissions — 30 days',    'admissions', '{"period":"last_30_days"}')
  ) AS x(name, report_key, filters)
  LOOP
    BEGIN
      INSERT INTO public.report_presets (name, report_key, filters, is_shared, organization_id)
      SELECT r.name, r.report_key, r.filters::jsonb, true, _org
       WHERE NOT EXISTS (SELECT 1 FROM public.report_presets
                          WHERE organization_id = _org AND name = r.name);
      n := n + 1;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('presets', n);
END $$;

-- ── theme + branding ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_theme(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_branding (organization_id, theme_mode, primary_color, accent_color)
  VALUES (_org, 'system', '#2563eb', '#0ea5e9')
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.organization_branding
     SET theme_tokens = COALESCE(theme_tokens, jsonb_build_object(
           'radius', '0.6rem', 'font', 'system',
           'sidebar', 'default', 'navbar', 'default',
           'chart_palette', jsonb_build_array('#2563eb','#0ea5e9','#10b981','#f59e0b','#ef4444')
         )),
         updated_at = now()
   WHERE organization_id = _org;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.provision_step_branding(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o RECORD;
BEGIN
  SELECT display_name, slug INTO o FROM public.organizations WHERE id = _org;

  INSERT INTO public.organization_branding (organization_id, app_name)
  VALUES (_org, o.display_name)
  ON CONFLICT (organization_id) DO UPDATE
    SET app_name = COALESCE(public.organization_branding.app_name, EXCLUDED.app_name);

  UPDATE public.organization_branding
     SET portal_name = COALESCE(portal_name, o.display_name || ' Portal'),
         email_from_name = COALESCE(email_from_name, o.display_name),
         updated_at = now()
   WHERE organization_id = _org;

  INSERT INTO public.organization_domains (organization_id, host, kind, is_primary, verified_at)
  SELECT _org, o.slug || '.smartark.ai', 'subdomain', true, now()
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_domains
                      WHERE host = o.slug || '.smartark.ai');
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── feature_flags ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_feature_flags(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0;
BEGIN
  -- Materialise the PLAN's features as per-org rows so the tenant has an
  -- explicit starting state that support can reason about, rather than an
  -- implicit one derived by joining through the subscription every time.
  INSERT INTO public.organization_features (organization_id, feature_key, enabled, reason)
  SELECT _org, pf.feature_key, pf.enabled, 'plan'
    FROM public.subscriptions s
    JOIN public.plan_features pf ON pf.plan_id = s.plan_id
   WHERE s.organization_id = _org
     AND s.status IN ('trialing','active','past_due','grace')
  ON CONFLICT (organization_id, feature_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('features', n);
END $$;

-- ── portals ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_portals(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id, key, value) VALUES
    (_org, 'parent_portal', jsonb_build_object(
      'enabled', true, 'show_attendance', true, 'show_results', true,
      'show_fees', true, 'show_documents', true, 'allow_leave_request', true)),
    (_org, 'teacher_portal', jsonb_build_object(
      'enabled', true, 'allow_mark_entry', true, 'allow_attendance', true,
      'show_own_salary', true)),
    (_org, 'management_portal', jsonb_build_object(
      'enabled', true, 'show_revenue', true, 'show_staff_ranking', true))
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN jsonb_build_object('portals', 3);
END $$;

-- ── onboarding checklist ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_step_onboarding(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE items jsonb;
BEGIN
  items := jsonb_build_object(
    'organization', jsonb_build_object('label','Organization created','done',true,'order',1),
    'branch',       jsonb_build_object('label','Confirm your branch details','done',false,'order',2,'href','/admin/setup/batches'),
    'branding',     jsonb_build_object('label','Upload your logo and colours','done',false,'order',3),
    'staff',        jsonb_build_object('label','Add or import your staff','done',false,'order',4,'href','/admin/staff'),
    'students',     jsonb_build_object('label','Import your students','done',false,'order',5,'href','/admin/students/import'),
    'fees',         jsonb_build_object('label','Set up a fee structure','done',false,'order',6,'href','/admin/setup/fee-structure'),
    'attendance',   jsonb_build_object('label','Mark attendance for one class','done',false,'order',7),
    'communication',jsonb_build_object('label','Connect WhatsApp / email','done',false,'order',8),
    'payroll',      jsonb_build_object('label','Configure payroll rates','done',false,'order',9),
    'reports',      jsonb_build_object('label','Open your first report','done',false,'order',10)
  );

  INSERT INTO public.organization_onboarding (organization_id, items, completed_count, total_count)
  VALUES (_org, items, 1, 10)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN jsonb_build_object('items', 10);
END $$;

/**
 * Recompute the checklist from what the tenant has ACTUALLY done.
 *
 * Derived, not self-reported: a checklist the user ticks themselves measures
 * optimism, whereas this measures whether students exist, whether attendance
 * has been marked, whether a fee structure is configured. Callable by the
 * tenant so the ERP can refresh it on demand.
 */
CREATE OR REPLACE FUNCTION public.refresh_onboarding_checklist(_org uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid := COALESCE(_org, public.current_org_id());
  items  jsonb;
  done   int := 0;
  chk    boolean;
BEGIN
  IF target IS NULL THEN RETURN NULL; END IF;
  IF target IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT o.items INTO items FROM public.organization_onboarding o WHERE o.organization_id = target;
  IF items IS NULL THEN
    PERFORM public.provision_step_onboarding(target);
    SELECT o.items INTO items FROM public.organization_onboarding o WHERE o.organization_id = target;
  END IF;

  -- Each probe is guarded: an unapplied migration must leave that item
  -- unticked, not blow up the whole checklist.
  items := jsonb_set(items, '{organization,done}', 'true'::jsonb);

  BEGIN SELECT EXISTS (SELECT 1 FROM public.campuses WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{branch,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.organization_branding
                        WHERE organization_id = target AND logo_url IS NOT NULL) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{branding,done}', to_jsonb(chk));

  BEGIN SELECT count(*) > 1 FROM public.profiles WHERE organization_id = target INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{staff,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.students WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{students,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.fee_structures WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{fees,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.student_attendance WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{attendance,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.comms_automation_settings
                        WHERE organization_id = target AND enabled) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{communication,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.payroll_role_rates WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{payroll,done}', to_jsonb(chk));

  BEGIN SELECT EXISTS (SELECT 1 FROM public.report_presets WHERE organization_id = target) INTO chk;
  EXCEPTION WHEN others THEN chk := false; END;
  items := jsonb_set(items, '{reports,done}', to_jsonb(chk));

  SELECT count(*) INTO done
    FROM jsonb_each(items) e
   WHERE (e.value ->> 'done')::boolean;

  UPDATE public.organization_onboarding
     SET items = items, completed_count = done,
         total_count = (SELECT count(*) FROM jsonb_each(items)),
         updated_at = now()
   WHERE organization_id = target;

  RETURN jsonb_build_object('items', items, 'completed', done);
END $$;

-- ── storage + notify ────────────────────────────────────────────────────────
-- Supabase Storage has no real directories — a "folder" is a prefix implied by
-- an object's name. So this step records the CONVENTION rather than pretending
-- to create directories; the worker writes a .keep placeholder per prefix so
-- the structure is browsable in the dashboard.
CREATE OR REPLACE FUNCTION public.provision_step_storage(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'storage_layout', jsonb_build_object(
    'root', _org::text,
    'folders', jsonb_build_array(
      'students','staff','certificates','reports','receipts','uploads','communication'),
    'note', 'Supabase Storage folders are virtual prefixes; placeholders are written by the worker.'))
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN jsonb_build_object('root', _org::text, 'folders', 7);
END $$;

CREATE OR REPLACE FUNCTION public.provision_step_notify(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Records the INTENT; the worker performs the send, because email delivery
  -- needs an HTTP call the database cannot make. Recording it here means a
  -- failed send is visible as an unfinished step rather than vanishing.
  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (_org, 'welcome_email', jsonb_build_object('queued_at', now(), 'sent', false))
  ON CONFLICT (organization_id, key) DO UPDATE
    SET value = public.organization_settings.value || jsonb_build_object('queued_at', now());
  RETURN jsonb_build_object('queued', true);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- WHITE LABEL — extend organization_branding
--
-- 1A created this table as schema-only. Phase 4 makes it real: these columns
-- are what the theme engine reads at runtime.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_branding
  ADD COLUMN IF NOT EXISTS secondary_color   text,
  ADD COLUMN IF NOT EXISTS portal_name       text,
  ADD COLUMN IF NOT EXISTS email_from_name   text,
  ADD COLUMN IF NOT EXISTS email_header_html text,
  ADD COLUMN IF NOT EXISTS email_footer_html text,
  ADD COLUMN IF NOT EXISTS report_header_html text,
  ADD COLUMN IF NOT EXISTS certificate_header_url text,
  ADD COLUMN IF NOT EXISTS certificate_signature_url text,
  ADD COLUMN IF NOT EXISTS font_family       text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS theme_tokens      jsonb,
  ADD COLUMN IF NOT EXISTS powered_by_hidden boolean NOT NULL DEFAULT false;

/**
 * Reject anything that is not a plain hex colour.
 *
 * These values are injected into CSS custom properties at runtime. An
 * unvalidated string there is a CSS-injection vector, and "it is only their
 * own tenant" stops being true the moment a parent opens the portal. The HTML
 * fields are NOT sanitised here — they are stored raw and must be sanitised at
 * render time with an allowlist, which Phase 6 owns. Until then nothing reads
 * them, and this comment is the reason why.
 */
CREATE OR REPLACE FUNCTION public.validate_branding()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[NEW.primary_color, NEW.secondary_color, NEW.accent_color] LOOP
    IF c IS NOT NULL AND c !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'Invalid colour "%": use #rrggbb', c;
    END IF;
  END LOOP;

  IF NEW.font_family IS NOT NULL
     AND NEW.font_family NOT IN ('system','inter','roboto','poppins','lora','sans','serif') THEN
    RAISE EXCEPTION 'Unsupported font "%"', NEW.font_family;
  END IF;

  IF NEW.theme_mode IS NOT NULL AND NEW.theme_mode NOT IN ('system','light','dark') THEN
    RAISE EXCEPTION 'Invalid theme mode "%"', NEW.theme_mode;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_branding ON public.organization_branding;
CREATE TRIGGER trg_validate_branding
  BEFORE INSERT OR UPDATE ON public.organization_branding
  FOR EACH ROW EXECUTE FUNCTION public.validate_branding();

-- Tenant admins may now edit their OWN branding (1A left it read-only).
DROP POLICY IF EXISTS organization_branding_write ON public.organization_branding;
CREATE POLICY organization_branding_write ON public.organization_branding
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id());

-- Custom domains: infrastructure only, no DNS automation in this phase.
ALTER TABLE public.organization_domains
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS ssl_status text NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending','provisioning','active','failed')),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

NOTIFY pgrst, 'reload schema';
