-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 6A — WHITE LABEL: INTEGRATIONS, DOMAINS, BRAND ASSETS     2026-09-01
--
-- ADDITIVE ONLY. IDEMPOTENT. NO TENANT TABLE IS ALTERED.
-- Paired rollback: 20260901_phase6a_white_label_core_rollback.sql
--
-- ┌── THE DEFINING RULE OF THIS PHASE ─────────────────────────────────────┐
-- │ EVERY organization uses the PLATFORM's credentials by default —        │
-- │ AiSensy, Brevo, the smartark.ai subdomain. Custom credentials are      │
-- │ OPTIONAL, per provider, and take effect only when explicitly           │
-- │ configured AND verified.                                               │
-- │                                                                        │
-- │ That ordering is what makes this phase safe for ARK: a tenant with no  │
-- │ integration row behaves EXACTLY as it does today, reading the same     │
-- │ Deno.env secrets through the same code path. Nothing changes until     │
-- │ someone opts in.                                                       │
-- │                                                                        │
-- │ It is also the right product default. An institute signing up on       │
-- │ Tuesday cannot have a verified WhatsApp Business account by Wednesday; │
-- │ making them get one before a single message sends would kill           │
-- │ activation. They grow into their own sender, they do not start there.  │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 0 — keep the tenant-scoping exclusion list current
--
-- Migration 1B gives organization_id to every table is_tenant_scoped_table()
-- does not exclude. These carry organization_id EXPLICITLY as part of their
-- own key design, and several are written by service-role functions with no
-- tenant context.
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
    'billing_profiles', 'billing_customers', 'payments', 'refunds',
    'billing_webhook_events', 'invoice_sequences', 'billing_events',
    'referrals', 'referral_credits', 'usage_counters',
    -- White label (Phase 6)
    'organization_integrations', 'organization_secrets', 'brand_assets',
    'organization_themes', 'domain_verifications', 'organization_email_templates',
    'marketplace_items', 'marketplace_installs', 'branding_audit',
    'schema_migrations', 'spatial_ref_sys'
  )
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — PROVIDER INTEGRATIONS (platform default → optional custom)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- 'whatsapp' | 'email' | 'sms'
  channel          text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  provider         text NOT NULL,   -- aisensy | brevo | smtp | ses | mailgun | sendgrid | google | microsoft
  -- THE SWITCH. 'platform' means "use Smart ARK's account" and is the default
  -- for every organization; 'custom' means "use my own", and is honoured ONLY
  -- once verified_at is set.
  mode             text NOT NULL DEFAULT 'platform' CHECK (mode IN ('platform','custom')),
  -- NON-SECRET configuration only: host, port, sender address, display name.
  -- API keys and passwords live in organization_secrets, which no tenant can
  -- read. Putting a password here would expose it over PostgREST to every
  -- admin of the organization AND to anyone who later widens a policy.
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  verified_at      timestamptz,
  verification_error text,
  last_used_at     timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel)
);

COMMENT ON TABLE public.organization_integrations IS
  'Per-organization provider choice. Absence of a row, or mode = platform, '
  'means the platform credentials in Deno.env are used — which is the default '
  'for every organization and the reason existing tenants are unaffected.';

/**
 * Secrets.
 *
 * ┌── WHY A SEPARATE TABLE WITH NO TENANT POLICY ──────────────────────────┐
 * │ organization_integrations is readable by the organization's own admins │
 * │ so they can see which sender is configured. An API key must NOT be     │
 * │ in that table: PostgREST would serve it to every one of those admins,  │
 * │ and to anyone who later widens a policy by accident.                   │
 * │                                                                        │
 * │ This table has RLS enabled and NO POLICIES AT ALL — the service role   │
 * │ is the only reader, which in practice means the edge functions. Values │
 * │ are additionally encrypted at rest by the platform.                    │
 * │                                                                        │
 * │ `vault_secret_id` is the upgrade path: when Supabase Vault is adopted, │
 * │ the ciphertext moves there and `value` is nulled, with no schema       │
 * │ change at any call site.                                               │
 * └────────────────────────────────────────────────────────────────────────┘
 */
CREATE TABLE IF NOT EXISTS public.organization_secrets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key              text NOT NULL,          -- 'aisensy_api_key' | 'smtp_password' | …
  value            text,                   -- service-role readable ONLY
  vault_secret_id  uuid,                   -- reserved: Supabase Vault migration
  -- Shown in the UI instead of the value, so an admin can confirm WHICH key is
  -- configured without the key ever leaving the server.
  hint             text,
  updated_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

/**
 * Resolve the effective integration for a channel.
 *
 * Returns mode='platform' when there is no row, when mode is 'platform', when
 * the integration is inactive, or when a 'custom' integration has NOT been
 * verified. That last clause matters most: a half-configured custom SMTP must
 * never silently swallow a school's messages. Unverified falls back.
 *
 * Deliberately returns NO secret. The edge function fetches the secret
 * separately with the service role, so a tenant calling this RPC learns which
 * provider is in use and nothing more.
 */
CREATE OR REPLACE FUNCTION public.resolve_integration(_org uuid, _channel text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE i RECORD;
BEGIN
  SELECT * INTO i FROM public.organization_integrations
   WHERE organization_id = _org AND channel = _channel;

  IF i IS NULL OR i.mode = 'platform' OR NOT i.is_active OR i.verified_at IS NULL THEN
    RETURN jsonb_build_object(
      'mode', 'platform',
      'channel', _channel,
      'reason', CASE
        WHEN i IS NULL THEN 'no integration configured'
        WHEN i.mode = 'platform' THEN 'organization chose platform credentials'
        WHEN NOT i.is_active THEN 'custom integration disabled'
        ELSE 'custom integration not verified' END);
  END IF;

  RETURN jsonb_build_object(
    'mode', 'custom', 'channel', _channel,
    'provider', i.provider, 'config', i.config,
    'integration_id', i.id);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — DOMAINS & DNS VERIFICATION
--
-- Phase 1A created organization_domains; Phase 4 added ssl_status. This adds
-- the verification workflow rather than a second domains table.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_domains
  ADD COLUMN IF NOT EXISTS portal        text
    CHECK (portal IS NULL OR portal IN ('main','admin','management','teacher','parent','student')),
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verifying','verified','failed','suspended','expired')),
  ADD COLUMN IF NOT EXISTS redirect_to   text,
  ADD COLUMN IF NOT EXISTS ssl_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS ssl_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes         text;

/**
 * One DNS check, recorded.
 *
 * A history rather than a status column: "it worked yesterday" is the single
 * most useful fact when a customer's domain breaks, and propagation means the
 * same check legitimately returns different answers minutes apart.
 */
CREATE TABLE IF NOT EXISTS public.domain_verifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id        uuid NOT NULL REFERENCES public.organization_domains(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_type      text NOT NULL CHECK (record_type IN ('TXT','CNAME','A','MX','SPF','DKIM','DMARC')),
  record_name      text NOT NULL,
  expected_value   text NOT NULL,
  observed_value   text,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','verified','mismatch','missing','error')),
  checked_at       timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domain_verifications_domain_idx
  ON public.domain_verifications (domain_id, created_at DESC);

/**
 * Create the DNS records a customer must add for a custom domain.
 *
 * The TXT token is per-domain and unguessable: without it, anyone could point
 * a CNAME at us and claim someone else's hostname.
 */
CREATE OR REPLACE FUNCTION public.request_domain_verification(
  _org uuid, _host text, _portal text DEFAULT 'main'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  dom   uuid;
  token text;
  slug  text;
BEGIN
  IF _org IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('organizations.manage') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF _host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
    RAISE EXCEPTION 'Invalid hostname "%"', _host;
  END IF;
  -- Refuse anything under our own domain: a tenant claiming
  -- "platform.smartark.ai" would be a phishing surface we hosted ourselves.
  IF _host ILIKE '%.smartark.ai' OR _host ILIKE 'smartark.ai' THEN
    RAISE EXCEPTION 'Subdomains of smartark.ai are managed by the platform';
  END IF;

  SELECT o.slug INTO slug FROM public.organizations o WHERE o.id = _org;
  token := 'smartark-verify=' || encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.organization_domains
    (organization_id, host, kind, portal, status, verification_token, is_primary)
  VALUES (_org, lower(_host), 'custom', _portal, 'pending', token, false)
  ON CONFLICT (host) DO UPDATE
    SET status = 'pending', verification_token = EXCLUDED.verification_token,
        portal = EXCLUDED.portal
  RETURNING id INTO dom;

  DELETE FROM public.domain_verifications WHERE domain_id = dom AND status <> 'verified';

  INSERT INTO public.domain_verifications
    (domain_id, organization_id, record_type, record_name, expected_value) VALUES
    (dom, _org, 'TXT',   '_smartark.' || lower(_host), token),
    (dom, _org, 'CNAME', lower(_host),                 'cname.smartark.ai');

  PERFORM public.branding_audit(_org, 'domain.requested', _host,
                                jsonb_build_object('portal', _portal));

  RETURN jsonb_build_object(
    'domain_id', dom, 'host', lower(_host), 'status', 'pending',
    'records', jsonb_build_array(
      jsonb_build_object('type','TXT','name','_smartark.' || lower(_host),
                         'value', token, 'ttl', 300),
      jsonb_build_object('type','CNAME','name', lower(_host),
                         'value','cname.smartark.ai','ttl', 300)),
    'note', 'DNS changes typically propagate within 5–30 minutes.');
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — BRAND ASSETS & THEMES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brand_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slot             text NOT NULL CHECK (slot IN (
                     'logo','logo_dark','logo_light','favicon','email_logo',
                     'invoice_logo','certificate_logo','certificate_background',
                     'certificate_signature','certificate_seal','app_icon',
                     'splash','social_banner','login_background','dashboard_background')),
  storage_path     text NOT NULL,      -- {organization_id}/branding/...
  mime_type        text,
  width            integer,
  height           integer,
  size_bytes       integer,
  uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slot)
);

/**
 * Named, switchable themes.
 *
 * organization_branding (Phase 4) holds the ACTIVE values the runtime engine
 * reads. This table holds saved themes a tenant can preview, duplicate,
 * export and restore — which is what makes "try a theme and change your mind"
 * possible without a backup-and-restore ritual.
 */
CREATE TABLE IF NOT EXISTS public.organization_themes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  is_active        boolean NOT NULL DEFAULT false,
  is_system        boolean NOT NULL DEFAULT false,  -- shipped default, not deletable
  tokens           jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'custom'
                     CHECK (source IN ('custom','marketplace','system','imported')),
  marketplace_item_id uuid,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_themes_one_active
  ON public.organization_themes (organization_id) WHERE is_active;

/**
 * Validate a theme token bundle.
 *
 * These values are written into CSS custom properties at runtime. Anything
 * that is not a plain hex colour or an allow-listed keyword is rejected HERE,
 * before storage — the same two-layer discipline Phase 4 applied to
 * organization_branding, because "it is only their own tenant" stops being
 * true the moment a parent opens the portal.
 */
CREATE OR REPLACE FUNCTION public.validate_theme_tokens(_tokens jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE k text; v text; out_tokens jsonb := '{}'::jsonb;
  colour_keys text[] := ARRAY['primary','secondary','accent','sidebar','navbar',
                              'card','button','background','foreground','muted','destructive'];
BEGIN
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(_tokens) LOOP
    IF k = ANY (colour_keys) THEN
      IF v !~ '^#[0-9a-fA-F]{6}$' THEN
        RAISE EXCEPTION 'Theme colour "%" must be #rrggbb, got "%"', k, v;
      END IF;
    ELSIF k = 'radius' THEN
      IF v !~ '^[0-9.]{1,5}rem$' THEN
        RAISE EXCEPTION 'Theme radius must look like "0.5rem", got "%"', v;
      END IF;
    ELSIF k = 'font' THEN
      IF v NOT IN ('system','inter','roboto','poppins','lora','sans','serif','mukta','noto') THEN
        RAISE EXCEPTION 'Unsupported font "%"', v;
      END IF;
    ELSIF k IN ('sidebar_style','navbar_style','card_style','button_style') THEN
      IF v NOT IN ('default','compact','floating','bordered','flat','elevated','pill','square') THEN
        RAISE EXCEPTION 'Unsupported style "%" for %', v, k;
      END IF;
    ELSIF k = 'chart_palette' THEN
      CONTINUE;   -- validated below
    ELSE
      -- Unknown keys are DROPPED rather than stored. An unvalidated key would
      -- be a hole in the allow-list the moment the renderer learns to read it.
      CONTINUE;
    END IF;
    out_tokens := out_tokens || jsonb_build_object(k, v);
  END LOOP;

  IF _tokens ? 'chart_palette' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(_tokens -> 'chart_palette') c
                WHERE c !~ '^#[0-9a-fA-F]{6}$') THEN
      RAISE EXCEPTION 'Every chart palette entry must be #rrggbb';
    END IF;
    out_tokens := out_tokens || jsonb_build_object('chart_palette', _tokens -> 'chart_palette');
  END IF;

  RETURN out_tokens;
END $$;

CREATE OR REPLACE FUNCTION public.themes_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tokens := public.validate_theme_tokens(NEW.tokens);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_themes_validate ON public.organization_themes;
CREATE TRIGGER trg_themes_validate
  BEFORE INSERT OR UPDATE ON public.organization_themes
  FOR EACH ROW EXECUTE FUNCTION public.themes_validate();

/** Activate a theme: copy its tokens into the live branding row. */
CREATE OR REPLACE FUNCTION public.activate_theme(_theme uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t RECORD;
BEGIN
  SELECT * INTO t FROM public.organization_themes WHERE id = _theme;
  IF t IS NULL THEN RAISE EXCEPTION 'No such theme'; END IF;
  IF t.organization_id IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('organizations.manage') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.organization_themes SET is_active = false
   WHERE organization_id = t.organization_id AND is_active;
  UPDATE public.organization_themes SET is_active = true WHERE id = _theme;

  -- organization_branding stays the single source of truth the runtime engine
  -- reads. Themes write INTO it rather than becoming a second thing to read —
  -- two sources for "what colour is primary" is how they drift.
  UPDATE public.organization_branding
     SET primary_color   = COALESCE(t.tokens ->> 'primary',   primary_color),
         secondary_color = COALESCE(t.tokens ->> 'secondary', secondary_color),
         accent_color    = COALESCE(t.tokens ->> 'accent',    accent_color),
         font_family     = COALESCE(t.tokens ->> 'font',      font_family),
         theme_tokens    = t.tokens,
         updated_at      = now()
   WHERE organization_id = t.organization_id;

  PERFORM public.branding_audit(t.organization_id, 'theme.activated', t.name, t.tokens);
  RETURN jsonb_build_object('ok', true, 'theme', t.name);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — PER-ORGANIZATION EMAIL TEMPLATES
--
-- comms_templates (already tenant-scoped) owns WhatsApp/SMS content. This is
-- the EMAIL layer: subject + HTML, per language, with a platform default that
-- applies when a tenant has not overridden it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_email_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL organization_id = the PLATFORM default for this key/language. That is
  -- what makes "use ours unless you override" a lookup rather than a branch.
  template_key     text NOT NULL,
  language         text NOT NULL DEFAULT 'en'
                     CHECK (language IN ('en','ta','hi','kn','ml','te')),
  subject          text NOT NULL,
  body_html        text NOT NULL,
  body_text        text,
  is_active        boolean NOT NULL DEFAULT true,
  updated_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One FULL index, not two partial ones. ON CONFLICT can only infer a PARTIAL
-- index when the INSERT carries a WHERE clause implying the predicate, and
-- PostgREST's upsert emits none — so a partial arbiter makes every
-- .upsert({ onConflict: "organization_id,template_key,language" }) fail with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- NULLS NOT DISTINCT (PG15+) is what lets the same index also hold the
-- platform defaults, whose organization_id IS NULL: without it Postgres treats
-- every NULL as unique and duplicate platform templates slip in.
CREATE UNIQUE INDEX IF NOT EXISTS org_email_templates_org_key
  ON public.organization_email_templates (organization_id, template_key, language)
  NULLS NOT DISTINCT;

/** Organization override first, platform default second, English last. */
CREATE OR REPLACE FUNCTION public.resolve_email_template(
  _org uuid, _key text, _language text DEFAULT 'en'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'subject', t.subject, 'body_html', t.body_html, 'body_text', t.body_text,
    'source', CASE WHEN t.organization_id IS NULL THEN 'platform' ELSE 'organization' END,
    'language', t.language)
    FROM public.organization_email_templates t
   WHERE t.template_key = _key AND t.is_active
     AND (t.organization_id = _org OR t.organization_id IS NULL)
     AND (t.language = _language OR t.language = 'en')
   ORDER BY (t.organization_id IS NOT NULL) DESC,   -- org override wins
            (t.language = _language) DESC           -- exact language wins
   LIMIT 1;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — BRANDING AUDIT
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.branding_audit (
  id               bigserial PRIMARY KEY,
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  action           text NOT NULL,
  detail           text,
  payload          jsonb,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_platform_id uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branding_audit_org_idx
  ON public.branding_audit (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.branding_audit(
  _org uuid, _action text, _detail text DEFAULT NULL, _payload jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.branding_audit
    (organization_id, action, detail, payload, actor_profile_id, actor_platform_id)
  VALUES (_org, _action, _detail, _payload,
          public.current_profile_id(), public.current_platform_user_id());
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — WHITE-LABEL SETTINGS on organization_branding
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_branding
  ADD COLUMN IF NOT EXISTS custom_footer      text,
  ADD COLUMN IF NOT EXISTS custom_copyright   text,
  ADD COLUMN IF NOT EXISTS support_phone      text,
  ADD COLUMN IF NOT EXISTS support_address    text,
  ADD COLUMN IF NOT EXISTS website_url        text,
  ADD COLUMN IF NOT EXISTS login_greeting     text,
  ADD COLUMN IF NOT EXISTS help_url           text,
  ADD COLUMN IF NOT EXISTS default_language   text NOT NULL DEFAULT 'en'
    CHECK (default_language IN ('en','ta','hi','kn','ml','te')),
  ADD COLUMN IF NOT EXISTS loader_style       text NOT NULL DEFAULT 'spinner'
    CHECK (loader_style IN ('spinner','bar','pulse','logo')),
  ADD COLUMN IF NOT EXISTS sidebar_style      text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS navbar_style       text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS card_style         text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS button_style       text NOT NULL DEFAULT 'default';

COMMENT ON COLUMN public.organization_branding.powered_by_hidden IS
  'Hiding "Powered by Smart ARK" is a PLAN entitlement (allow_white_label), '
  'not a free toggle. The UI gates on the plan; a tenant flipping this column '
  'directly is caught by the plan check at render time.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — RLS
--
-- The phase requirement: one organization must NEVER read another's branding,
-- domains, emails, themes, logos, templates or installs.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organization_integrations','organization_secrets','brand_assets',
    'organization_themes','domain_verifications','organization_email_templates',
    'branding_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Integrations: the org's own admins manage them. `config` holds no secret.
DROP POLICY IF EXISTS org_integrations_read ON public.organization_integrations;
CREATE POLICY org_integrations_read ON public.organization_integrations
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS org_integrations_write ON public.organization_integrations;
CREATE POLICY org_integrations_write ON public.organization_integrations
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id()
              AND public.has_any_role(ARRAY['admin','management']));

-- organization_secrets gets NO POLICY AT ALL. RLS is enabled and forced, so
-- with zero policies the table is deny-all to every authenticated role — only
-- the service role (i.e. the edge functions) can read it. This is the whole
-- reason secrets are not columns on organization_integrations.

DROP POLICY IF EXISTS brand_assets_read ON public.brand_assets;
CREATE POLICY brand_assets_read ON public.brand_assets
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS brand_assets_write ON public.brand_assets;
CREATE POLICY brand_assets_write ON public.brand_assets
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id()
              AND public.has_any_role(ARRAY['admin','management']));

DROP POLICY IF EXISTS org_themes_read ON public.organization_themes;
CREATE POLICY org_themes_read ON public.organization_themes
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS org_themes_write ON public.organization_themes;
CREATE POLICY org_themes_write ON public.organization_themes
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id()
              AND public.has_any_role(ARRAY['admin','management']));

DROP POLICY IF EXISTS domain_verifications_read ON public.domain_verifications;
CREATE POLICY domain_verifications_read ON public.domain_verifications
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('organizations.read'));

-- Email templates: a tenant reads its own AND the platform defaults (that is
-- how "use ours unless you override" renders), but writes only its own.
DROP POLICY IF EXISTS org_email_templates_read ON public.organization_email_templates;
CREATE POLICY org_email_templates_read ON public.organization_email_templates
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         OR organization_id IS NULL
         OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS org_email_templates_write ON public.organization_email_templates;
CREATE POLICY org_email_templates_write ON public.organization_email_templates
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id()
              AND public.has_any_role(ARRAY['admin','management']));

DROP POLICY IF EXISTS branding_audit_read ON public.branding_audit;
CREATE POLICY branding_audit_read ON public.branding_audit
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('audit.read'));

NOTIFY pgrst, 'reload schema';
