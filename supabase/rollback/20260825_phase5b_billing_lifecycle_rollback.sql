-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 5B (BILLING LIFECYCLE)                          2026-08-25
--
-- Rollback order for Phase 5: 5B → 5A.
--
-- 5B added FUNCTIONS only. Dropping them stops the lifecycle sweep and the
-- webhook's activation path; it removes no invoice, payment or subscription.
--
-- ⚠ Deregister the billing-lifecycle cron schedule FIRST, or it will invoke a
--   missing RPC every hour.
-- ⚠ Deregister or disable the Razorpay webhook endpoint, or captured payments
--   will be logged but never activate a subscription — money in, nothing
--   granted, and the customer chasing support.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.billing_platform_summary();
DROP FUNCTION IF EXISTS public.billing_summary(uuid);
DROP FUNCTION IF EXISTS public.run_billing_lifecycle();
DROP FUNCTION IF EXISTS public.apply_coupon(uuid, text);
DROP FUNCTION IF EXISTS public.restore_organization(uuid, text);
DROP FUNCTION IF EXISTS public.suspend_organization(uuid, text);
DROP FUNCTION IF EXISTS public.mark_payment_failed(uuid, text);
DROP FUNCTION IF EXISTS public.activate_subscription(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.issue_invoice(uuid, uuid, numeric, date, date, uuid, text);

-- ARK's subscription row is deliberately LEFT as-is (internal plan, active,
-- far-future period end). Reverting it would put organization #1 into a
-- billing lifecycle it must never enter.

NOTIFY pgrst, 'reload schema';
