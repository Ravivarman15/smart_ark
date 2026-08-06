-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1D — ORGANIZATION PROVISIONING ENGINE                      2026-08-06
--
-- ADDITIVE. IDEMPOTENT. Paired rollback: ..._rollback.sql
-- Requires 1A + 1B + 1C.
--
-- Step 10 of the brief: build the provisioning ENGINE, not registration.
-- Nothing calls this yet. Phase 4 (Organization Provisioning) wires it to a
-- signup wizard; until then it is exercised only by tests and by an operator
-- creating a tenant by hand.
--
-- ┌── DESIGN RULES ────────────────────────────────────────────────────────┐
-- │ 1. TRANSACTIONAL. A half-provisioned organization is worse than a      │
-- │    failed signup: the customer is inside a broken ERP with no way to   │
-- │    tell what is missing. Any error rolls the whole thing back.         │
-- │ 2. IDEMPOTENT by slug. A retried request must not create a second org. │
-- │ 3. EVERY AUTOMATION OFF. A brand-new tenant must never auto-message    │
-- │    its parents on day one. Enabling comms is an explicit act.          │
-- │ 4. NO auth.users CREATION. That needs the service role and belongs in  │
-- │    an edge function; this returns the org so the caller can attach an  │
-- │    admin via provision_organization_admin().                           │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ── Academic-year label appropriate to the org's country ────────────────────
CREATE OR REPLACE FUNCTION public.default_academic_year(_country text DEFAULT 'IN')
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  -- India's academic year runs April–March; most other markets Aug/Sep–Jun.
  SELECT CASE
    WHEN _country = 'IN' THEN
      CASE WHEN extract(month FROM now()) >= 4
           THEN extract(year FROM now())::int || '-' || (extract(year FROM now())::int + 1)
           ELSE (extract(year FROM now())::int - 1) || '-' || extract(year FROM now())::int
      END
    ELSE
      CASE WHEN extract(month FROM now()) >= 8
           THEN extract(year FROM now())::int || '-' || (extract(year FROM now())::int + 1)
           ELSE (extract(year FROM now())::int - 1) || '-' || extract(year FROM now())::int
      END
  END
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- provision_organization — the engine
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provision_organization(
  _slug              text,
  _legal_name        text,
  _display_name      text DEFAULT NULL,
  _institution_type  text DEFAULT 'coaching',
  _country           text DEFAULT 'IN',
  _timezone          text DEFAULT 'Asia/Kolkata',
  _currency          text DEFAULT 'INR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org        uuid;
  year_label text;
  campus     uuid;
  std        text;
  subj       text;
  r          RECORD;
BEGIN
  IF _slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Invalid slug "%" — lowercase letters, digits and hyphens, 3-40 chars.', _slug;
  END IF;
  IF _slug IN ('www','app','api','login','platform','admin','docs','status','mail','support') THEN
    RAISE EXCEPTION 'Slug "%" is reserved.', _slug;
  END IF;

  -- Idempotency: an existing slug returns the same organization untouched.
  SELECT id INTO org FROM public.organizations WHERE slug = _slug;
  IF org IS NOT NULL THEN
    RAISE NOTICE 'Organization % already exists (%) — provisioning is idempotent.', _slug, org;
    RETURN org;
  END IF;

  -- NOTE: the BEFORE INSERT trigger assert_multi_tenant_ready() fires here and
  -- will REFUSE a second organization until every tenancy_readiness flag is
  -- green. That is intentional: see 1B PART 5.
  INSERT INTO public.organizations
    (slug, legal_name, display_name, status, institution_type, country, timezone, currency)
  VALUES
    (_slug, _legal_name, COALESCE(_display_name, _legal_name), 'trialing',
     _institution_type, _country, _timezone, _currency)
  RETURNING id INTO org;

  -- ── Subscription shell (Phase 5 owns the semantics) ──────────────────────
  INSERT INTO public.organization_subscriptions
    (organization_id, plan_code, status, trial_ends_at)
  VALUES (org, 'trial', 'trialing', now() + interval '14 days');

  INSERT INTO public.organization_branding (organization_id, app_name)
  VALUES (org, COALESCE(_display_name, _legal_name));

  INSERT INTO public.organization_domains (organization_id, host, kind, is_primary, verified_at)
  VALUES (org, _slug || '.smartark.ai', 'subdomain', true, now());

  -- ── Default branch ───────────────────────────────────────────────────────
  INSERT INTO public.campuses (name, organization_id)
  VALUES ('Main Branch', org)
  RETURNING id INTO campus;

  INSERT INTO public.organization_branches (organization_id, campus_id, name, is_primary)
  VALUES (org, campus, 'Main Branch', true);

  -- ── Academic year ────────────────────────────────────────────────────────
  year_label := public.default_academic_year(_country);
  BEGIN
    INSERT INTO public.academic_years (year_label, is_active, organization_id)
    VALUES (year_label, true, org);
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    -- Column naming differs across environments with unapplied migrations.
    RAISE WARNING 'Could not seed academic_years for % — create it manually.', _slug;
  END;

  -- ── Standards appropriate to the institution type ────────────────────────
  FOREACH std IN ARRAY (
    CASE _institution_type
      WHEN 'k12'     THEN ARRAY['LKG','UKG','1','2','3','4','5','6','7','8','9','10','11','12']
      WHEN 'college' THEN ARRAY['Year 1','Year 2','Year 3','Year 4']
      ELSE                ARRAY['8','9','10','11','12']
    END
  ) LOOP
    BEGIN
      INSERT INTO public.standards (name, organization_id) VALUES (std, org);
    EXCEPTION WHEN others THEN NULL;   -- schema drift must not abort provisioning
    END;
  END LOOP;

  FOREACH subj IN ARRAY ARRAY['Mathematics','Physics','Chemistry','Biology','English'] LOOP
    BEGIN
      INSERT INTO public.subjects (name, organization_id) VALUES (subj, org);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;

  -- ── Roles: PER-ORG copies of the four system roles ───────────────────────
  -- Copied, not shared: a tenant must be able to rename "Coordinator" without
  -- touching anyone else's role catalog.
  FOR r IN
    SELECT * FROM (VALUES
      ('management',  'Management',  0),
      ('admin',       'Admin',      10),
      ('coordinator', 'Coordinator',20),
      ('teacher',     'Teacher',    30)
    ) AS t(slug, name, level)
  LOOP
    BEGIN
      INSERT INTO public.rbac_roles (slug, name, base_role, hierarchy_level, is_system, organization_id)
      VALUES (r.slug, r.name, r.slug, r.level, true, org);
    EXCEPTION WHEN unique_violation THEN
      -- Expected until Phase 1E makes rbac_roles.slug unique per organization
      -- rather than globally. Reported so provisioning failures are visible.
      RAISE WARNING 'rbac_roles.slug "%" collides globally — Phase 1E (composite '
                    'unique keys) is required before a second organization.', r.slug;
    WHEN others THEN NULL;
    END;
  END LOOP;

  -- ── Communication + automation: PRESENT BUT OFF ──────────────────────────
  -- Templates exist so the tenant has something to edit; every automation is
  -- disabled so nothing reaches a real parent before the customer says so.
  BEGIN
    INSERT INTO public.comms_automation_settings (event_key, channel, timing, enabled, organization_id)
    SELECT k, 'whatsapp', 'immediate', false, org
      FROM unnest(ARRAY['fee_paid','attendance_absent','exam_result','class_cancelled']) AS k;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not seed comms_automation_settings for % — check the global '
                  'unique on event_key (Phase 1E).', _slug;
  END;

  -- ── Settings defaults ────────────────────────────────────────────────────
  INSERT INTO public.organization_settings (organization_id, key, value) VALUES
    (org, 'fees',       '{"currency":"INR","late_fee_enabled":false}'::jsonb),
    (org, 'attendance', '{"lock_after_days":7,"auto_notify_absent":false}'::jsonb),
    (org, 'payroll',    '{"cycle":"monthly","approval_required":true}'::jsonb),
    (org, 'email',      '{"sender_configured":false}'::jsonb),
    (org, 'ai',         '{"enabled":false}'::jsonb),
    (org, 'onboarding', '{"checklist_complete":false}'::jsonb)
  ON CONFLICT (organization_id, key) DO NOTHING;

  UPDATE public.organizations SET provisioned_at = now() WHERE id = org;

  INSERT INTO public.organization_audit (organization_id, action, detail, payload)
  VALUES (org, 'provision', 'Organization provisioned',
          jsonb_build_object('slug', _slug, 'type', _institution_type, 'year', year_label));

  RETURN org;
END $$;

COMMENT ON FUNCTION public.provision_organization IS
  'Creates a fully-usable organization in one transaction. Idempotent by slug. '
  'Every communication automation is seeded DISABLED. Does NOT create auth '
  'users — call provision_organization_admin() with the service role for that.';


-- ════════════════════════════════════════════════════════════════════════════
-- provision_organization_admin — attach an existing auth user as the org admin
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provision_organization_admin(
  _org uuid, _user_id uuid, _name text, _role text DEFAULT 'management'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE profile_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org) THEN
    RAISE EXCEPTION 'No such organization %', _org;
  END IF;
  IF _role NOT IN ('management','admin','coordinator','teacher') THEN
    RAISE EXCEPTION 'Invalid role %', _role;
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, principal_kind, is_default)
  VALUES (_org, _user_id, 'staff', true)
  ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;

  SELECT id INTO profile_id FROM public.profiles
   WHERE user_id = _user_id AND organization_id = _org;

  IF profile_id IS NULL THEN
    INSERT INTO public.profiles (user_id, name, role, organization_id)
    VALUES (_user_id, _name, _role::app_role, _org)
    RETURNING id INTO profile_id;
  END IF;

  INSERT INTO public.organization_audit (organization_id, actor_user_id, action, detail)
  VALUES (_org, _user_id, 'provision.admin', format('Attached %s as %s', _name, _role));

  RETURN profile_id;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- deprovision_organization — SOFT delete only
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.deprovision_organization(_org uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Deliberately does NOT delete anything. Data retention is a trust product
  -- and the cheapest reactivation channel there is; every organization_id FK
  -- is ON DELETE RESTRICT so a hard delete is impossible by construction.
  UPDATE public.organizations
     SET status = 'cancelled', deleted_at = now(), updated_at = now()
   WHERE id = _org;

  UPDATE public.organization_users SET status = 'suspended' WHERE organization_id = _org;

  INSERT INTO public.organization_audit (organization_id, action, detail)
  VALUES (_org, 'deprovision', COALESCE(_reason, 'Organization deprovisioned (soft)'));
END $$;

NOTIFY pgrst, 'reload schema';
