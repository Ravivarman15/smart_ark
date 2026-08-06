-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 6B — BRANDING MARKETPLACE, CERTIFICATES & PLATFORM DEFAULTS  2026-09-01
--
-- ADDITIVE. IDEMPOTENT. Paired rollback: ..._rollback.sql. Requires 6A.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — MARKETPLACE
--
-- ┌── FIRST-PARTY ONLY, DELIBERATELY ────────────────────────────────────┐
-- │ This is a CURATED catalogue of themes, templates and layouts that we  │
-- │ publish. There is no third-party submission flow, no revenue share    │
-- │ and no developer account — those need an ecosystem that does not      │
-- │ exist yet, and a storefront with nothing in it helps nobody.          │
-- │                                                                       │
-- │ What IS built is the install mechanism, so when third parties do      │
-- │ arrive the only new work is publishing, not plumbing.                 │
-- └───────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  kind          text NOT NULL CHECK (kind IN (
                  'theme','color_pack','email_template','certificate_template',
                  'dashboard_layout','login_template','report_pack','invoice_design',
                  'icon_pack','illustration_pack','widget')),
  name          text NOT NULL,
  description   text,
  preview_url   text,
  -- The installable content. Shape depends on `kind`; install_marketplace_item
  -- dispatches on it.
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  author        text NOT NULL DEFAULT 'Smart ARK',
  -- Entitlement, not price. Free items install on any plan; 'pro' items
  -- require a plan whose tier reaches them.
  tier          text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','enterprise')),
  is_published  boolean NOT NULL DEFAULT false,
  install_count integer NOT NULL DEFAULT 0,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_items_kind_idx
  ON public.marketplace_items (kind, tier) WHERE is_published;

CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id          uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  version          integer NOT NULL DEFAULT 1,
  installed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  installed_at     timestamptz NOT NULL DEFAULT now(),
  uninstalled_at   timestamptz,
  UNIQUE (organization_id, item_id)
);

/**
 * Install a marketplace item into the calling organization.
 *
 * COPIES the payload into the tenant's own rows rather than referencing the
 * catalogue. A tenant that customises an installed theme must not have its
 * changes overwritten when we publish v2 — and an item we later unpublish must
 * not vanish from the organizations using it.
 */
CREATE OR REPLACE FUNCTION public.install_marketplace_item(_item uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  it    RECORD;
  org   uuid := public.current_org_id();
  allowed boolean;
  created uuid;
  n int := 0;
  r RECORD;
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF NOT public.has_any_role(ARRAY['admin','management']) THEN
    RAISE EXCEPTION 'Only an admin or management user can install branding items';
  END IF;

  SELECT * INTO it FROM public.marketplace_items WHERE id = _item AND is_published;
  IF it IS NULL THEN RAISE EXCEPTION 'Item not available'; END IF;

  -- Entitlement check. A 'pro' item on a Starter plan is a paywall, and it
  -- belongs in the database — the UI hiding the button is not enforcement.
  IF it.tier <> 'free' THEN
    SELECT CASE it.tier
             WHEN 'pro'        THEN p.allow_white_label
             WHEN 'enterprise' THEN p.allow_marketplace
             ELSE false END
      INTO allowed
      FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
     WHERE s.organization_id = org
       AND s.status IN ('trialing','active','past_due','grace')
     LIMIT 1;
    IF NOT COALESCE(allowed, false) THEN
      RAISE EXCEPTION 'Your plan does not include this item. Upgrade to install it.';
    END IF;
  END IF;

  IF it.kind IN ('theme','color_pack') THEN
    INSERT INTO public.organization_themes
      (organization_id, name, tokens, source, marketplace_item_id, created_by)
    VALUES (org, it.name, it.payload -> 'tokens', 'marketplace', it.id,
            public.current_profile_id())
    ON CONFLICT (organization_id, name) DO UPDATE
      SET tokens = EXCLUDED.tokens, updated_at = now()
    RETURNING id INTO created;
    n := 1;

  ELSIF it.kind = 'email_template' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(it.payload -> 'templates', '[]'::jsonb)) t
    LOOP
      INSERT INTO public.organization_email_templates
        (organization_id, template_key, language, subject, body_html, updated_by)
      VALUES (org, r.value ->> 'key', COALESCE(r.value ->> 'language', 'en'),
              r.value ->> 'subject', r.value ->> 'body_html',
              public.current_profile_id())
      ON CONFLICT (organization_id, template_key, language) DO UPDATE
        SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, updated_at = now();
      n := n + 1;
    END LOOP;

  ELSIF it.kind = 'certificate_template' THEN
    INSERT INTO public.organization_settings (organization_id, key, value)
    VALUES (org, 'certificate_templates', it.payload -> 'templates')
    ON CONFLICT (organization_id, key) DO UPDATE
      SET value = public.organization_settings.value || EXCLUDED.value,
          updated_at = now();
    n := 1;

  ELSIF it.kind = 'dashboard_layout' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(it.payload -> 'layouts', '[]'::jsonb)) t
    LOOP
      BEGIN
        INSERT INTO public.dashboard_layouts (scope, items, organization_id)
        VALUES (r.value ->> 'scope', r.value -> 'items', org)
        ON CONFLICT (organization_id, scope) DO UPDATE
          SET items = EXCLUDED.items;
        n := n + 1;
      EXCEPTION WHEN others THEN NULL;
      END;
    END LOOP;

  ELSE
    -- Kinds whose consumer is not built yet (icon packs, illustrations,
    -- widgets) are stored as a setting so nothing is lost, and are marked so
    -- the UI can say "installed, not yet used" rather than implying an effect.
    INSERT INTO public.organization_settings (organization_id, key, value)
    VALUES (org, 'marketplace_' || it.kind, it.payload)
    ON CONFLICT (organization_id, key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now();
    n := 1;
  END IF;

  INSERT INTO public.marketplace_installs (organization_id, item_id, version, installed_by)
  VALUES (org, it.id, it.version, public.current_profile_id())
  ON CONFLICT (organization_id, item_id) DO UPDATE
    SET version = EXCLUDED.version, installed_at = now(), uninstalled_at = NULL;

  UPDATE public.marketplace_items SET install_count = install_count + 1 WHERE id = it.id;

  PERFORM public.branding_audit(org, 'marketplace.installed', it.name,
                                jsonb_build_object('item', it.slug, 'kind', it.kind));

  RETURN jsonb_build_object('ok', true, 'kind', it.kind, 'applied', n, 'theme_id', created);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — CERTIFICATE BRANDING
--
-- Extends the settings key Phase 4 seeded. Deliberately NOT a new table: the
-- certificates module is still a 94-line stub, and creating a schema for a
-- consumer that does not exist means two sources of truth on the day it does.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_certificate_branding(_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE org uuid := public.current_org_id(); c text;
BEGIN
  IF org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  IF NOT public.has_any_role(ARRAY['admin','management']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Same colour discipline as the theme engine: these end up in a rendered
  -- document and, for QR-signed certificates, in a public verification page.
  FOREACH c IN ARRAY ARRAY[_config ->> 'border_color', _config ->> 'text_color',
                           _config ->> 'accent_color'] LOOP
    IF c IS NOT NULL AND c !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'Certificate colour must be #rrggbb, got "%"', c;
    END IF;
  END LOOP;

  INSERT INTO public.organization_settings (organization_id, key, value)
  VALUES (org, 'certificate_branding', _config)
  ON CONFLICT (organization_id, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  PERFORM public.branding_audit(org, 'certificate.branding_saved', NULL, _config);
  RETURN jsonb_build_object('ok', true);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — THE COMPLETE BRANDING BUNDLE
--
-- One RPC returning everything a portal needs to render itself: branding,
-- assets, theme, domains, integration modes and language. One round trip on
-- boot rather than six, and one place to cache.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.branding_bundle(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid := COALESCE(_org, public.current_org_id()); result jsonb;
BEGIN
  IF target IS NULL THEN RETURN NULL; END IF;
  IF target IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'name', o.display_name, 'slug', o.slug),
    'branding', (SELECT to_jsonb(b) FROM public.organization_branding b
                  WHERE b.organization_id = target),
    'assets', (SELECT jsonb_object_agg(a.slot, a.storage_path)
                 FROM public.brand_assets a WHERE a.organization_id = target),
    'theme', (SELECT jsonb_build_object('id', t.id, 'name', t.name, 'tokens', t.tokens)
                FROM public.organization_themes t
               WHERE t.organization_id = target AND t.is_active),
    'domains', (SELECT jsonb_agg(jsonb_build_object(
                        'host', d.host, 'kind', d.kind, 'portal', d.portal,
                        'status', d.status, 'ssl_status', d.ssl_status,
                        'is_primary', d.is_primary) ORDER BY d.is_primary DESC)
                  FROM public.organization_domains d WHERE d.organization_id = target),
    -- MODE only, never a credential. This tells the UI whether to show
    -- "using Smart ARK's sender" or "using yours" — and nothing more.
    'integrations', (SELECT jsonb_object_agg(i.channel, jsonb_build_object(
                              'mode', CASE WHEN i.mode = 'custom' AND i.verified_at IS NOT NULL
                                           AND i.is_active THEN 'custom' ELSE 'platform' END,
                              'provider', i.provider,
                              'verified', i.verified_at IS NOT NULL))
                       FROM public.organization_integrations i
                      WHERE i.organization_id = target),
    -- Plan entitlements, so the UI can gate white-label controls without a
    -- second query and without guessing.
    'entitlements', (SELECT jsonb_build_object(
                        'white_label', p.allow_white_label,
                        'custom_domain', p.allow_custom_domain,
                        'marketplace', p.allow_marketplace)
                       FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
                      WHERE s.organization_id = target
                        AND s.status IN ('trialing','active','past_due','grace') LIMIT 1),
    'generated_at', now()
  ) INTO result
  FROM public.organizations o WHERE o.id = target;

  RETURN result;
END $$;

/**
 * PUBLIC branding for a hostname — used by the LOGIN screen, before anyone is
 * authenticated and before there is an organization context.
 *
 * Returns ONLY what a login page must render: name, logo, colours, greeting,
 * support links. No integration state, no domain list, no entitlements — an
 * unauthenticated caller must learn nothing about how the tenant is configured.
 */
CREATE OR REPLACE FUNCTION public.public_branding_for_host(_host text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'organization_name', o.display_name,
    'portal_name', b.portal_name,
    'logo_url', b.logo_url,
    'logo_dark_url', b.logo_dark_url,
    'favicon_url', b.favicon_url,
    'primary_color', b.primary_color,
    'accent_color', b.accent_color,
    'login_bg_url', b.login_bg_url,
    'login_greeting', b.login_greeting,
    'support_email', b.support_email,
    'help_url', b.help_url,
    'default_language', b.default_language,
    'powered_by_hidden', COALESCE(b.powered_by_hidden, false)
      AND COALESCE((SELECT p.allow_white_label
                      FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
                     WHERE s.organization_id = o.id
                       AND s.status IN ('trialing','active','past_due','grace') LIMIT 1), false))
    FROM public.organization_domains d
    JOIN public.organizations o ON o.id = d.organization_id
    LEFT JOIN public.organization_branding b ON b.organization_id = o.id
   WHERE lower(d.host) = lower(_host)
     AND d.status IN ('verified','pending')
     AND o.deleted_at IS NULL
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.public_branding_for_host(text) TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — RLS for the marketplace
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.marketplace_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_items    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_installs FORCE  ROW LEVEL SECURITY;

-- The catalogue is shared by design; only PUBLISHED items are visible.
DROP POLICY IF EXISTS marketplace_items_read ON public.marketplace_items;
CREATE POLICY marketplace_items_read ON public.marketplace_items
  FOR SELECT TO authenticated USING (is_published OR public.platform_can('settings.manage'));

DROP POLICY IF EXISTS marketplace_items_manage ON public.marketplace_items;
CREATE POLICY marketplace_items_manage ON public.marketplace_items
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));

-- Installs are per-tenant and must NOT be visible across organizations: which
-- branding a competitor uses is their business, not their competitor's.
DROP POLICY IF EXISTS marketplace_installs_read ON public.marketplace_installs;
CREATE POLICY marketplace_installs_read ON public.marketplace_installs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS marketplace_installs_write ON public.marketplace_installs;
CREATE POLICY marketplace_installs_write ON public.marketplace_installs
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id()
              AND public.has_any_role(ARRAY['admin','management']));


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — SEED PLATFORM DEFAULTS
--
-- organization_id IS NULL rows are the platform defaults every tenant inherits
-- until it overrides one. This is what makes "use ours by default" real.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.organization_email_templates
  (organization_id, template_key, language, subject, body_html) VALUES
  (NULL, 'welcome', 'en', 'Welcome to {{org_name}}',
   '<p>Hello {{name}},</p><p>Your {{org_name}} account is ready. Sign in at <a href="{{login_url}}">{{login_url}}</a>.</p>'),
  (NULL, 'organization-ready', 'en', 'Your ERP is ready — {{organizationName}}',
   '<p>Hi {{adminName}},</p><p><strong>{{organizationName}}</strong> is set up and ready at <a href="{{loginUrl}}">{{loginUrl}}</a>.</p><p>Start by importing your students. Documentation: <a href="{{docsUrl}}">{{docsUrl}}</a>.</p>'),
  (NULL, 'invoice', 'en', 'Invoice {{invoice_number}} from {{org_name}}',
   '<p>Dear {{name}},</p><p>Please find invoice <strong>{{invoice_number}}</strong> for {{amount}}, due {{due_date}}.</p>'),
  (NULL, 'trial-ending', 'en', 'Your {{org_name}} trial ends soon',
   '<p>Your trial ends in {{days}} day(s). Add a plan to continue without interruption — your data stays safe either way.</p>'),
  (NULL, 'trial-expired', 'en', 'Your trial has ended',
   '<p>Your trial has ended. Choose a plan to restore full access. <strong>Nothing has been deleted.</strong></p>'),
  (NULL, 'renewal-reminder', 'en', 'Your subscription renews soon',
   '<p>Your {{org_name}} subscription renews on {{renewal_date}}.</p>'),
  (NULL, 'payment-failed', 'en', 'Payment could not be processed',
   '<p>We could not process your payment. Full access continues during the grace period — please update your payment method.</p>'),
  (NULL, 'subscription-activated', 'en', 'Subscription active',
   '<p>Thank you — your subscription is active until {{period_end}}.</p>'),
  (NULL, 'subscription-suspended', 'en', 'Account suspended',
   '<p>Your account is suspended for non-payment. <strong>Your data is safe and untouched.</strong> Settle the outstanding invoice to restore access immediately.</p>'),
  (NULL, 'subscription-restored', 'en', 'Account restored',
   '<p>Your account has been restored. Everything is exactly as you left it.</p>'),
  (NULL, 'salary-slip', 'en', 'Payslip for {{month}}',
   '<p>Dear {{employeeName}},</p><p>Your payslip for {{month}} is ready. Net salary: {{netSalary}}.</p><p><a href="{{downloadUrl}}">Download payslip</a></p>')
ON CONFLICT DO NOTHING;

-- Curated first-party marketplace items.
INSERT INTO public.marketplace_items (slug, kind, name, description, tier, is_published, payload) VALUES
  ('theme-ocean', 'theme', 'Ocean', 'Calm blues with generous spacing', 'free', true,
   '{"tokens":{"primary":"#0369a1","secondary":"#0ea5e9","accent":"#06b6d4","radius":"0.6rem","font":"system"}}'::jsonb),
  ('theme-forest', 'theme', 'Forest', 'Deep greens, high contrast', 'free', true,
   '{"tokens":{"primary":"#15803d","secondary":"#22c55e","accent":"#84cc16","radius":"0.5rem","font":"system"}}'::jsonb),
  ('theme-sunrise', 'theme', 'Sunrise', 'Warm oranges for a friendly feel', 'free', true,
   '{"tokens":{"primary":"#ea580c","secondary":"#f59e0b","accent":"#facc15","radius":"0.75rem","font":"system"}}'::jsonb),
  ('theme-midnight', 'theme', 'Midnight', 'Dark-first, low glare', 'free', true,
   '{"tokens":{"primary":"#6366f1","secondary":"#8b5cf6","accent":"#a855f7","radius":"0.5rem","font":"system"}}'::jsonb),
  ('theme-royal', 'theme', 'Royal', 'Deep purple with gold accents', 'pro', true,
   '{"tokens":{"primary":"#6d28d9","secondary":"#9333ea","accent":"#eab308","radius":"0.75rem","font":"poppins"}}'::jsonb),
  ('palette-accessible', 'color_pack', 'Accessible charts',
   'Colour-blind-safe chart palette', 'free', true,
   '{"tokens":{"chart_palette":["#0173b2","#de8f05","#029e73","#cc78bc","#ca9161","#949494"]}}'::jsonb),
  ('certs-classic', 'certificate_template', 'Classic certificates',
   'Bonafide, transfer and completion with a bordered layout', 'free', true,
   '{"templates":{"classic_border":{"title":"Classic","border_color":"#1e3a8a","accent_color":"#b45309"}}}'::jsonb),
  ('email-warm', 'email_template', 'Warm email pack',
   'Friendlier wording for parent-facing emails', 'free', true,
   '{"templates":[{"key":"welcome","language":"en","subject":"Welcome to the {{org_name}} family","body_html":"<p>Hi {{name}}, we are delighted to have you with us.</p>"}]}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET payload = EXCLUDED.payload, is_published = EXCLUDED.is_published,
      name = EXCLUDED.name, updated_at = now();

-- ── System themes for every existing organization ───────────────────────────
-- Idempotent, and it gives ARK a named "Default" theme it can restore to
-- rather than leaving the theme picker empty on first open.
DO $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations WHERE deleted_at IS NULL LOOP
    INSERT INTO public.organization_themes
      (organization_id, name, is_active, is_system, source, tokens)
    SELECT o.id, 'Default', true, true, 'system',
           '{"primary":"#2563eb","secondary":"#0ea5e9","accent":"#06b6d4","radius":"0.6rem","font":"system"}'::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM public.organization_themes
                        WHERE organization_id = o.id AND name = 'Default');
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — provisioning step for new organizations
--
-- Extends the Phase 4 catalogue rather than adding a second provisioning path.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provision_step_white_label(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_themes
    (organization_id, name, is_active, is_system, source, tokens)
  SELECT _org, 'Default', true, true, 'system',
         '{"primary":"#2563eb","secondary":"#0ea5e9","accent":"#06b6d4","radius":"0.6rem","font":"system"}'::jsonb
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_themes
                      WHERE organization_id = _org AND name = 'Default');

  -- Every channel starts on PLATFORM credentials. This is the row that makes
  -- "use ours by default" explicit rather than implied by absence — support
  -- can see the choice, and the tenant can flip it when ready.
  INSERT INTO public.organization_integrations (organization_id, channel, provider, mode)
  VALUES (_org, 'whatsapp', 'aisensy', 'platform'),
         (_org, 'email',    'brevo',   'platform')
  ON CONFLICT (organization_id, channel) DO NOTHING;

  RETURN jsonb_build_object('theme', 'Default', 'integrations', 'platform');
END $$;

INSERT INTO public.provisioning_step_catalog
  (step_key, seq, label, description, handler, is_critical)
VALUES ('white_label', 165, 'White label',
        'Default theme and platform-credential integrations',
        'provision_step_white_label', false)
ON CONFLICT (step_key) DO UPDATE
  SET seq = EXCLUDED.seq, label = EXCLUDED.label, handler = EXCLUDED.handler;

NOTIFY pgrst, 'reload schema';
