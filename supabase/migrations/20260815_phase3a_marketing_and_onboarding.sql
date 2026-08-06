-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 3A — PUBLIC WEBSITE, CMS, ONBOARDING & DEMO MODE          2026-08-15
--
-- ADDITIVE ONLY. IDEMPOTENT. NO TENANT TABLE IS ALTERED.
-- Paired rollback: 20260815_phase3a_marketing_and_onboarding_rollback.sql
--
-- ┌── THE SECURITY PROBLEM THIS PHASE CREATES, AND HOW IT IS HANDLED ──────┐
-- │ Everything before now assumed an authenticated caller. Phase 3 opens   │
-- │ the front door: anonymous visitors write demo requests and trial       │
-- │ signups, and anonymous crawlers read plans and blog posts.             │
-- │                                                                        │
-- │ Every `TO anon` policy below is therefore either                       │
-- │   • INSERT-ONLY with no SELECT (write-only mailbox), or                │
-- │   • SELECT over data that is PUBLISHED BY DEFINITION (plans, posts).   │
-- │                                                                        │
-- │ There is no anon policy that can read a submitted form back. A         │
-- │ competitor must not be able to enumerate our sales pipeline, and a     │
-- │ readable-back demo table is exactly how that happens.                  │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 0 — EXCLUDE THE NEW PLATFORM TABLES FROM TENANT SCOPING
--
-- ┌── A LATENT BUG THIS PREVENTS ──────────────────────────────────────────┐
-- │ Migration 1B does not list tables; it iterates pg_catalog and adds     │
-- │ organization_id to EVERYTHING that is_tenant_scoped_table() does not   │
-- │ exclude. That design is what makes it robust to unapplied migrations   │
-- │ and to future modules — and it means every new platform-owned table    │
-- │ MUST be added to the exclusion list.                                   │
-- │                                                                        │
-- │ Without this part, re-running 1B (it is idempotent and re-running is   │
-- │ the documented recovery step) would give marketing_events an           │
-- │ `organization_id NOT NULL DEFAULT current_org_id()`. An anonymous      │
-- │ visitor has no organization context, so current_org_id() returns NULL  │
-- │ and EVERY page-view insert would fail a NOT NULL violation. The public │
-- │ website would silently stop recording anything.                        │
-- │                                                                        │
-- │ Same for the CMS and status tables: content is platform-owned, not     │
-- │ tenant data, and scoping it would hide every blog post from anon.      │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tenant_scoped_table(_table text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _table NOT IN (
    -- Tenant spine (Phase 1A)
    'organizations', 'organization_users', 'organization_branches',
    'organization_settings', 'organization_domains', 'organization_branding',
    'organization_subscriptions', 'organization_audit',
    -- Tenancy machinery (Phase 1B/1C)
    'tenancy_readiness', 'tenancy_policy_backup',
    -- Control plane (Phase 2)
    'platform_users', 'platform_role_capabilities', 'platform_audit_log',
    'platform_impersonation_grants', 'organization_metrics_daily',
    'plans', 'plan_prices', 'plan_features', 'subscriptions', 'subscription_usage',
    'coupons', 'coupon_redemptions', 'organization_features',
    'feature_flag_assignments', 'platform_settings',
    'invoices', 'invoice_lines', 'organization_invitations',
    'organization_activity', 'platform_notifications', 'platform_announcements',
    -- Public website (Phase 3) — platform-owned, and marketing_events in
    -- particular is written by ANONYMOUS visitors who have no organization.
    'platform_demo_requests', 'platform_trial_signups', 'platform_enquiries',
    'content_authors', 'content_categories', 'content_posts',
    'status_components', 'status_incidents', 'marketing_events',
    -- Postgres / Supabase bookkeeping
    'schema_migrations', 'spatial_ref_sys'
  )
$$;

COMMENT ON FUNCTION public.is_tenant_scoped_table(text) IS
  'Single source of truth for "must this table carry organization_id?". Every '
  'new PLATFORM-owned table must be added here, or a re-run of migration 1B '
  'will scope it to a tenant that its callers do not have.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — DEMAND CAPTURE
--
-- WHY NOT REUSE public.leads: that table is TENANT-scoped (organization_id
-- NOT NULL since Phase 1B). A demo request is a prospect for SMART ARK, which
-- is not an organization and has no tenant to attribute the row to. Forcing
-- one would mean inventing a fake "platform tenant" whose rows every tenant
-- policy then has to special-case. Separate table, different owner — this is
-- not duplication, it is a different entity.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_demo_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text NOT NULL,
  phone             text,
  organization_name text,
  institution_type  text,
  student_count     text,          -- a band ("500-1000"), not a number: nobody knows exactly
  country           text DEFAULT 'IN',
  preferred_date    date,
  preferred_time    text,
  message           text,
  source            text DEFAULT 'website',
  utm               jsonb,
  status            text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','contacted','scheduled','completed','no_show','disqualified')),
  assigned_to       uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_requests_status_idx
  ON public.platform_demo_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_requests_email_idx
  ON public.platform_demo_requests (lower(email));

-- Trial signups. Tracks the funnel BEFORE an organization exists, so a
-- half-completed wizard is visible instead of vanishing.
CREATE TABLE IF NOT EXISTS public.platform_trial_signups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  name              text,
  organization_name text,
  institution_type  text,
  country           text DEFAULT 'IN',
  plan_code         text,
  -- Funnel stages. `provisioned` is terminal-success; anything else that stops
  -- moving is a drop-off worth a human following up.
  stage             text NOT NULL DEFAULT 'started'
                      CHECK (stage IN ('started','verified','details','provisioning','provisioned','failed','abandoned')),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  failure_reason    text,
  utm               jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_signups_stage_idx
  ON public.platform_trial_signups (stage, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS trial_signups_email_open_idx
  ON public.platform_trial_signups (lower(email))
  WHERE stage NOT IN ('provisioned','abandoned','failed');

-- Contact / careers / partner enquiries. One table with a `kind` rather than
-- three near-identical ones.
CREATE TABLE IF NOT EXISTS public.platform_enquiries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL DEFAULT 'contact'
               CHECK (kind IN ('contact','partner','careers','press','support')),
  name       text NOT NULL,
  email      text NOT NULL,
  phone      text,
  subject    text,
  message    text NOT NULL,
  metadata   jsonb,
  status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled','spam')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_enquiries_idx
  ON public.platform_enquiries (kind, status, created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — CONTENT (blog, help centre, docs)
--
-- A real CMS schema rather than hardcoded MDX: marketing must be able to
-- publish without a deploy, which is the entire point of the content engine
-- in the go-to-market plan.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.content_authors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  role       text,
  bio        text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  -- One table serves blog, help centre and docs; `kind` keeps them apart
  -- without three parallel schemas that would drift.
  kind        text NOT NULL DEFAULT 'blog' CHECK (kind IN ('blog','help','docs')),
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.content_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL,
  kind          text NOT NULL DEFAULT 'blog' CHECK (kind IN ('blog','help','docs')),
  category_id   uuid REFERENCES public.content_categories(id) ON DELETE SET NULL,
  author_id     uuid REFERENCES public.content_authors(id) ON DELETE SET NULL,
  title         text NOT NULL,
  excerpt       text,
  body          text,                       -- markdown
  cover_url     text,
  tags          text[] DEFAULT '{}',
  reading_minutes integer,
  -- SEO overrides. Absent values fall back to title/excerpt at render time,
  -- so a post is never published with an empty <title>.
  seo_title     text,
  seo_description text,
  og_image_url  text,
  is_published  boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS content_posts_published_idx
  ON public.content_posts (kind, published_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS content_posts_tags_idx
  ON public.content_posts USING gin (tags);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — PUBLIC STATUS PAGE
--
-- Deliberately NOT backed by platform_system_health(): that function gates on
-- platform_can('health.read') and exposes connection counts and queue depth —
-- operational detail that tells an attacker when we are struggling. The public
-- page shows a curated state per component, set by us.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.status_components (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'operational'
                CHECK (status IN ('operational','degraded','partial_outage','major_outage','maintenance')),
  sort_order  integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.status_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text,
  severity    text NOT NULL DEFAULT 'minor'
                CHECK (severity IN ('minor','major','critical','maintenance')),
  status      text NOT NULL DEFAULT 'investigating'
                CHECK (status IN ('investigating','identified','monitoring','resolved')),
  components  text[] DEFAULT '{}',
  started_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by  uuid REFERENCES public.platform_users(id) ON DELETE SET NULL
);

INSERT INTO public.status_components (key, name, description, sort_order) VALUES
  ('app',       'Web Application', 'The ERP and parent portal',        1),
  ('api',       'API',             'Data access layer',                2),
  ('database',  'Database',        'Primary datastore',                3),
  ('storage',   'File Storage',    'Documents, receipts, payslips',    4),
  ('realtime',  'Realtime',        'Live dashboard updates',           5),
  ('whatsapp',  'WhatsApp',        'Outbound WhatsApp delivery',       6),
  ('email',     'Email',           'Transactional email delivery',     7),
  ('jobs',      'Background Jobs', 'Scheduled and queued work',        8)
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — WEBSITE ANALYTICS
--
-- First-party, cookieless, no third-party script. Under India's DPDP Act a
-- cookie-based tracker on a site aimed at institutions handling minors' data
-- is a consent conversation nobody wants; an aggregate page-view counter with
-- no personal identifier avoids it entirely.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketing_events (
  id          bigserial PRIMARY KEY,
  event       text NOT NULL,          -- 'page_view' | 'cta_click' | 'trial_start' | …
  path        text,
  referrer    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  -- Deliberately NO ip_address, NO user_agent, NO cookie id, NO fingerprint.
  -- A daily bucket plus a coarse device class is enough to answer "is the site
  -- working", and cannot identify a person.
  device      text,
  event_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_events_idx
  ON public.marketing_events (event_date DESC, event);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — DEMO ORGANIZATION (read-only)
--
-- ┌── HOW READ-ONLY IS ENFORCED ───────────────────────────────────────────┐
-- │ A demo where visitors can edit is a demo that is vandalised within a   │
-- │ week. Enforcing it in the UI is not enough — PostgREST is one fetch    │
-- │ away.                                                                  │
-- │                                                                        │
-- │ So every WRITE policy gains `AND NOT is_demo_org()`, using the exact   │
-- │ wrap technique proven in Phase 1C, with the same backup table so the   │
-- │ rollback is a lossless restore rather than a regex.                    │
-- │                                                                        │
-- │ For ARK and every real tenant is_demo_org() is FALSE, so the added     │
-- │ conjunct is a no-op and behaviour is byte-for-byte unchanged.          │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_demo IS
  'Read-only showcase tenant. Every write policy carries AND NOT is_demo_org().';

CREATE OR REPLACE FUNCTION public.is_demo_org()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.is_demo FROM public.organizations o WHERE o.id = public.current_org_id()),
    false
  );
$$;

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
       -- Write commands only. A demo visitor must still be able to READ.
       AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
       AND COALESCE(p.qual,'')       NOT LIKE '%is_demo_org%'
       AND COALESCE(p.with_check,'') NOT LIKE '%is_demo_org%'
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=p.tablename
                      AND c.column_name='organization_id')
  LOOP
    -- Snapshot before wrapping, exactly as Phase 1C does, so the rollback is a
    -- restore and not an attempt to unpick an expression with a regex.
    INSERT INTO public.tenancy_policy_backup
      (schema_name, table_name, policy_name, cmd, orig_qual, orig_check)
    VALUES ('public', pol.tablename, pol.policyname, pol.cmd, pol.qual, pol.with_check)
    ON CONFLICT (schema_name, table_name, policy_name) DO NOTHING;

    new_qual  := CASE WHEN pol.qual IS NULL THEN NULL
                      ELSE format('(NOT public.is_demo_org() AND (%s))', pol.qual) END;
    new_check := CASE WHEN pol.with_check IS NULL THEN NULL
                      ELSE format('(NOT public.is_demo_org() AND (%s))', pol.with_check) END;

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
      RAISE WARNING 'Demo guard: could not wrap % on %: %', pol.policyname, pol.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Phase 3A: demo write-guard applied to % policy/policies.', n;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — RLS
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_demo_requests','platform_trial_signups','platform_enquiries',
    'content_authors','content_categories','content_posts',
    'status_components','status_incidents','marketing_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── Demand capture: WRITE-ONLY for the public ───────────────────────────────
-- INSERT with no SELECT. An anonymous visitor can post a demo request and can
-- never read one back — otherwise a competitor could enumerate our entire
-- sales pipeline with a single curl.
DROP POLICY IF EXISTS demo_requests_public_insert ON public.platform_demo_requests;
CREATE POLICY demo_requests_public_insert ON public.platform_demo_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS demo_requests_platform_read ON public.platform_demo_requests;
CREATE POLICY demo_requests_platform_read ON public.platform_demo_requests
  FOR SELECT TO authenticated USING (public.platform_can('organizations.read'));

DROP POLICY IF EXISTS demo_requests_platform_manage ON public.platform_demo_requests;
CREATE POLICY demo_requests_platform_manage ON public.platform_demo_requests
  FOR UPDATE TO authenticated
  USING (public.platform_can('support.manage'))
  WITH CHECK (public.platform_can('support.manage'));

DROP POLICY IF EXISTS enquiries_public_insert ON public.platform_enquiries;
CREATE POLICY enquiries_public_insert ON public.platform_enquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS enquiries_platform_read ON public.platform_enquiries;
CREATE POLICY enquiries_platform_read ON public.platform_enquiries
  FOR SELECT TO authenticated USING (public.platform_can('organizations.read'));

-- Trial signups are written ONLY by the onboarding edge function (service
-- role). No anon policy at all: a self-service INSERT here would let anyone
-- forge funnel records and, worse, probe which emails are already registered.
DROP POLICY IF EXISTS trial_signups_platform_read ON public.platform_trial_signups;
CREATE POLICY trial_signups_platform_read ON public.platform_trial_signups
  FOR SELECT TO authenticated USING (public.platform_can('organizations.read'));

-- ── Content: published rows are public; drafts are not ──────────────────────
DROP POLICY IF EXISTS content_posts_public_read ON public.content_posts;
CREATE POLICY content_posts_public_read ON public.content_posts
  FOR SELECT TO anon, authenticated
  USING (is_published AND (published_at IS NULL OR published_at <= now()));

DROP POLICY IF EXISTS content_posts_manage ON public.content_posts;
CREATE POLICY content_posts_manage ON public.content_posts
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_authors','content_categories',
                           'status_components','status_incidents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
                   t || '_public_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manage', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.platform_can(''settings.manage'')) '
      'WITH CHECK (public.platform_can(''settings.manage''))', t || '_manage', t);
  END LOOP;
END $$;

-- ── Analytics: append-only from the public, readable by the platform ────────
DROP POLICY IF EXISTS marketing_events_insert ON public.marketing_events;
CREATE POLICY marketing_events_insert ON public.marketing_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS marketing_events_read ON public.marketing_events;
CREATE POLICY marketing_events_read ON public.marketing_events
  FOR SELECT TO authenticated USING (public.platform_can('usage.read'));

-- ── Public plan catalogue ───────────────────────────────────────────────────
-- The pricing page must render for a logged-out visitor. Phase 2C restricted
-- plans to platform users OR a tenant; extend to anon for PUBLIC plans only —
-- negotiated/custom plans stay hidden.
DROP POLICY IF EXISTS plans_anon_read ON public.plans;
CREATE POLICY plans_anon_read ON public.plans
  FOR SELECT TO anon USING (is_public AND is_active);

DROP POLICY IF EXISTS plan_prices_anon_read ON public.plan_prices;
CREATE POLICY plan_prices_anon_read ON public.plan_prices
  FOR SELECT TO anon
  USING (is_active AND EXISTS (SELECT 1 FROM public.plans p
                                WHERE p.id = plan_id AND p.is_public AND p.is_active));

DROP POLICY IF EXISTS plan_features_anon_read ON public.plan_features;
CREATE POLICY plan_features_anon_read ON public.plan_features
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.plans p
                  WHERE p.id = plan_id AND p.is_public AND p.is_active));


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — public status summary
--
-- One RPC so the status page is a single round trip and cannot be turned into
-- an operational probe by varying query parameters.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.public_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'overall', CASE
      WHEN EXISTS (SELECT 1 FROM public.status_components WHERE status = 'major_outage') THEN 'major_outage'
      WHEN EXISTS (SELECT 1 FROM public.status_components WHERE status = 'partial_outage') THEN 'partial_outage'
      WHEN EXISTS (SELECT 1 FROM public.status_components WHERE status = 'degraded') THEN 'degraded'
      WHEN EXISTS (SELECT 1 FROM public.status_components WHERE status = 'maintenance') THEN 'maintenance'
      ELSE 'operational' END,
    'components', (SELECT jsonb_agg(jsonb_build_object(
                            'key', key, 'name', name, 'description', description,
                            'status', status) ORDER BY sort_order)
                     FROM public.status_components),
    'incidents', (SELECT jsonb_agg(jsonb_build_object(
                            'title', title, 'body', body, 'severity', severity,
                            'status', status, 'started_at', started_at,
                            'resolved_at', resolved_at) ORDER BY started_at DESC)
                    FROM (SELECT * FROM public.status_incidents
                           WHERE started_at > now() - interval '30 days'
                           ORDER BY started_at DESC LIMIT 10) i),
    'generated_at', now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.public_status() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
