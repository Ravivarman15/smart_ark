// ──────────────────────────────────────────────────────────────────────────────
// BILLING CHECKOUT
//
// Creates the Razorpay objects a tenant admin needs to pay, and nothing else.
//
// ┌── WHAT THIS FUNCTION DELIBERATELY CANNOT DO ───────────────────────────┐
// │ It cannot activate a subscription. It cannot mark an invoice paid. It  │
// │ cannot lift a suspension. Those happen ONLY in razorpay-webhook, after │
// │ a signature verifies.                                                  │
// │                                                                        │
// │ The reason is that everything this function returns travels through    │
// │ the customer's browser. A checkout "success" callback is a hint that   │
// │ the user reached a page — not evidence that money moved.               │
// └────────────────────────────────────────────────────────────────────────┘
//
// Actions:
//   create_order         one-time payment (manual renewal / annual upfront)
//   create_subscription  recurring mandate (auto-renew)
//   verify_payment       optimistic UI confirmation ONLY — never activation
//   cancel_subscription  cancel at cycle end
//   apply_coupon         validate + attach a discount
//   refund               platform-only, capability-gated
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";
import {
  razorpay, razorpayConfig, razorpayPeriod, verifyPaymentSignature,
} from "../_shared/razorpay.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Periods to bill for a term — Razorpay wants a finite total_count. */
const TOTAL_COUNT: Record<string, number> = {
  monthly: 60, quarterly: 20, half_yearly: 10, yearly: 5,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const cfg = razorpayConfig();
    if (!cfg) {
      return jsonResponse(503, {
        error: "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }

    const db: Db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const caller = await resolveCaller(req, db);
    if (!caller) return jsonResponse(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";

    // ── Platform-only: refunds ────────────────────────────────────────────
    if (action === "refund") {
      const { data: pu } = await db.from("platform_users")
        .select("id, role, is_active").eq("user_id", caller.userId).maybeSingle();
      if (!pu?.is_active) return jsonResponse(403, { error: "Platform access required" });

      const { data: caps } = await db.from("platform_role_capabilities")
        .select("capability").eq("role", pu.role);
      const can = (caps ?? []).some((c: { capability: string }) => c.capability === "billing.manage");
      if (!can) return jsonResponse(403, { error: "billing.manage required" });

      const { paymentId, amount, reason } = body;
      const { data: pay } = await db.from("payments")
        .select("id, organization_id, provider_payment_id, amount")
        .eq("id", paymentId).maybeSingle();
      if (!pay) return jsonResponse(404, { error: "Payment not found" });

      const rp = await razorpay.refund(cfg, pay.provider_payment_id, {
        amount: amount ?? undefined,
        notes: { organization_id: pay.organization_id, reason: reason ?? "" },
      });

      // The row is created here so the action is recorded immediately; the
      // webhook flips it to `processed` when Razorpay confirms.
      await db.from("refunds").upsert({
        organization_id: pay.organization_id,
        payment_id: pay.id,
        provider: "razorpay",
        provider_refund_id: rp.id,
        amount: amount ?? pay.amount,
        status: "pending",
        reason,
        initiated_by: pu.id,
      }, { onConflict: "provider,provider_refund_id" });

      await db.rpc("billing_audit", {
        _org: pay.organization_id, _event: "refund.initiated",
        _detail: reason ?? null, _payload: { refund_id: rp.id },
        _actor: caller.email ?? "platform", _sub: null,
      });

      return jsonResponse(200, { ok: true, refundId: rp.id });
    }

    // ── Tenant actions: must be an admin of the organization ──────────────
    const org = caller.organizationId;
    if (!org) return jsonResponse(403, { error: "No organization context" });
    if (!caller.role || !["admin", "management"].includes(caller.role)) {
      return jsonResponse(403, { error: "Only an admin or management user can manage billing" });
    }

    const { data: orgRow } = await db.from("organizations")
      .select("id, display_name, slug, currency").eq("id", org).single();

    // ── apply_coupon ──────────────────────────────────────────────────────
    if (action === "apply_coupon") {
      // All validation (activity, expiry, limits) lives in the database
      // trigger, so there is exactly one place it can be wrong.
      const { data, error } = await db.rpc("apply_coupon", { _org: org, _code: body?.code ?? "" });
      if (error) return jsonResponse(400, { error: error.message });
      return jsonResponse(200, data);
    }

    // ── cancel_subscription ───────────────────────────────────────────────
    if (action === "cancel_subscription") {
      const { data: sub } = await db.from("subscriptions")
        .select("id, provider_subscription_id, current_period_end")
        .eq("organization_id", org).in("status", ["active", "past_due", "grace"]).maybeSingle();
      if (!sub) return jsonResponse(404, { error: "No active subscription" });

      if (sub.provider_subscription_id) {
        await razorpay.cancelSubscription(cfg, sub.provider_subscription_id, true);
      }
      // Cancel at CYCLE END, not immediately: the customer paid for this
      // period and keeps it. `cancel_at` records the intent; the webhook
      // finalises when the term actually ends.
      await db.from("subscriptions").update({
        auto_renew: false,
        cancel_at: sub.current_period_end,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);

      await db.rpc("billing_audit", {
        _org: org, _event: "subscription.cancel_requested",
        _detail: `Access continues until ${sub.current_period_end}`,
        _payload: null, _actor: caller.email ?? "tenant", _sub: sub.id,
      });

      return jsonResponse(200, { ok: true, accessUntil: sub.current_period_end });
    }

    // ── Shared setup for the two payment paths ────────────────────────────
    const { planCode, interval = "yearly" } = body;
    const { data: plan } = await db.from("plans")
      .select("id, code, name").eq("code", planCode).eq("is_active", true).maybeSingle();
    if (!plan) return jsonResponse(400, { error: `Unknown plan "${planCode}"` });

    const { data: price } = await db.from("plan_prices")
      .select("amount, currency, tax_percent")
      .eq("plan_id", plan.id).eq("interval", interval).eq("is_active", true).maybeSingle();
    if (!price) return jsonResponse(400, { error: `No ${interval} price for ${planCode}` });

    // GST computed server-side. A browser-supplied total is a discount the
    // customer chose for themselves.
    const { data: sub } = await db.from("subscriptions")
      .select("id, discount_amount").eq("organization_id", org)
      .in("status", ["trialing", "active", "past_due", "grace"]).maybeSingle();

    const netAmount = Math.max(Number(price.amount) - Number(sub?.discount_amount ?? 0), 0);
    const { data: gst } = await db.rpc("compute_gst", {
      _org: org, _taxable: netAmount, _rate: price.tax_percent ?? 18,
    });
    const total = netAmount + Number((gst as Record<string, unknown>)?.tax_total ?? 0);

    // Razorpay customer, idempotent by email.
    const { data: existingCustomer } = await db.from("billing_customers")
      .select("provider_customer_id").eq("organization_id", org)
      .eq("provider", "razorpay").maybeSingle();

    let customerId = existingCustomer?.provider_customer_id as string | undefined;
    if (!customerId) {
      const { data: profile } = await db.from("billing_profiles")
        .select("legal_name, billing_email, billing_phone")
        .eq("organization_id", org).maybeSingle();

      const customer = await razorpay.ensureCustomer(cfg, {
        name: profile?.legal_name ?? orgRow.display_name,
        email: profile?.billing_email ?? caller.email ?? `${orgRow.slug}@invalid.local`,
        contact: profile?.billing_phone ?? undefined,
        notes: { organization_id: org, slug: orgRow.slug },
      });
      customerId = customer.id;
      await db.from("billing_customers").upsert(
        { organization_id: org, provider: "razorpay", provider_customer_id: customerId },
        { onConflict: "organization_id,provider" },
      );
    }

    // ── create_order — one-time payment ───────────────────────────────────
    if (action === "create_order") {
      const order = await razorpay.createOrder(cfg, {
        amount: total,
        currency: price.currency ?? "INR",
        receipt: `${orgRow.slug}-${plan.code}-${Date.now()}`.slice(0, 40),
        // notes travel back on every webhook — this is how resolveOrg() maps
        // an event to a tenant without a lookup that could be ambiguous.
        notes: { organization_id: org, plan_code: plan.code, interval },
      });

      await db.rpc("billing_audit", {
        _org: org, _event: "checkout.order_created",
        _detail: `${plan.name} ${interval}`,
        _payload: { order_id: order.id, total, gst }, _actor: caller.email ?? "tenant", _sub: null,
      });

      return jsonResponse(200, {
        ok: true, mode: "order",
        keyId: cfg.keyId,                 // publishable by design
        orderId: order.id,
        amount: order.amount, currency: order.currency,
        breakdown: { net: netAmount, gst, total },
        organization: orgRow.display_name,
        prefill: { email: caller.email, name: caller.name },
      });
    }

    // ── create_subscription — recurring mandate ───────────────────────────
    if (action === "create_subscription") {
      const { period, interval: rzpInterval } = razorpayPeriod(interval);

      // A Razorpay plan per (our plan × interval), created once and reused.
      let providerPlanId = sub?.provider_plan_id as string | undefined;
      if (!providerPlanId) {
        const rzpPlan = await razorpay.createPlan(cfg, {
          period, interval: rzpInterval,
          name: `${plan.name} (${interval})`,
          amount: total,
          currency: price.currency ?? "INR",
          notes: { plan_code: plan.code, billing_interval: interval },
        });
        providerPlanId = rzpPlan.id;
      }

      const rzpSub = await razorpay.createSubscription(cfg, {
        planId: providerPlanId,
        customerId: customerId!,
        totalCount: TOTAL_COUNT[interval] ?? 5,
        notes: { organization_id: org, plan_code: plan.code, interval },
      });

      await db.from("subscriptions").update({
        plan_id: plan.id, interval, amount: price.amount,
        currency: price.currency ?? "INR",
        provider: "razorpay",
        provider_subscription_id: rzpSub.id,
        provider_plan_id: providerPlanId,
        short_url: rzpSub.short_url,
        total_count: rzpSub.total_count,
        auto_renew: true,
        updated_at: new Date().toISOString(),
        // status is NOT set here. Only the webhook may mark a subscription
        // active, and only after money has actually moved.
      }).eq("organization_id", org);

      await db.rpc("billing_audit", {
        _org: org, _event: "checkout.subscription_created",
        _detail: `${plan.name} ${interval}`,
        _payload: { subscription_id: rzpSub.id, total },
        _actor: caller.email ?? "tenant", _sub: sub?.id ?? null,
      });

      return jsonResponse(200, {
        ok: true, mode: "subscription",
        keyId: cfg.keyId,
        subscriptionId: rzpSub.id,
        shortUrl: rzpSub.short_url,
        breakdown: { net: netAmount, gst, total },
        organization: orgRow.display_name,
        prefill: { email: caller.email, name: caller.name },
      });
    }

    // ── verify_payment — UI confirmation ONLY ─────────────────────────────
    if (action === "verify_payment") {
      const { orderId, paymentId, signature } = body;
      const ok = await verifyPaymentSignature(orderId, paymentId, signature, cfg.keySecret);

      // Even a VALID signature does not activate anything. It only tells the
      // browser it may show "payment received" instead of a spinner; the
      // webhook is what changes state, and it may arrive seconds later.
      return jsonResponse(200, {
        ok,
        activated: false,
        message: ok
          ? "Payment received. Your subscription activates the moment our payment provider confirms — usually within seconds."
          : "Could not verify this payment. If you were charged, it will be reconciled automatically.",
      });
    }

    return jsonResponse(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[billing-checkout]", e);
    return jsonResponse(500, { error: (e as Error).message });
  }
});
