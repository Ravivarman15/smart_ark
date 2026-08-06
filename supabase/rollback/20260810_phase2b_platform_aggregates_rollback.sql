-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 2B (PLATFORM AGGREGATES)                        2026-08-10
--
-- Drops the rollup table and the aggregate readers. Purely additive in the
-- forward direction, so this removes capability, never data belonging to a
-- tenant: organization_metrics_daily holds only counts that
-- refresh_organization_metrics() can recompute from scratch at any time.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.platform_organization_detail(uuid);
DROP FUNCTION IF EXISTS public.platform_system_health();
DROP FUNCTION IF EXISTS public.platform_summary();
DROP FUNCTION IF EXISTS public.platform_organization_overview();
DROP FUNCTION IF EXISTS public.refresh_organization_metrics(uuid);
DROP TABLE IF EXISTS public.organization_metrics_daily;

NOTIFY pgrst, 'reload schema';
