-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 4B (STEP HANDLERS + WHITE LABEL)               2026-08-20
--
-- Rollback order for Phase 4: 4B → 4A.
--
-- 4B added FUNCTIONS and COLUMNS. Dropping the functions is free — they are
-- only invoked by the worker. The white-label COLUMNS are deliberately KEPT:
-- an organization may already have uploaded a logo and chosen colours, and
-- dropping those columns destroys customer configuration to undo a migration.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER  IF EXISTS trg_validate_branding ON public.organization_branding;
DROP FUNCTION IF EXISTS public.validate_branding();

-- Revert branding to read-only for tenants (its 1A state).
DROP POLICY IF EXISTS organization_branding_write ON public.organization_branding;

DROP FUNCTION IF EXISTS public.refresh_onboarding_checklist(uuid);
DROP FUNCTION IF EXISTS public.provision_step_notify(uuid);
DROP FUNCTION IF EXISTS public.provision_step_storage(uuid);
DROP FUNCTION IF EXISTS public.provision_step_onboarding(uuid);
DROP FUNCTION IF EXISTS public.provision_step_portals(uuid);
DROP FUNCTION IF EXISTS public.provision_step_feature_flags(uuid);
DROP FUNCTION IF EXISTS public.provision_step_branding(uuid);
DROP FUNCTION IF EXISTS public.provision_step_theme(uuid);
DROP FUNCTION IF EXISTS public.provision_step_reports(uuid);
DROP FUNCTION IF EXISTS public.provision_step_dashboards(uuid);
DROP FUNCTION IF EXISTS public.provision_step_payroll_settings(uuid);
DROP FUNCTION IF EXISTS public.provision_step_attendance_settings(uuid);
DROP FUNCTION IF EXISTS public.provision_step_fee_settings(uuid);
DROP FUNCTION IF EXISTS public.provision_step_certificates(uuid);
DROP FUNCTION IF EXISTS public.provision_step_comms_automation(uuid);
DROP FUNCTION IF EXISTS public.provision_step_comms_templates(uuid);
DROP FUNCTION IF EXISTS public.provision_step_permissions(uuid);
DROP FUNCTION IF EXISTS public.provision_step_roles(uuid);
DROP FUNCTION IF EXISTS public.provision_step_sections(uuid);
DROP FUNCTION IF EXISTS public.provision_step_departments(uuid);
DROP FUNCTION IF EXISTS public.provision_step_academic_year(uuid);
DROP FUNCTION IF EXISTS public.provision_step_branch(uuid);

-- Columns intentionally retained:
--   organization_branding.{secondary_color, portal_name, email_*, theme_tokens, …}
--   organization_domains.{verification_token, ssl_status, last_checked_at}
-- They hold customer configuration and cost nothing when unread.

NOTIFY pgrst, 'reload schema';
