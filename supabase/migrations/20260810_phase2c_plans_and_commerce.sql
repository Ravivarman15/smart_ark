-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2C — PLANS, PRICING, COUPONS, FEATURE FLAGS              2026-08-10
--   + RESERVED ENTITIES FOR PHASES 3-5
--
-- ADDITIVE. IDEMPOTENT. NO PAYMENT GATEWAY — management only, by instruction.
-- Paired rollback: 20260810_phase2c_plans_and_commerce_rollback.sql
--
-- ┌── LIVE vs RESERVED ────────────────────────────────────────────────────┐
-- │ LIVE (the control plane reads and writes these in Phase 2):            │
-- │   plans · plan_prices · plan_features · coupons · coupon_redemptions   │
-- │   organization_features · feature_flag_assignments · subscriptions     │
-- │   subscription_usage                                                   │
-- │                                                                        │
-- │ RESERVED — shape only, nothing reads or writes them yet:               │
-- │   invoices · invoice_lines · organization_invitations                  │
-- │   organization_activity · platform_notifications                       │
-- │   platform_announcements                                               │
-- │                                                                        │
-- │ Reserved tables exist now so Phases 3-5 are additive rather than       │
-- │ another schema-wide change. They carry full RLS from the start: an     │
-- │ unused table with no policies is the one someone later exposes by      │
-- │ accident.                                                              │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- NOTE ON organization_subscriptions: 1A created it as the per-tenant shell.
-- `subscriptions` here is the PLATFORM-side billing record (plan, term,
-- price, coupon). They are linked, not duplicated — the ERP keeps reading the
-- lightweight 1A row; the control plane owns the commercial one.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — PLANS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,              -- 'starter' | 'growth' | …
  name          text NOT NULL,
  description   text,
  tier_order    integer NOT NULL DEFAULT 0,        -- display + upgrade ordering
  is_public     boolean NOT NULL DEFAULT true,     -- false = negotiated/custom
  is_active     boolean NOT NULL DEFAULT true,
  trial_days    integer NOT NULL DEFAULT 14,
  grace_days    integer NOT NULL DEFAULT 7,
  support_level text NOT NULL DEFAULT 'email'
                  CHECK (support_level IN ('community','email','priority','sla')),
  -- Limits. NULL means UNLIMITED, which is why these are nullable rather than
  -- a sentinel like -1 that every consumer would have to remember to special-case.
  max_students  integer,
  max_staff     integer,
  max_branches  integer,
  max_storage_mb integer,
  whatsapp_credits integer,
  email_credits    integer,
  ai_credits       integer,
  api_requests_per_day integer,
  allow_white_label   boolean NOT NULL DEFAULT false,
  allow_custom_domain boolean NOT NULL DEFAULT false,
  allow_marketplace   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  currency    text NOT NULL DEFAULT 'INR',
  interval    text NOT NULL CHECK (interval IN ('monthly','quarterly','half_yearly','yearly')),
  -- numeric(14,2), never float. Money in binary floating point is how
  -- reconciliation reports end up off by a rupee and nobody can explain why.
  amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
  tax_percent numeric(5,2) NOT NULL DEFAULT 18.00,   -- India GST default
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, currency, interval)
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id     uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  limit_value integer,
  PRIMARY KEY (plan_id, feature_key)
);

COMMENT ON TABLE public.plan_features IS
  'feature_key IS the RBAC ModuleId from src/features/rbac/constants/catalog.ts. '
  'One vocabulary shared by plans, per-org overrides and the sidebar resolver — '
  'a second vocabulary would guarantee drift between what is sold and what renders.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — SUBSCRIPTIONS (management only; no gateway)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  plan_id          uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  price_id         uuid REFERENCES public.plan_prices(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'trialing'
                     CHECK (status IN ('trialing','active','past_due','grace','suspended','cancelled')),
  interval         text NOT NULL DEFAULT 'yearly',
  currency         text NOT NULL DEFAULT 'INR',
  amount           numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount  numeric(14,2) NOT NULL DEFAULT 0,
  coupon_id        uuid,
  current_period_start date,
  current_period_end   date,
  trial_ends_at    timestamptz,
  grace_until      timestamptz,
  cancel_at        timestamptz,
  cancelled_at     timestamptz,
  auto_renew       boolean NOT NULL DEFAULT true,
  notes            text,
  created_by       uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One LIVE subscription per organization; historical cancelled rows are kept.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_org
  ON public.subscriptions (organization_id)
  WHERE status IN ('trialing','active','past_due','grace');

CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS subscriptions_renewal_idx ON public.subscriptions (current_period_end)
  WHERE status IN ('active','trialing');

CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric          text NOT NULL,        -- 'whatsapp' | 'email' | 'storage_mb' | 'ai' | 'api'
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  quantity        numeric(14,2) NOT NULL DEFAULT 0,
  included        numeric(14,2) NOT NULL DEFAULT 0,
  overage         numeric(14,2) NOT NULL DEFAULT 0,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, metric, period_start)
);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — COUPONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,     -- global by design: quoted externally
  description     text,
  discount_type   text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value  numeric(14,2) NOT NULL CHECK (discount_value > 0),
  currency        text DEFAULT 'INR',       -- only meaningful for 'fixed'
  duration        text NOT NULL DEFAULT 'once'
                    CHECK (duration IN ('once','recurring','forever')),
  duration_cycles integer,                  -- for 'recurring'
  max_redemptions integer,                  -- NULL = unlimited
  redemption_count integer NOT NULL DEFAULT 0,
  max_per_organization integer NOT NULL DEFAULT 1,
  applies_to_plan_ids uuid[],               -- NULL/empty = every plan
  valid_from      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_percentage_range
    CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  discount_applied numeric(14,2) NOT NULL DEFAULT 0,
  redeemed_at     timestamptz NOT NULL DEFAULT now(),
  redeemed_by     uuid REFERENCES public.platform_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx
  ON public.coupon_redemptions (coupon_id);

-- Enforce redemption limits in the DATABASE. A limit checked only in the UI is
-- a suggestion, and coupon abuse is a direct revenue loss.
CREATE OR REPLACE FUNCTION public.coupon_enforce_limits()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c RECORD; used int; used_here int;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE id = NEW.coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown coupon'; END IF;
  IF NOT c.is_active THEN RAISE EXCEPTION 'Coupon % is inactive', c.code; END IF;
  IF c.valid_until IS NOT NULL AND now() > c.valid_until THEN
    RAISE EXCEPTION 'Coupon % expired on %', c.code, c.valid_until;
  END IF;
  IF now() < c.valid_from THEN
    RAISE EXCEPTION 'Coupon % is not valid until %', c.code, c.valid_from;
  END IF;

  SELECT count(*) INTO used FROM public.coupon_redemptions WHERE coupon_id = NEW.coupon_id;
  IF c.max_redemptions IS NOT NULL AND used >= c.max_redemptions THEN
    RAISE EXCEPTION 'Coupon % has reached its redemption limit (%)', c.code, c.max_redemptions;
  END IF;

  SELECT count(*) INTO used_here FROM public.coupon_redemptions
   WHERE coupon_id = NEW.coupon_id AND organization_id = NEW.organization_id;
  IF used_here >= c.max_per_organization THEN
    RAISE EXCEPTION 'Coupon % already used % time(s) by this organization',
      c.code, used_here;
  END IF;

  UPDATE public.coupons SET redemption_count = used + 1 WHERE id = NEW.coupon_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_coupon_enforce_limits ON public.coupon_redemptions;
CREATE TRIGGER trg_coupon_enforce_limits
  BEFORE INSERT ON public.coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.coupon_enforce_limits();


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — FEATURE FLAGS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_features (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key     text NOT NULL,
  enabled         boolean NOT NULL,
  reason          text NOT NULL DEFAULT 'plan'
                    CHECK (reason IN ('plan','sales_override','beta','incident','trial')),
  expires_at      timestamptz,
  set_by          uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature_key)
);

-- Assignment history. organization_features holds the CURRENT state; this is
-- the trail of who changed what and why — the question asked when a customer
-- says "this module vanished".
CREATE TABLE IF NOT EXISTS public.feature_flag_assignments (
  id              bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key     text NOT NULL,
  enabled         boolean NOT NULL,
  reason          text,
  note            text,
  assigned_by     uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ffa_org_idx
  ON public.feature_flag_assignments (organization_id, assigned_at DESC);

CREATE OR REPLACE FUNCTION public.feature_flag_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.feature_flag_assignments
    (organization_id, feature_key, enabled, reason, assigned_by)
  VALUES (NEW.organization_id, NEW.feature_key, NEW.enabled, NEW.reason,
          public.current_platform_user_id());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feature_flag_history ON public.organization_features;
CREATE TRIGGER trg_feature_flag_history
  AFTER INSERT OR UPDATE ON public.organization_features
  FOR EACH ROW EXECUTE FUNCTION public.feature_flag_history();

/**
 * Effective flags for an organization: plan defaults overlaid with per-org
 * overrides, expired overrides ignored.
 *
 * Callable by the tenant itself (its own org) or by the platform. Phase 6
 * wires this into the sidebar; Phase 2 only needs it for the control plane.
 */
CREATE OR REPLACE FUNCTION public.effective_features(_org uuid DEFAULT NULL)
RETURNS TABLE (feature_key text, enabled boolean, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid := COALESCE(_org, public.current_org_id());
BEGIN
  IF target IS NULL THEN RETURN; END IF;
  IF target <> COALESCE(public.current_org_id(), '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: cannot read another organization''s features';
  END IF;

  RETURN QUERY
  WITH plan_defaults AS (
    SELECT pf.feature_key, pf.enabled
      FROM public.subscriptions s
      JOIN public.plan_features pf ON pf.plan_id = s.plan_id
     WHERE s.organization_id = target
       AND s.status IN ('trialing','active','past_due','grace')
  ),
  overrides AS (
    SELECT f.feature_key, f.enabled
      FROM public.organization_features f
     WHERE f.organization_id = target
       AND (f.expires_at IS NULL OR f.expires_at > now())
  )
  SELECT COALESCE(o.feature_key, p.feature_key),
         COALESCE(o.enabled, p.enabled),
         CASE WHEN o.feature_key IS NOT NULL THEN 'override' ELSE 'plan' END
    FROM plan_defaults p
    FULL OUTER JOIN overrides o ON o.feature_key = p.feature_key;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — RESERVED ENTITIES (shape only; nothing reads or writes them yet)
-- ════════════════════════════════════════════════════════════════════════════

-- Phase 5 — billing documents. No gateway in Phase 2, by instruction.
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  -- Per-organization, gapless, financial-year scoped: an Indian GST
  -- requirement. It must be a SEQUENCE at issue time, never a COUNT.
  invoice_number  text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','issued','paid','void','refunded','overdue')),
  currency        text NOT NULL DEFAULT 'INR',
  subtotal        numeric(14,2) NOT NULL DEFAULT 0,
  discount_total  numeric(14,2) NOT NULL DEFAULT 0,
  tax_total       numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL DEFAULT 0,
  period_start    date,
  period_end      date,
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  gst_treatment   text,                     -- 'cgst_sgst' | 'igst' | 'export'
  place_of_supply text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL DEFAULT 1,
  unit_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount      numeric(14,2) NOT NULL DEFAULT 0,
  tax_percent numeric(5,2) NOT NULL DEFAULT 0,
  sac_code    text,
  sort_order  integer NOT NULL DEFAULT 0
);

-- Phase 4 — inviting staff into a newly provisioned organization.
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'teacher',
  token_hash      text NOT NULL,            -- NEVER the raw token
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','expired','revoked')),
  invited_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email, status)
);

-- Phase 3 — the tenant-visible activity timeline (distinct from
-- platform_audit_log, which records what WE did to a tenant).
CREATE TABLE IF NOT EXISTS public.organization_activity (
  id              bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name      text,
  category        text NOT NULL,
  action          text NOT NULL,
  detail          text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_activity_idx
  ON public.organization_activity (organization_id, created_at DESC);

-- Phase 3 — targeted platform → tenant messages.
CREATE TABLE IF NOT EXISTS public.platform_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  severity        text NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info','warning','critical')),
  title           text NOT NULL,
  body            text,
  action_url      text,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  created_by      uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Phase 3 — broadcast (maintenance windows, releases). organization_id NULL
-- on platform_notifications would have been ambiguous, so broadcast gets its
-- own table with an explicit audience.
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text,
  severity      text NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('info','warning','critical')),
  audience      text NOT NULL DEFAULT 'all'
                  CHECK (audience IN ('all','trialing','active','suspended','plan')),
  audience_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  is_published  boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Global platform configuration (SMTP, providers, maintenance mode).
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Secrets live in edge-function env vars, NEVER here: this table is
  -- readable by every platform employee and reachable over PostgREST.
  is_secret   boolean NOT NULL DEFAULT false,
  description text,
  updated_by  uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('maintenance_mode', '{"enabled":false,"message":null}'::jsonb, 'Platform-wide maintenance banner / lockout'),
  ('api_limits',       '{"default_rpm":120}'::jsonb,               'Default API rate limits'),
  ('platform_branding','{"name":"Smart ARK","support_email":"support@smartark.ai"}'::jsonb, 'Control-plane branding'),
  ('providers',        '{"whatsapp":"aisensy","email":"brevo","ai":null}'::jsonb, 'Configured provider names (credentials live in edge secrets)')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — RLS
--
-- Reserved tables get policies NOW. An unused table with RLS enabled and no
-- policy is deny-all (safe); an unused table with RLS DISABLED is fully
-- readable over PostgREST the moment someone inserts into it.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plans','plan_prices','plan_features','subscriptions','subscription_usage',
    'coupons','coupon_redemptions','organization_features','feature_flag_assignments',
    'invoices','invoice_lines','organization_invitations','organization_activity',
    'platform_notifications','platform_announcements','platform_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── Plans & pricing: platform-managed; tenants may read the public catalogue.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans','plan_prices','plan_features'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (public.is_platform_admin() OR public.current_org_id() IS NOT NULL)',
      t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manage', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.platform_can(''plans.manage'')) '
      'WITH CHECK (public.platform_can(''plans.manage''))',
      t || '_manage', t);
  END LOOP;
END $$;

-- ── Subscriptions: platform manages; a tenant may read ITS OWN.
DROP POLICY IF EXISTS subscriptions_read ON public.subscriptions;
CREATE POLICY subscriptions_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.platform_can('billing.read') OR organization_id = public.current_org_id());

DROP POLICY IF EXISTS subscriptions_manage ON public.subscriptions;
CREATE POLICY subscriptions_manage ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.platform_can('billing.manage'))
  WITH CHECK (public.platform_can('billing.manage'));

DROP POLICY IF EXISTS subscription_usage_read ON public.subscription_usage;
CREATE POLICY subscription_usage_read ON public.subscription_usage
  FOR SELECT TO authenticated
  USING (public.platform_can('usage.read') OR organization_id = public.current_org_id());

DROP POLICY IF EXISTS subscription_usage_manage ON public.subscription_usage;
CREATE POLICY subscription_usage_manage ON public.subscription_usage
  FOR ALL TO authenticated
  USING (public.platform_can('billing.manage'))
  WITH CHECK (public.platform_can('billing.manage'));

-- ── Coupons: platform only. A tenant must not enumerate discount codes.
DROP POLICY IF EXISTS coupons_manage ON public.coupons;
CREATE POLICY coupons_manage ON public.coupons
  FOR ALL TO authenticated
  USING (public.platform_can('coupons.manage'))
  WITH CHECK (public.platform_can('coupons.manage'));

DROP POLICY IF EXISTS coupons_read ON public.coupons;
CREATE POLICY coupons_read ON public.coupons
  FOR SELECT TO authenticated USING (public.platform_can('billing.read'));

DROP POLICY IF EXISTS coupon_redemptions_read ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_read ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.platform_can('billing.read') OR organization_id = public.current_org_id());

DROP POLICY IF EXISTS coupon_redemptions_manage ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_manage ON public.coupon_redemptions
  FOR ALL TO authenticated
  USING (public.platform_can('coupons.manage'))
  WITH CHECK (public.platform_can('coupons.manage'));

-- ── Feature flags: the TENANT READS its own (the sidebar needs it in Phase 6)
--    but must never write them — a tenant that can flip its own flags has
--    bought nothing.
DROP POLICY IF EXISTS org_features_read ON public.organization_features;
CREATE POLICY org_features_read ON public.organization_features
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS org_features_manage ON public.organization_features;
CREATE POLICY org_features_manage ON public.organization_features
  FOR ALL TO authenticated
  USING (public.platform_can('feature_flags.manage'))
  WITH CHECK (public.platform_can('feature_flags.manage'));

DROP POLICY IF EXISTS ffa_read ON public.feature_flag_assignments;
CREATE POLICY ffa_read ON public.feature_flag_assignments
  FOR SELECT TO authenticated
  USING (public.platform_can('audit.read') OR public.platform_can('feature_flags.manage'));

-- ── Reserved tables: read policies now, write deferred to their own phase.
DROP POLICY IF EXISTS invoices_read ON public.invoices;
CREATE POLICY invoices_read ON public.invoices
  FOR SELECT TO authenticated
  USING (public.platform_can('billing.read') OR organization_id = public.current_org_id());

DROP POLICY IF EXISTS invoices_manage ON public.invoices;
CREATE POLICY invoices_manage ON public.invoices
  FOR ALL TO authenticated
  USING (public.platform_can('billing.manage'))
  WITH CHECK (public.platform_can('billing.manage'));

DROP POLICY IF EXISTS invoice_lines_read ON public.invoice_lines;
CREATE POLICY invoice_lines_read ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                  WHERE i.id = invoice_id
                    AND (public.platform_can('billing.read')
                         OR i.organization_id = public.current_org_id())));

DROP POLICY IF EXISTS org_invitations_rw ON public.organization_invitations;
CREATE POLICY org_invitations_rw ON public.organization_invitations
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id() AND public.has_any_role(ARRAY['admin','management']));

DROP POLICY IF EXISTS org_activity_read ON public.organization_activity;
CREATE POLICY org_activity_read ON public.organization_activity
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('audit.read'));

DROP POLICY IF EXISTS org_activity_insert ON public.organization_activity;
CREATE POLICY org_activity_insert ON public.organization_activity
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS platform_notifications_read ON public.platform_notifications;
CREATE POLICY platform_notifications_read ON public.platform_notifications
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS platform_notifications_manage ON public.platform_notifications;
CREATE POLICY platform_notifications_manage ON public.platform_notifications
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));

DROP POLICY IF EXISTS announcements_read ON public.platform_announcements;
CREATE POLICY announcements_read ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (public.is_platform_admin()
         OR (is_published AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())));

DROP POLICY IF EXISTS announcements_manage ON public.platform_announcements;
CREATE POLICY announcements_manage ON public.platform_announcements
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));

-- Non-secret settings are readable by tenants (maintenance banner); secrets
-- are never readable over PostgREST at all.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR NOT is_secret);

DROP POLICY IF EXISTS platform_settings_manage ON public.platform_settings;
CREATE POLICY platform_settings_manage ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — seed the plan catalogue
--
-- Pricing from the Product Transformation Blueprint §30. Rows, not code, so
-- sales can add a negotiated plan without a deploy.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.plans
  (code, name, description, tier_order, trial_days, support_level,
   max_students, max_staff, max_branches, max_storage_mb,
   whatsapp_credits, email_credits, ai_credits, api_requests_per_day,
   allow_white_label, allow_custom_domain, allow_marketplace)
VALUES
  ('trial','Free Trial','14-day evaluation',0,14,'community',
   50,5,1,1024, 200,500,0,1000, false,false,false),
  ('starter','Starter','Single-branch institutes getting off spreadsheets',1,14,'email',
   300,15,1,10240, 2000,5000,0,5000, false,false,false),
  ('growth','Growth','Growing institutes with fees, exams and communication',2,14,'email',
   1000,40,1,25600, 10000,25000,0,20000, true,false,false),
  ('professional','Professional','Multi-branch with payroll, CRM and live classes',3,14,'priority',
   5000,200,5,102400, 50000,100000,0,100000, true,true,false),
  ('enterprise','Enterprise','Unlimited scale, SLA and named CSM',4,0,'sla',
   NULL,NULL,NULL,NULL, NULL,NULL,NULL,NULL, true,true,true),
  ('internal','Internal','Smart ARK''s own organizations',99,0,'sla',
   NULL,NULL,NULL,NULL, NULL,NULL,NULL,NULL, true,true,true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_prices (plan_id, currency, interval, amount)
SELECT p.id, 'INR', v.interval, v.amount
  FROM public.plans p
  JOIN (VALUES
    ('starter','yearly',35988.00), ('starter','monthly',3749.00),
    ('growth','yearly',83988.00),  ('growth','monthly',8749.00),
    ('professional','yearly',179988.00), ('professional','monthly',18749.00)
  ) AS v(code, interval, amount) ON v.code = p.code
ON CONFLICT (plan_id, currency, interval) DO NOTHING;

-- Plan → module mapping. Keys are RBAC ModuleIds.
-- certificate / website / ai are seeded FALSE on every tier, including
-- enterprise: they are not built (certificates is 94 lines, there is no CMS
-- and no AI in the product). Selling them would be a refund event.
INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, f.key, f.enabled
  FROM public.plans p
  CROSS JOIN LATERAL (VALUES
    ('student',        true),
    ('attendance',     true),
    ('setup',          true),
    ('settings',       true),
    ('staff_user',     true),
    ('reports',        p.tier_order >= 1),
    ('fee',            p.tier_order >= 1),
    ('exam',           p.tier_order >= 2),
    ('whatsapp',       p.tier_order >= 2),
    ('enquiry_leads',  p.tier_order >= 3),
    ('payroll',        p.tier_order >= 3),
    ('live_class',     p.tier_order >= 3),
    ('estudy',         p.tier_order >= 3),
    ('expense_income', p.tier_order >= 3),
    ('tasks',          p.tier_order >= 2),
    ('academics',      p.tier_order >= 2),
    ('authentication', true),
    ('help',           true),
    ('certificate',    false),
    ('website',        false),
    ('ai',             false)
  ) AS f(key, enabled)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ARK keeps the internal plan — it is not a paying customer of itself.
INSERT INTO public.subscriptions (organization_id, plan_id, status, interval, amount, auto_renew)
SELECT o.id, p.id, 'active', 'yearly', 0, true
  FROM public.organizations o CROSS JOIN public.plans p
 WHERE o.slug = 'ark' AND p.code = 'internal'
   AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id);

NOTIFY pgrst, 'reload schema';
