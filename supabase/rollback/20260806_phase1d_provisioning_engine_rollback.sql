-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 1D (PROVISIONING ENGINE)                        2026-08-06
--
-- 1D added functions only — no tables, no columns, no data. Dropping them
-- cannot affect any organization that has already been provisioned: the rows
-- they created live in the 1A tables and stay exactly where they are.
--
-- Safe to run independently of the 1A/1B/1C rollbacks.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.deprovision_organization(uuid, text);
DROP FUNCTION IF EXISTS public.provision_organization_admin(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.provision_organization(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.default_academic_year(text);

NOTIFY pgrst, 'reload schema';
