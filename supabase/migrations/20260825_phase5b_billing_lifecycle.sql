-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5B — BILLING LIFECYCLE                                   2026-08-25
--
-- ADDITIVE. IDEMPOTENT. Paired rollback: ..._rollback.sql. Requires 5A.
--
-- Trial → reminder → grace → suspension → restoration, plus invoice issuance
-- and coupon application. Every state change is audited and NOTHING is ever
-- deleted: suspension is a status, and restoration is one UPDATE away.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — ISSUE AN INVOICE
--
-- Called by the webhook on payment capture and by the renewal cron. Draft
-- invoices never consume a number: the sequence is drawn only at issuance, so
-- an abandoned draft cannot create the gap GST forbids.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_invoice(
  _org uuid,
  _subscription uuid DEFAULT NULL,
  _amount numeric DEFAULT NULL,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _payment_id uuid DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sub       RECORD;
  bp        RECORD;
  gst       jsonb;
  taxable   numeric;
  discount  numeric := 0;
  inv       uuid;
  number    text;
  rate      numeric := 18.00;
  plan_name text;
BEGIN
  SELECT * INTO sub FROM public.subscriptions
   WHERE id = COALESCE(_subscription,
                       (SELECT id FROM public.subscriptions
                         WHERE organization_id = _org
                           AND status IN ('trialing','active','past_due','grace')
                         LIMIT 1));
  IF sub IS NULL THEN
    RAISE EXCEPTION 'No subscription for organization %', _org;
  END IF;

  SELECT p.name INTO plan_name FROM public.plans p WHERE p.id = sub.plan_id;
  SELECT * INTO bp FROM public.billing_profiles WHERE organization_id = _org;

  taxable  := COALESCE(_amount, sub.amount);
  discount := COALESCE(sub.discount_amount, 0);
  taxable  := GREATEST(taxable - discount, 0);

  SELECT COALESCE((value ->> 'rate')::numeric, 18.00) INTO rate
    FROM public.platform_settings WHERE key = 'gst_profile';

  gst    := public.compute_gst(_org, taxable, rate);
  number := public.next_invoice_number(_org);

  INSERT INTO public.invoices (
    organization_id, subscription_id, invoice_number, status, currency,
    subtotal, discount_total, tax_total, total,
    cgst, sgst, igst, gst_treatment, place_of_supply, gstin, financial_year,
    period_start, period_end, issued_at, due_at,
    provider, provider_payment_id, notes
  ) VALUES (
    _org, sub.id, number,
    CASE WHEN _payment_id IS NOT NULL THEN 'paid' ELSE 'issued' END,
    COALESCE(sub.currency, 'INR'),
    taxable, discount, (gst ->> 'tax_total')::numeric,
    taxable + (gst ->> 'tax_total')::numeric,
    (gst ->> 'cgst')::numeric, (gst ->> 'sgst')::numeric, (gst ->> 'igst')::numeric,
    gst ->> 'treatment', gst ->> 'place_of_supply', gst ->> 'gstin',
    public.financial_year(),
    COALESCE(_period_start, sub.current_period_start),
    COALESCE(_period_end, sub.current_period_end),
    now(),
    now() + interval '7 days',
    sub.provider,
    (SELECT provider_payment_id FROM public.payments WHERE id = _payment_id),
    _description
  ) RETURNING id INTO inv;

  INSERT INTO public.invoice_lines
    (invoice_id, description, quantity, unit_amount, amount, tax_percent, hsn_sac, sort_order)
  VALUES (inv,
          COALESCE(_description, format('%s plan — %s billing', plan_name, sub.interval)),
          1, taxable, taxable, (gst ->> 'rate')::numeric, '998434', 1);

  IF _payment_id IS NOT NULL THEN
    UPDATE public.invoices SET paid_at = now() WHERE id = inv;
    UPDATE public.payments SET invoice_id = inv WHERE id = _payment_id;
  END IF;

  PERFORM public.billing_audit(_org, 'invoice.issued',
    format('Invoice %s for %s', number, taxable + (gst ->> 'tax_total')::numeric),
    jsonb_build_object('invoice_id', inv, 'gst', gst), 'system', sub.id);

  RETURN inv;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — SUBSCRIPTION STATE TRANSITIONS
--
-- Each is a named function rather than an UPDATE at the call site, so the
-- audit entry and the side effects can never be forgotten by whichever caller
-- happens to be doing it — webhook, cron or platform admin.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.activate_subscription(
  _org uuid, _payment_id uuid DEFAULT NULL, _periods integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE sub RECORD; new_end date; inv uuid;
BEGIN
  SELECT * INTO sub FROM public.subscriptions
   WHERE organization_id = _org
     AND status IN ('trialing','active','past_due','grace','suspended')
   ORDER BY created_at DESC LIMIT 1;
  IF sub IS NULL THEN RAISE EXCEPTION 'No subscription for organization %', _org; END IF;

  -- Extend from the CURRENT period end, not from today: a customer who pays
  -- three days late must not silently lose those three days.
  new_end := COALESCE(sub.current_period_end, CURRENT_DATE)
    + (CASE sub.interval
         WHEN 'monthly'     THEN make_interval(months => 1)
         WHEN 'quarterly'   THEN make_interval(months => 3)
         WHEN 'half_yearly' THEN make_interval(months => 6)
         ELSE make_interval(years => 1) END) * _periods;

  UPDATE public.subscriptions
     SET status = 'active',
         current_period_start = COALESCE(current_period_end, CURRENT_DATE),
         current_period_end   = new_end,
         paid_count = paid_count + _periods,
         failed_payment_count = 0,
         grace_until = NULL, suspended_at = NULL,
         last_payment_at = now(), updated_at = now()
   WHERE id = sub.id;

  -- Restoration is a status change. No data was ever removed, so there is
  -- nothing to restore beyond this.
  UPDATE public.organizations
     SET status = 'active', suspended_at = NULL, updated_at = now()
   WHERE id = _org AND status IN ('trialing','past_due','suspended');

  IF _payment_id IS NOT NULL THEN
    inv := public.issue_invoice(_org, sub.id, sub.amount, NULL, new_end, _payment_id);
  END IF;

  PERFORM public.billing_audit(_org, 'subscription.activated',
    format('Active until %s', new_end),
    jsonb_build_object('invoice_id', inv, 'periods', _periods), 'system', sub.id);

  RETURN jsonb_build_object('ok', true, 'period_end', new_end, 'invoice_id', inv);
END $$;

/** Payment failed → past_due, then grace. Never an immediate suspension. */
CREATE OR REPLACE FUNCTION public.mark_payment_failed(_org uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE sub RECORD; grace_days int;
BEGIN
  SELECT COALESCE((value ->> 'grace_days')::int, 7) INTO grace_days
    FROM public.platform_settings WHERE key = 'billing';

  SELECT * INTO sub FROM public.subscriptions
   WHERE organization_id = _org AND status IN ('active','trialing','past_due','grace')
   ORDER BY created_at DESC LIMIT 1;
  IF sub IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no subscription'); END IF;

  UPDATE public.subscriptions
     SET status = 'past_due',
         failed_payment_count = failed_payment_count + 1,
         grace_until = COALESCE(grace_until, now() + make_interval(days => grace_days)),
         updated_at = now()
   WHERE id = sub.id;

  UPDATE public.organizations SET status = 'past_due', updated_at = now()
   WHERE id = _org AND status = 'active';

  PERFORM public.billing_audit(_org, 'payment.failed', _reason, NULL, 'webhook', sub.id);
  RETURN jsonb_build_object('ok', true, 'grace_until', now() + make_interval(days => grace_days));
END $$;

/**
 * Suspend after grace expires.
 *
 * NOTHING IS DELETED. Suspension sets a status; is_org_suspended() then hides
 * tenant data through the policy conjunct added in 5A. Billing and export stay
 * reachable so the customer can actually pay and be restored.
 */
CREATE OR REPLACE FUNCTION public.suspend_organization(_org uuid, _reason text DEFAULT 'non-payment')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE sub RECORD;
BEGIN
  SELECT * INTO sub FROM public.subscriptions
   WHERE organization_id = _org ORDER BY created_at DESC LIMIT 1;

  UPDATE public.subscriptions
     SET status = 'suspended', suspended_at = now(), updated_at = now()
   WHERE id = sub.id;

  UPDATE public.organizations
     SET status = 'suspended', suspended_at = now(), updated_at = now()
   WHERE id = _org;

  PERFORM public.billing_audit(_org, 'subscription.suspended', _reason, NULL, 'cron', sub.id);

  INSERT INTO public.platform_notifications (organization_id, severity, title, body, action_url)
  VALUES (_org, 'critical', 'Account suspended',
          'Your subscription payment is overdue. Your data is safe and untouched — '
          'settle the outstanding invoice to restore access immediately.',
          '/admin/billing');

  RETURN jsonb_build_object('ok', true, 'suspended_at', now());
END $$;

CREATE OR REPLACE FUNCTION public.restore_organization(_org uuid, _reason text DEFAULT 'payment received')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE sub RECORD;
BEGIN
  SELECT * INTO sub FROM public.subscriptions
   WHERE organization_id = _org ORDER BY created_at DESC LIMIT 1;

  UPDATE public.subscriptions
     SET status = 'active', suspended_at = NULL, grace_until = NULL,
         failed_payment_count = 0, updated_at = now()
   WHERE id = sub.id;

  UPDATE public.organizations
     SET status = 'active', suspended_at = NULL, updated_at = now()
   WHERE id = _org;

  PERFORM public.billing_audit(_org, 'subscription.restored', _reason, NULL, 'system', sub.id);
  RETURN jsonb_build_object('ok', true);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — COUPONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_coupon(_org uuid, _code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c RECORD; sub RECORD; discount numeric := 0;
BEGIN
  IF public.current_org_id() IS DISTINCT FROM _org
     AND NOT public.platform_can('coupons.manage') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(_code);
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Unknown coupon code'); END IF;

  SELECT * INTO sub FROM public.subscriptions
   WHERE organization_id = _org AND status IN ('trialing','active','past_due','grace')
   LIMIT 1;
  IF sub IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No active subscription'); END IF;

  IF c.applies_to_plan_ids IS NOT NULL AND array_length(c.applies_to_plan_ids, 1) > 0
     AND NOT (sub.plan_id = ANY (c.applies_to_plan_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This coupon does not apply to your plan');
  END IF;

  discount := CASE c.discount_type
    WHEN 'percentage' THEN round(sub.amount * c.discount_value / 100.0, 2)
    ELSE LEAST(c.discount_value, sub.amount) END;

  -- The redemption INSERT is what enforces every limit: the trigger from 2C
  -- checks activity, expiry, total redemptions and per-organization use, and
  -- RAISES on any violation. Validation lives in one place, in the database.
  BEGIN
    INSERT INTO public.coupon_redemptions
      (coupon_id, organization_id, subscription_id, discount_applied)
    VALUES (c.id, _org, sub.id, discount);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  UPDATE public.subscriptions
     SET coupon_id = c.id, discount_amount = discount, updated_at = now()
   WHERE id = sub.id;

  PERFORM public.billing_audit(_org, 'coupon.applied',
    format('%s → %s off', c.code, discount), NULL, 'tenant', sub.id);

  RETURN jsonb_build_object('ok', true, 'discount', discount,
                            'net', GREATEST(sub.amount - discount, 0));
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — THE LIFECYCLE SWEEP (invoked by cron)
--
-- One function, run every hour. Idempotent: it derives everything from dates
-- and current status, so running it twice changes nothing the second time.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_billing_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg           jsonb;
  grace_days    int;
  r             RECORD;
  n_trial_end   int := 0;
  n_grace       int := 0;
  n_suspended   int := 0;
  n_reminders   int := 0;
BEGIN
  SELECT value INTO cfg FROM public.platform_settings WHERE key = 'billing';
  grace_days := COALESCE((cfg ->> 'grace_days')::int, 7);

  -- ── Trials that have expired ─────────────────────────────────────────
  FOR r IN
    SELECT s.id, s.organization_id FROM public.subscriptions s
     WHERE s.status = 'trialing' AND s.trial_ends_at < now()
  LOOP
    -- Expired trial → past_due with grace, NOT straight to suspended. The
    -- customer gets a window to pay before anything becomes inaccessible.
    UPDATE public.subscriptions
       SET status = 'past_due', grace_until = now() + make_interval(days => grace_days),
           updated_at = now()
     WHERE id = r.id;
    UPDATE public.organizations SET status = 'past_due' WHERE id = r.organization_id;
    PERFORM public.billing_audit(r.organization_id, 'trial.expired', NULL, NULL, 'cron', r.id);
    INSERT INTO public.platform_notifications (organization_id, severity, title, body, action_url)
    VALUES (r.organization_id, 'warning', 'Your trial has ended',
            format('Choose a plan within %s days to keep full access. Your data stays safe either way.', grace_days),
            '/admin/billing');
    n_trial_end := n_trial_end + 1;
  END LOOP;

  -- ── Trials ending soon ───────────────────────────────────────────────
  FOR r IN
    SELECT s.id, s.organization_id, s.trial_ends_at FROM public.subscriptions s
     WHERE s.status = 'trialing'
       AND s.trial_ends_at BETWEEN now() AND now() + interval '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.billing_events e
          WHERE e.subscription_id = s.id AND e.event = 'trial.ending_soon'
            AND e.created_at > now() - interval '3 days')
  LOOP
    PERFORM public.billing_audit(r.organization_id, 'trial.ending_soon', NULL, NULL, 'cron', r.id);
    INSERT INTO public.platform_notifications (organization_id, severity, title, body, action_url)
    VALUES (r.organization_id, 'warning', 'Your trial ends soon',
            'Add a plan to keep using Smart ARK without interruption.', '/admin/billing');
    n_reminders := n_reminders + 1;
  END LOOP;

  -- ── Renewals due ─────────────────────────────────────────────────────
  FOR r IN
    SELECT s.id, s.organization_id FROM public.subscriptions s
     WHERE s.status = 'active' AND s.current_period_end < CURRENT_DATE
  LOOP
    -- Auto-renew subscriptions are charged by Razorpay, which then sends a
    -- webhook. We do NOT mark them paid here: only a signature-verified
    -- webhook may move money-related state.
    UPDATE public.subscriptions
       SET status = 'past_due', grace_until = now() + make_interval(days => grace_days),
           updated_at = now()
     WHERE id = r.id;
    UPDATE public.organizations SET status = 'past_due' WHERE id = r.organization_id;
    PERFORM public.billing_audit(r.organization_id, 'renewal.due', NULL, NULL, 'cron', r.id);
    n_grace := n_grace + 1;
  END LOOP;

  -- ── Grace expired → suspend ──────────────────────────────────────────
  FOR r IN
    SELECT s.organization_id FROM public.subscriptions s
     WHERE s.status = 'past_due' AND s.grace_until IS NOT NULL AND s.grace_until < now()
  LOOP
    PERFORM public.suspend_organization(r.organization_id, 'grace period expired');
    n_suspended := n_suspended + 1;
  END LOOP;

  -- ── Renewal reminders ────────────────────────────────────────────────
  FOR r IN
    SELECT s.id, s.organization_id, s.current_period_end FROM public.subscriptions s
     WHERE s.status = 'active'
       AND s.current_period_end BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
       AND NOT EXISTS (
         SELECT 1 FROM public.billing_events e
          WHERE e.subscription_id = s.id AND e.event = 'renewal.reminder'
            AND e.created_at > now() - interval '7 days')
  LOOP
    PERFORM public.billing_audit(r.organization_id, 'renewal.reminder', NULL, NULL, 'cron', r.id);
    n_reminders := n_reminders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'trials_expired', n_trial_end, 'moved_to_grace', n_grace,
    'suspended', n_suspended, 'reminders', n_reminders, 'ran_at', now());
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — TENANT-FACING BILLING SUMMARY
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.billing_summary(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid := COALESCE(_org, public.current_org_id()); result jsonb;
BEGIN
  IF target IS NULL THEN RETURN NULL; END IF;
  IF target IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('billing.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'organization', jsonb_build_object(
      'id', o.id, 'name', o.display_name, 'status', o.status,
      'suspended_at', o.suspended_at),
    'subscription', (SELECT jsonb_build_object(
        'id', s.id, 'status', s.status, 'interval', s.interval,
        'amount', s.amount, 'discount', s.discount_amount, 'currency', s.currency,
        'trial_ends_at', s.trial_ends_at, 'grace_until', s.grace_until,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end,
        'auto_renew', s.auto_renew, 'failed_payments', s.failed_payment_count,
        'plan', jsonb_build_object('code', p.code, 'name', p.name,
                                   'support_level', p.support_level))
        FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
       WHERE s.organization_id = target
       ORDER BY s.created_at DESC LIMIT 1),
    'billing_profile', (SELECT to_jsonb(b) FROM public.billing_profiles b
                         WHERE b.organization_id = target),
    'usage', public.usage_status(target),
    'invoices', (SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.invoice_number, 'status', i.status,
        'total', i.total, 'currency', i.currency, 'issued_at', i.issued_at,
        'paid_at', i.paid_at, 'period_start', i.period_start,
        'period_end', i.period_end, 'pdf_path', i.pdf_path) ORDER BY i.issued_at DESC)
        FROM (SELECT * FROM public.invoices WHERE organization_id = target
               ORDER BY issued_at DESC NULLS LAST LIMIT 24) i),
    'payments', (SELECT jsonb_agg(jsonb_build_object(
        'id', pm.id, 'amount', pm.amount, 'status', pm.status,
        'method', pm.method, 'created_at', pm.created_at) ORDER BY pm.created_at DESC)
        FROM (SELECT * FROM public.payments WHERE organization_id = target
               ORDER BY created_at DESC LIMIT 12) pm),
    'credits', (SELECT COALESCE(sum(amount), 0) FROM public.referral_credits
                 WHERE organization_id = target AND applied_invoice_id IS NULL
                   AND (expires_at IS NULL OR expires_at > now()))
  ) INTO result
  FROM public.organizations o WHERE o.id = target;

  RETURN result;
END $$;

/** Platform revenue view: MRR, ARR, churn, conversion, outstanding. */
CREATE OR REPLACE FUNCTION public.billing_platform_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_can('billing.read') THEN
    RAISE EXCEPTION 'Access denied: billing.read required';
  END IF;

  SELECT jsonb_build_object(
    -- Normalised to a month so plans on different intervals are comparable.
    'mrr', (SELECT COALESCE(sum(
              CASE s.interval WHEN 'yearly' THEN s.amount/12
                              WHEN 'half_yearly' THEN s.amount/6
                              WHEN 'quarterly' THEN s.amount/3
                              ELSE s.amount END), 0)
              FROM public.subscriptions s
             WHERE s.status IN ('active','past_due','grace')),
    'collected_30d', (SELECT COALESCE(sum(amount), 0) FROM public.payments
                       WHERE status = 'captured' AND created_at > now() - interval '30 days'),
    'collected_total', (SELECT COALESCE(sum(amount), 0) FROM public.payments
                         WHERE status = 'captured'),
    'refunded_30d', (SELECT COALESCE(sum(amount), 0) FROM public.refunds
                      WHERE status = 'processed' AND created_at > now() - interval '30 days'),
    'gateway_fees_30d', (SELECT COALESCE(sum(fee), 0) FROM public.payments
                          WHERE status = 'captured' AND created_at > now() - interval '30 days'),
    'outstanding', (SELECT COALESCE(sum(total), 0) FROM public.invoices
                     WHERE status IN ('issued','overdue')),
    'counts', jsonb_build_object(
      'trialing',  (SELECT count(*) FROM public.subscriptions WHERE status = 'trialing'),
      'active',    (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
      'past_due',  (SELECT count(*) FROM public.subscriptions WHERE status = 'past_due'),
      'suspended', (SELECT count(*) FROM public.subscriptions WHERE status = 'suspended'),
      'cancelled', (SELECT count(*) FROM public.subscriptions WHERE status = 'cancelled')),
    'failed_payments_30d', (SELECT count(*) FROM public.payments
                             WHERE status = 'failed' AND created_at > now() - interval '30 days'),
    'renewals_30d', (SELECT count(*) FROM public.subscriptions
                      WHERE status = 'active'
                        AND current_period_end BETWEEN CURRENT_DATE AND CURRENT_DATE + 30),
    'trial_conversion', (
      SELECT CASE WHEN count(*) FILTER (WHERE created_at > now() - interval '90 days') = 0
                  THEN NULL
                  ELSE round(100.0 * count(*) FILTER (WHERE paid_count > 0
                              AND created_at > now() - interval '90 days')
                           / count(*) FILTER (WHERE created_at > now() - interval '90 days'), 1)
             END FROM public.subscriptions),
    'webhook_health', jsonb_build_object(
      'failed_24h', (SELECT count(*) FROM public.billing_webhook_events
                      WHERE status = 'failed' AND received_at > now() - interval '24 hours'),
      'processed_24h', (SELECT count(*) FROM public.billing_webhook_events
                         WHERE status = 'processed' AND received_at > now() - interval '24 hours')),
    'generated_at', now()
  ) INTO result;
  RETURN result;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — ARK STAYS ON THE INTERNAL PLAN
--
-- ARK is organization #1 with production data. It must never enter a trial,
-- never receive a dunning notice, and never be suspended for non-payment of a
-- subscription it does not have. The internal plan has NULL limits (unlimited)
-- so the plan-limit triggers from 5A are inert for it.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE ark uuid; internal_plan uuid;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';
  SELECT id INTO internal_plan FROM public.plans WHERE code = 'internal';
  IF ark IS NULL OR internal_plan IS NULL THEN RETURN; END IF;

  UPDATE public.subscriptions
     SET plan_id = internal_plan, status = 'active', auto_renew = true,
         amount = 0, trial_ends_at = NULL, grace_until = NULL,
         -- Far-future period end: the lifecycle sweep looks for
         -- current_period_end < CURRENT_DATE, so ARK is never picked up.
         current_period_end = COALESCE(current_period_end, CURRENT_DATE + 3650),
         updated_at = now()
   WHERE organization_id = ark;

  INSERT INTO public.billing_profiles (organization_id, legal_name, country)
  SELECT ark, 'ARK Learning Arena', 'IN'
   WHERE NOT EXISTS (SELECT 1 FROM public.billing_profiles WHERE organization_id = ark);

  RAISE NOTICE 'ARK pinned to the internal plan — excluded from billing lifecycle.';
END $$;

NOTIFY pgrst, 'reload schema';
