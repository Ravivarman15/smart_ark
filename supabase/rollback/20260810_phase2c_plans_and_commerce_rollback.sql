-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 2C (PLANS & COMMERCE)                           2026-08-10
--
-- Rollback order for Phase 2:  2C → 2B → 2A.
--
-- 2C added only NEW tables. No tenant table, tenant policy or ERP row is
-- touched, so this cannot affect ARK's operation — the ERP never reads any of
-- these. Dropping is therefore safe and complete.
--
-- ⚠ organization_features is dropped here. If Phase 6 has shipped by the time
--   you run this, per-organization module toggles are lost and every tenant
--   falls back to plan defaults. Export it first if that matters.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subscriptions
   WHERE status IN ('active','past_due','grace')
     AND organization_id <> (SELECT id FROM public.organizations WHERE slug = 'ark');
  IF n > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop commerce tables: % paying subscription(s) exist for '
      'organizations other than ARK. Export them first.', n;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_feature_flag_history ON public.organization_features;
DROP TRIGGER IF EXISTS trg_coupon_enforce_limits ON public.coupon_redemptions;
DROP FUNCTION IF EXISTS public.feature_flag_history();
DROP FUNCTION IF EXISTS public.coupon_enforce_limits();
DROP FUNCTION IF EXISTS public.effective_features(uuid);

-- Child-first; no CASCADE, so an unexpected dependency errors loudly rather
-- than being silently dropped along with it.
DROP TABLE IF EXISTS public.invoice_lines;
DROP TABLE IF EXISTS public.invoices;
DROP TABLE IF EXISTS public.coupon_redemptions;
DROP TABLE IF EXISTS public.coupons;
DROP TABLE IF EXISTS public.feature_flag_assignments;
DROP TABLE IF EXISTS public.organization_features;
DROP TABLE IF EXISTS public.subscription_usage;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.plan_features;
DROP TABLE IF EXISTS public.plan_prices;
DROP TABLE IF EXISTS public.plans;
DROP TABLE IF EXISTS public.organization_invitations;
DROP TABLE IF EXISTS public.organization_activity;
DROP TABLE IF EXISTS public.platform_notifications;
DROP TABLE IF EXISTS public.platform_announcements;
DROP TABLE IF EXISTS public.platform_settings;

NOTIFY pgrst, 'reload schema';
