-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 6B (MARKETPLACE, CERTIFICATES, DEFAULTS)        2026-09-01
--
-- Rollback order for Phase 6: 6B → 6A.
--
-- Dropping the marketplace does NOT un-brand any organization: installs COPY
-- their payload into the tenant's own themes / templates / settings, so a
-- customer who installed a theme keeps it. That copy-on-install design is
-- exactly what makes this rollback safe.
-- ════════════════════════════════════════════════════════════════════════════

-- Remove the provisioning step first, so no queued job invokes a missing handler.
DELETE FROM public.provisioning_step_catalog WHERE step_key = 'white_label';
DROP FUNCTION IF EXISTS public.provision_step_white_label(uuid);

DROP FUNCTION IF EXISTS public.public_branding_for_host(text);
DROP FUNCTION IF EXISTS public.branding_bundle(uuid);
DROP FUNCTION IF EXISTS public.save_certificate_branding(jsonb);
DROP FUNCTION IF EXISTS public.install_marketplace_item(uuid);

DROP TABLE IF EXISTS public.marketplace_installs;
DROP TABLE IF EXISTS public.marketplace_items;

-- Platform-default email templates (organization_id IS NULL) are KEPT: with
-- them gone, resolve_email_template() returns nothing for any tenant that has
-- not written its own, and transactional email silently stops.

NOTIFY pgrst, 'reload schema';
