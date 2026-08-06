-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 6A (WHITE LABEL CORE)                           2026-09-01
--
-- Run AFTER the 6B rollback.
--
-- ⚠ REFUSES while any organization is using CUSTOM credentials. Dropping the
--   integration tables then would silently divert that tenant's mail and
--   WhatsApp back to the PLATFORM sender — messages would still send, but
--   from the wrong identity, and nobody would notice until a parent asked why
--   the school's name changed.
--
-- ⚠ REVERT THE EDGE FUNCTIONS TOO. send-email and send-aisensy import
--   _shared/integrations.ts; against a rolled-back database those imports
--   resolve but every lookup errors. Deploy the previous function versions.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n int; d int;
BEGIN
  SELECT count(*) INTO n FROM public.organization_integrations
   WHERE mode = 'custom' AND is_active AND verified_at IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop white-label core: % organization(s) use their OWN email '
      'or WhatsApp credentials. Switch them to mode = ''platform'' first, and tell '
      'them, or their messages will silently start sending from our sender.', n;
  END IF;

  SELECT count(*) INTO d FROM public.organization_domains
   WHERE kind = 'custom' AND status = 'verified';
  IF d > 0 THEN
    RAISE WARNING
      '% verified custom domain(s) exist. Their verification history will be '
      'lost; the domains themselves remain in organization_domains.', d;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.activate_theme(uuid);
DROP TRIGGER  IF EXISTS trg_themes_validate ON public.organization_themes;
DROP FUNCTION IF EXISTS public.themes_validate();
DROP FUNCTION IF EXISTS public.validate_theme_tokens(jsonb);
DROP FUNCTION IF EXISTS public.request_domain_verification(uuid, text, text);
DROP FUNCTION IF EXISTS public.resolve_email_template(uuid, text, text);
DROP FUNCTION IF EXISTS public.resolve_integration(uuid, text);

DROP TABLE IF EXISTS public.domain_verifications;
DROP TABLE IF EXISTS public.organization_email_templates;
DROP TABLE IF EXISTS public.organization_themes;
DROP TABLE IF EXISTS public.brand_assets;
DROP TABLE IF EXISTS public.organization_secrets;
DROP TABLE IF EXISTS public.organization_integrations;

-- branding_audit is KEPT: it is the record of who changed what, and the reason
-- to consult it is highest precisely when something has gone wrong.
DROP FUNCTION IF EXISTS public.branding_audit(uuid, text, text, jsonb);

-- Columns added to organization_branding and organization_domains are KEPT.
-- They hold customer configuration — logos, colours, footers, support details.

NOTIFY pgrst, 'reload schema';
