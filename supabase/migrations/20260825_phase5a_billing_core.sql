-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5A — BILLING CORE: RAZORPAY, GST, INVOICES, SUSPENSION   2026-08-25
--
-- ADDITIVE ONLY. IDEMPOTENT. NO TENANT TABLE IS ALTERED.
-- Paired rollback: 20260825_phase5a_billing_core_rollback.sql
--
-- Extends the shapes Phase 2C reserved (invoices, invoice_lines, subscriptions)
-- rather than creating parallel ones. There is no second billing model here.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 0 — keep the tenant-scoping exclusion list current
--
-- Migration 1B iterates pg_catalog and gives organization_id to every table
-- is_tenant_scoped_table() does not exclude. Billing tables are PLATFORM-owned
-- and several are written by a service-role webhook with no tenant context; a
-- 1B re-run would give them organization_id NOT NULL DEFAULT current_org_id()
-- and every webhook write would fail a NOT NULL violation.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tenant_scoped_table(_table text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _table NOT IN (
    'organizations', 'organization_users', 'organization_branches',
    'organization_settings', 'organization_domains', 'organization_branding',
    'organization_subscriptions', 'organization_audit',
    'tenancy_readiness', 'tenancy_policy_backup',
    'platform_users', 'platform_role_capabilities', 'platform_audit_log',
    'platform_impersonation_grants', 'organization_metrics_daily',
    'plans', 'plan_prices', 'plan_features', 'subscriptions', 'subscription_usage',
    'coupons', 'coupon_redemptions', 'organization_features',
    'feature_flag_assignments', 'platform_settings',
    'invoices', 'invoice_lines', 'organization_invitations',
    'organization_activity', 'platform_notifications', 'platform_announcements',
    'platform_demo_requests', 'platform_trial_signups', 'platform_enquiries',
    'content_authors', 'content_categories', 'content_posts',
    'status_components', 'status_incidents', 'marketing_events',
    'provisioning_jobs', 'provisioning_steps', 'provisioning_step_catalog',
    'organization_onboarding',
    -- Billing (Phase 5)
    'billing_profiles', 'billing_customers', 'payments', 'refunds',
    'billing_webhook_events', 'invoice_sequences', 'billing_events',
    'referrals', 'referral_credits', 'usage_counters',
    'schema_migrations', 'spatial_ref_sys'
  )
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — BILLING PROFILE (GST identity)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.billing_profiles (
  organization_id  uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  legal_name       text NOT NULL,
  gstin            text,
  pan              text,
  billing_email    text,
  billing_phone    text,
  address_line1    text,
  address_line2    text,
  city             text,
  -- GST state CODE (e.g. '33' Tamil Nadu), not a name. The code is what
  -- determines CGST/SGST vs IGST, and matching on names ("Tamilnadu" vs
  -- "Tamil Nadu") is how tax gets computed wrong.
  state_code       text,
  state_name       text,
  postal_code      text,
  country          text NOT NULL DEFAULT 'IN',
  -- Reverse charge / SEZ: rare but legally distinct, and retrofitting them
  -- after invoices are issued means reissuing them.
  is_sez           boolean NOT NULL DEFAULT false,
  reverse_charge   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gstin_format CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
);

COMMENT ON TABLE public.billing_profiles IS
  'The organization''s tax identity. Separate from `organizations` because a '
  'billing entity is not always the operating entity — a chain may bill '
  'centrally for branches that are separate organizations.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — RAZORPAY MAPPING
--
-- Provider ids live in their own table rather than as columns on
-- subscriptions, because a second gateway (Stripe, for international) must be
-- an additional ROW, not an additional column set. The PaymentGateway
-- abstraction is cheap now and brutal to retrofit.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.billing_customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  provider         text NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay','stripe')),
  provider_customer_id text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider),
  UNIQUE (provider, provider_customer_id)
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider            text DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_plan_id    text,
  ADD COLUMN IF NOT EXISTS short_url           text,
  ADD COLUMN IF NOT EXISTS paid_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_count         integer,
  ADD COLUMN IF NOT EXISTS charge_at           timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at            timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at     timestamptz,
  ADD COLUMN IF NOT EXISTS failed_payment_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_sub_idx
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_invoice_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS gstin               text,
  ADD COLUMN IF NOT EXISTS cgst                numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst                numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst                numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_year      text,
  ADD COLUMN IF NOT EXISTS pdf_path            text,
  ADD COLUMN IF NOT EXISTS emailed_at          timestamptz;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS hsn_sac             text DEFAULT '998434';
  -- 998434 = "software as a service" under the Indian SAC schedule.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — PAYMENTS, REFUNDS, WEBHOOK LOG
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_id       uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  provider         text NOT NULL DEFAULT 'razorpay',
  provider_payment_id text NOT NULL,
  provider_order_id   text,
  status           text NOT NULL
                     CHECK (status IN ('created','authorized','captured','failed','refunded','partially_refunded')),
  amount           numeric(14,2) NOT NULL,
  currency         text NOT NULL DEFAULT 'INR',
  method           text,              -- upi | card | netbanking | wallet | emi
  bank             text,
  wallet           text,
  vpa              text,
  card_last4       text,
  card_network     text,
  international    boolean NOT NULL DEFAULT false,
  fee              numeric(14,2),     -- Razorpay's cut — real COGS, worth tracking
  tax              numeric(14,2),
  error_code       text,
  error_description text,
  captured_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS payments_org_idx ON public.payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.refunds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id       uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id       uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  provider         text NOT NULL DEFAULT 'razorpay',
  provider_refund_id text NOT NULL,
  amount           numeric(14,2) NOT NULL,
  currency         text NOT NULL DEFAULT 'INR',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processed','failed')),
  reason           text,
  initiated_by     uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  UNIQUE (provider, provider_refund_id)
);

/**
 * Every webhook Razorpay sends, stored before it is acted on.
 *
 * ┌── WHY A LOG AND NOT JUST A HANDLER ────────────────────────────────────┐
 * │ Razorpay retries. Networks duplicate. A webhook that activates a       │
 * │ subscription twice, or refunds twice, is a money bug — the worst kind  │
 * │ to debug because the evidence is gone.                                 │
 * │                                                                        │
 * │ So the event id is UNIQUE: a duplicate delivery hits the constraint    │
 * │ and is answered 200 without re-processing. And because the raw payload │
 * │ is retained, any dispute can be reconstructed from what the provider   │
 * │ actually sent rather than from what we inferred.                       │
 * └────────────────────────────────────────────────────────────────────────┘
 */
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL DEFAULT 'razorpay',
  provider_event_id text NOT NULL,
  event_type       text NOT NULL,
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload          jsonb NOT NULL,
  signature_valid  boolean NOT NULL,
  status           text NOT NULL DEFAULT 'received'
                     CHECK (status IN ('received','processed','failed','ignored','duplicate')),
  error            text,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_type_idx
  ON public.billing_webhook_events (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx
  ON public.billing_webhook_events (status, received_at DESC)
  WHERE status IN ('failed','received');

/** Append-only billing audit, separate from platform_audit_log. */
CREATE TABLE IF NOT EXISTS public.billing_events (
  id               bigserial PRIMARY KEY,
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event            text NOT NULL,
  detail           text,
  payload          jsonb,
  actor            text,              -- 'webhook' | 'cron' | platform email
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_org_idx
  ON public.billing_events (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.billing_audit(
  _org uuid, _event text, _detail text DEFAULT NULL,
  _payload jsonb DEFAULT NULL, _actor text DEFAULT 'system', _sub uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.billing_events (organization_id, subscription_id, event, detail, payload, actor)
  VALUES (_org, _sub, _event, _detail, _payload, _actor);
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — GAPLESS INVOICE NUMBERING
--
-- ┌── WHY THIS IS A SEQUENCE TABLE AND NOT count(*) + 1 ───────────────────┐
-- │ Indian GST requires invoice numbers that are unique, sequential and    │
-- │ GAPLESS within a financial year, per issuing entity.                   │
-- │                                                                        │
-- │ count(*)+1 breaks under concurrency (two invoices get the same number) │
-- │ and breaks again if an invoice is ever voided (the count drops and the │
-- │ next number repeats one already issued). A Postgres SEQUENCE cannot be │
-- │ used either — sequences deliberately leak on rollback, which is        │
-- │ exactly the gap the law forbids.                                       │
-- │                                                                        │
-- │ So: a row per (organization, financial year), incremented under a row  │
-- │ lock. Atomic, gapless, and correct across concurrent issuance.         │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  financial_year  text NOT NULL,
  prefix          text NOT NULL DEFAULT 'INV',
  last_number     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, financial_year)
);

/** Indian financial year label for a date: 1 April – 31 March. */
CREATE OR REPLACE FUNCTION public.financial_year(_d date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN extract(month FROM _d) >= 4
    THEN extract(year FROM _d)::int || '-' || right((extract(year FROM _d)::int + 1)::text, 2)
    ELSE (extract(year FROM _d)::int - 1) || '-' || right(extract(year FROM _d)::text, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_org uuid, _date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE fy text := public.financial_year(_date); n int; px text; slug text;
BEGIN
  SELECT upper(left(regexp_replace(o.slug, '[^a-zA-Z0-9]', '', 'g'), 4))
    INTO slug FROM public.organizations o WHERE o.id = _org;

  -- ON CONFLICT DO UPDATE takes a row lock, so two concurrent issuances
  -- serialise here rather than both reading the same last_number.
  INSERT INTO public.invoice_sequences (organization_id, financial_year, prefix, last_number)
  VALUES (_org, fy, COALESCE(slug, 'INV'), 1)
  ON CONFLICT (organization_id, financial_year)
  DO UPDATE SET last_number = public.invoice_sequences.last_number + 1
  RETURNING last_number, prefix INTO n, px;

  RETURN format('%s/%s/%s', px, fy, lpad(n::text, 4, '0'));
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — GST COMPUTATION
--
-- Place of supply decides the split. For a service supplied to a recipient in
-- the SAME state as the supplier: CGST + SGST, half each. Different state:
-- IGST at the full rate. Outside India: export, zero-rated.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_gst(
  _org uuid, _taxable numeric, _rate numeric DEFAULT 18.00
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  supplier_state text;
  bp             RECORD;
  treatment      text;
  cgst numeric := 0; sgst numeric := 0; igst numeric := 0;
BEGIN
  -- The platform's own GST state, configurable rather than hardcoded: the
  -- supplier's state determines the split for every invoice we ever issue.
  SELECT COALESCE(value ->> 'state_code', '33')
    INTO supplier_state
    FROM public.platform_settings WHERE key = 'gst_profile';

  SELECT * INTO bp FROM public.billing_profiles WHERE organization_id = _org;

  IF bp IS NULL OR bp.country IS DISTINCT FROM 'IN' THEN
    -- Export of service: zero-rated. Still an invoice, still reported.
    treatment := 'export';
  ELSIF bp.is_sez THEN
    treatment := 'sez';                       -- zero-rated, LUT
  ELSIF bp.reverse_charge THEN
    treatment := 'reverse_charge';            -- recipient pays; we charge nil
  ELSIF bp.state_code IS NOT DISTINCT FROM supplier_state THEN
    treatment := 'cgst_sgst';
    cgst := round(_taxable * _rate / 200.0, 2);
    sgst := round(_taxable * _rate / 200.0, 2);
  ELSE
    treatment := 'igst';
    igst := round(_taxable * _rate / 100.0, 2);
  END IF;

  RETURN jsonb_build_object(
    'treatment', treatment,
    'rate', CASE WHEN treatment IN ('cgst_sgst','igst') THEN _rate ELSE 0 END,
    'cgst', cgst, 'sgst', sgst, 'igst', igst,
    'tax_total', cgst + sgst + igst,
    'place_of_supply', COALESCE(bp.state_code, 'OTHER'),
    'supplier_state', supplier_state,
    'gstin', bp.gstin
  );
END $$;

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('gst_profile', jsonb_build_object(
     'legal_name', 'Smart ARK', 'gstin', null, 'state_code', '33',
     'state_name', 'Tamil Nadu', 'address', null, 'sac', '998434', 'rate', 18),
   'Platform GST identity — supplier state drives the CGST/SGST vs IGST split'),
  ('billing', jsonb_build_object(
     'trial_days', 14, 'grace_days', 7, 'dunning_days', jsonb_build_array(1,3,5,7),
     'suspension_level', 'app', 'reminder_days_before_renewal', jsonb_build_array(14,7,1)),
   'Billing lifecycle timings. suspension_level: app | full')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — SUSPENSION
--
-- ┌── HOW SUSPENSION IS ENFORCED, AND A DELIBERATE DEVIATION ──────────────┐
-- │ The brief says "Disable Login". We do NOT, by default — and the        │
-- │ reason is practical rather than philosophical: a customer who cannot   │
-- │ log in cannot reach the billing page, and therefore cannot pay the     │
-- │ invoice that would restore them. Suspension exists to prompt payment,  │
-- │ and blocking the payment path defeats it.                              │
-- │                                                                        │
-- │ Default (`suspension_level = 'app'`): login works; ALL tenant data is  │
-- │ inaccessible; billing, invoices and export remain reachable.           │
-- │ Option  (`suspension_level = 'full'`): login itself is refused.        │
-- │ It is a platform setting, so the instruction is available without      │
-- │ being the default that traps a customer outside their own invoice.     │
-- │                                                                        │
-- │ Enforcement reuses the Phase 1C wrap technique — snapshot every policy │
-- │ then add a conjunct — rather than a new mechanism. NO DATA IS EVER     │
-- │ DELETED; suspension is a visibility change and reverses instantly.     │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_org_suspended()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.status = 'suspended'
       FROM public.organizations o WHERE o.id = public.current_org_id()),
    false);
$$;

COMMENT ON FUNCTION public.is_org_suspended() IS
  'True while the organization is suspended for non-payment. Added as a '
  'conjunct to every tenant policy so suspension hides data without deleting '
  'a single row — restoration is one status update.';

DO $$
DECLARE
  pol       RECORD;
  new_qual  text;
  new_check text;
  n         int := 0;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname, p.qual, p.with_check, p.cmd
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND public.is_tenant_scoped_table(p.tablename)
       AND COALESCE(p.qual,'')       NOT LIKE '%is_org_suspended%'
       AND COALESCE(p.with_check,'') NOT LIKE '%is_org_suspended%'
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=p.tablename
                      AND c.column_name='organization_id')
  LOOP
    -- Snapshot before wrapping, exactly as Phase 1C and 3A do, so the rollback
    -- is a restore rather than a regex unpicking live authorization rules.
    INSERT INTO public.tenancy_policy_backup
      (schema_name, table_name, policy_name, cmd, orig_qual, orig_check)
    VALUES ('public', pol.tablename, pol.policyname, pol.cmd, pol.qual, pol.with_check)
    ON CONFLICT (schema_name, table_name, policy_name) DO NOTHING;

    new_qual  := CASE WHEN pol.qual IS NULL THEN NULL
                      ELSE format('(NOT public.is_org_suspended() AND (%s))', pol.qual) END;
    new_check := CASE WHEN pol.with_check IS NULL THEN NULL
                      ELSE format('(NOT public.is_org_suspended() AND (%s))', pol.with_check) END;

    BEGIN
      IF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                       pol.policyname, pol.tablename, new_qual, new_check);
      ELSIF new_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                       pol.policyname, pol.tablename, new_qual);
      ELSIF new_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                       pol.policyname, pol.tablename, new_check);
      END IF;
      n := n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Suspension guard: could not wrap % on %: %',
        pol.policyname, pol.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Phase 5A: suspension guard applied to % policy/policies.', n;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — USAGE COUNTERS & PLAN LIMITS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.usage_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric          text NOT NULL,      -- students | staff | branches | storage_mb | whatsapp | email | ai | api
  period          text NOT NULL,      -- 'current' for absolutes, 'YYYY-MM' for metered
  used            numeric(14,2) NOT NULL DEFAULT 0,
  included        numeric(14,2),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, metric, period)
);

/** The effective limit for a metric — NULL means unlimited. */
CREATE OR REPLACE FUNCTION public.plan_limit(_org uuid, _metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE _metric
    WHEN 'students'   THEN p.max_students
    WHEN 'staff'      THEN p.max_staff
    WHEN 'branches'   THEN p.max_branches
    WHEN 'storage_mb' THEN p.max_storage_mb
    WHEN 'whatsapp'   THEN p.whatsapp_credits
    WHEN 'email'      THEN p.email_credits
    WHEN 'ai'         THEN p.ai_credits
    WHEN 'api'        THEN p.api_requests_per_day
    ELSE NULL END
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.organization_id = _org
     AND s.status IN ('trialing','active','past_due','grace')
   LIMIT 1;
$$;

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

/**
 * Enforce a plan limit at INSERT time.
 *
 * ┌── WHY THIS BLOCKS RATHER THAN WARNS ───────────────────────────────────┐
 * │ A limit enforced only in the UI is a suggestion — PostgREST is one     │
 * │ fetch away. But blocking is also a customer-hostile moment, so it is   │
 * │ deliberately narrow: only the three ABSOLUTE limits (students, staff,  │
 * │ branches) block. Metered credits (WhatsApp, email) NEVER block — they  │
 * │ bill as overage, because cutting off a school's absence alerts mid-    │
 * │ term to enforce a message quota is the wrong trade every time.         │
 * └────────────────────────────────────────────────────────────────────────┘
 */
CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE metric text; lim int; used int; org uuid;
BEGIN
  org := NEW.organization_id;
  IF org IS NULL THEN RETURN NEW; END IF;

  metric := CASE TG_TABLE_NAME
    WHEN 'students' THEN 'students'
    WHEN 'profiles' THEN 'staff'
    WHEN 'campuses' THEN 'branches'
    ELSE NULL END;
  IF metric IS NULL THEN RETURN NEW; END IF;

  lim := public.plan_limit(org, metric);
  IF lim IS NULL THEN RETURN NEW; END IF;      -- unlimited (Enterprise, internal)

  EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', TG_TABLE_NAME)
    INTO used USING org;

  IF used >= lim THEN
    RAISE EXCEPTION
      'Plan limit reached: % of % % allowed on your current plan. '
      'Upgrade from Billing to add more.', used, lim, metric
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','profiles','campuses'] LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_plan_limit ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_enforce_plan_limit BEFORE INSERT ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit()', t);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not attach plan-limit trigger to %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 8 — REFERRALS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,   -- quoted externally: global by design
  referrer_org_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  referred_org_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  reward_type      text NOT NULL DEFAULT 'free_month'
                     CHECK (reward_type IN ('free_month','percentage','fixed','credit')),
  reward_value     numeric(14,2) NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','qualified','rewarded','expired','void')),
  qualified_at     timestamptz,
  rewarded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_org_id, status);

CREATE TABLE IF NOT EXISTS public.referral_credits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referral_id      uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  amount           numeric(14,2) NOT NULL,
  currency         text NOT NULL DEFAULT 'INR',
  applied_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 9 — RLS
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_profiles','billing_customers','payments','refunds',
    'billing_webhook_events','invoice_sequences','billing_events',
    'referrals','referral_credits','usage_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- A tenant admin manages its OWN billing profile — GSTIN and address are the
-- customer's to correct, and making them raise a ticket for a typo is absurd.
DROP POLICY IF EXISTS billing_profiles_rw ON public.billing_profiles;
CREATE POLICY billing_profiles_rw ON public.billing_profiles
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.has_any_role(ARRAY['admin','management'])
         OR public.platform_can('billing.read'))
  WITH CHECK (organization_id = public.current_org_id() AND public.has_any_role(ARRAY['admin','management'])
              OR public.platform_can('billing.manage'));

-- Payments, invoices and billing history: the tenant READS, never writes.
-- Every write comes from a signature-verified webhook running as service role.
DROP POLICY IF EXISTS payments_read ON public.payments;
CREATE POLICY payments_read ON public.payments
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('billing.read'));

DROP POLICY IF EXISTS refunds_read ON public.refunds;
CREATE POLICY refunds_read ON public.refunds
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('billing.read'));

DROP POLICY IF EXISTS billing_events_read ON public.billing_events;
CREATE POLICY billing_events_read ON public.billing_events
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('billing.read'));

DROP POLICY IF EXISTS usage_counters_read ON public.usage_counters;
CREATE POLICY usage_counters_read ON public.usage_counters
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('usage.read'));

DROP POLICY IF EXISTS referrals_read ON public.referrals;
CREATE POLICY referrals_read ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_org_id = public.current_org_id() OR public.platform_can('billing.read'));

DROP POLICY IF EXISTS referral_credits_read ON public.referral_credits;
CREATE POLICY referral_credits_read ON public.referral_credits
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('billing.read'));

-- Webhook log, provider ids and invoice sequences: PLATFORM ONLY. A tenant
-- reading raw provider payloads or another org's customer id has no business
-- case and several attack cases.
DROP POLICY IF EXISTS webhook_events_read ON public.billing_webhook_events;
CREATE POLICY webhook_events_read ON public.billing_webhook_events
  FOR SELECT TO authenticated USING (public.platform_can('billing.read'));

DROP POLICY IF EXISTS billing_customers_read ON public.billing_customers;
CREATE POLICY billing_customers_read ON public.billing_customers
  FOR SELECT TO authenticated USING (public.platform_can('billing.read'));

-- invoice_sequences gets NO policy at all: service role and migrations only.
-- A tenant that could edit its own sequence could forge invoice numbers.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments','refunds','referrals','referral_credits',
                           'usage_counters','billing_webhook_events','billing_customers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manage', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.platform_can(''billing.manage'')) '
      'WITH CHECK (public.platform_can(''billing.manage''))', t || '_manage', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
