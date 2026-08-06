-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 5A (BILLING CORE)                               2026-08-25
--
-- Run AFTER the 5B rollback.
--
-- ⚠ REFUSES if any real payment exists. Payment, invoice and refund records
--   are FINANCIAL RECORDS with statutory retention — India requires GST
--   invoices to be kept for years. Dropping them to undo a migration is not a
--   rollback, it is destroying accounting records.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n_pay int; n_inv int;
BEGIN
  SELECT count(*) INTO n_pay FROM public.payments WHERE status IN ('captured','refunded');
  SELECT count(*) INTO n_inv FROM public.invoices WHERE status IN ('issued','paid');
  IF n_pay > 0 OR n_inv > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop billing: % captured payment(s) and % issued invoice(s) exist. '
      'These are statutory financial records. Export them and drop the tables by hand '
      'if you genuinely intend to destroy them.', n_pay, n_inv;
  END IF;
END $$;


-- ── PART 1 — remove the suspension guard (restore from the snapshot) ────────
-- Same lossless technique as Phase 1C/3A: the original expressions were stored
-- before wrapping, so this is a restore rather than a regex unpicking live
-- authorization rules.
DO $$
DECLARE b RECORD; n int := 0;
BEGIN
  FOR b IN SELECT * FROM public.tenancy_policy_backup WHERE schema_name = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = b.schema_name AND p.tablename = b.table_name
         AND p.policyname = b.policy_name
         AND (COALESCE(p.qual,'') LIKE '%is_org_suspended%'
              OR COALESCE(p.with_check,'') LIKE '%is_org_suspended%')
    ) THEN CONTINUE; END IF;

    BEGIN
      IF b.orig_qual IS NOT NULL AND b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                       b.policy_name, b.table_name, b.orig_qual, b.orig_check);
      ELSIF b.orig_qual IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                       b.policy_name, b.table_name, b.orig_qual);
      ELSIF b.orig_check IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                       b.policy_name, b.table_name, b.orig_check);
      END IF;
      n := n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Rollback 5A: could not restore %.%: %', b.table_name, b.policy_name, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Rollback 5A: restored % policy/policies.', n;
END $$;

DROP FUNCTION IF EXISTS public.is_org_suspended();


-- ── PART 2 — remove plan-limit enforcement ──────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','profiles','campuses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_plan_limit ON public.%I', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.enforce_plan_limit();
DROP FUNCTION IF EXISTS public.usage_status(uuid);
DROP FUNCTION IF EXISTS public.plan_limit(uuid, text);


-- ── PART 3 — drop billing objects ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.compute_gst(uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public.next_invoice_number(uuid, date);
DROP FUNCTION IF EXISTS public.financial_year(date);
DROP FUNCTION IF EXISTS public.billing_audit(uuid, text, text, jsonb, text, uuid);

DROP TABLE IF EXISTS public.referral_credits;
DROP TABLE IF EXISTS public.referrals;
DROP TABLE IF EXISTS public.usage_counters;
DROP TABLE IF EXISTS public.billing_events;
DROP TABLE IF EXISTS public.billing_webhook_events;
DROP TABLE IF EXISTS public.invoice_sequences;
DROP TABLE IF EXISTS public.refunds;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.billing_customers;
DROP TABLE IF EXISTS public.billing_profiles;

-- Columns added to subscriptions / invoices / invoice_lines are KEPT. They
-- hold provider ids and GST breakdowns for records that must be retained, and
-- dropping them destroys the tax detail on invoices already issued.

NOTIFY pgrst, 'reload schema';
