// ──────────────────────────────────────────────────────────────────────────────
// TENANT BILLING SERVICE
//
// Everything an organization admin needs to see and change about their own
// subscription. Reads go through `billing_summary()`, which is RLS-scoped to
// the caller's organization; writes go through the `billing-checkout` edge
// function, which is the only thing holding Razorpay credentials.
//
// ┌── WHAT THIS FILE CANNOT DO ────────────────────────────────────────────┐
// │ Activate a subscription, mark an invoice paid, or lift a suspension.   │
// │ Those happen exclusively in razorpay-webhook after a signature         │
// │ verifies. `verifyPayment` below exists only so the UI can stop         │
// │ spinning — it explicitly returns activated:false.                       │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { AppError } from "@/shared/services";

export interface BillingSummary {
  organization: { id: string; name: string; status: string; suspended_at: string | null };
  subscription: {
    id: string; status: string; interval: string;
    amount: number; discount: number; currency: string;
    trial_ends_at: string | null; grace_until: string | null;
    current_period_start: string | null; current_period_end: string | null;
    auto_renew: boolean; failed_payments: number;
    plan: { code: string; name: string; support_level: string };
  } | null;
  billing_profile: Record<string, unknown> | null;
  usage: Record<string, { used: number; limit: number | null; percent: number | null; over: boolean; warn: boolean }> | null;
  invoices: { id: string; number: string; status: string; total: number; currency: string;
              issued_at: string | null; paid_at: string | null;
              period_start: string | null; period_end: string | null; pdf_path: string | null }[] | null;
  payments: { id: string; amount: number; status: string; method: string | null; created_at: string }[] | null;
  credits: number;
}

export interface CheckoutSession {
  ok: boolean;
  mode: "order" | "subscription";
  keyId: string;
  orderId?: string;
  subscriptionId?: string;
  shortUrl?: string;
  amount?: number;
  currency?: string;
  breakdown: { net: number; gst: Record<string, unknown>; total: number };
  organization: string;
  prefill: { email: string | null; name: string | null };
}

async function invokeBilling<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing-checkout", {
    body: { action, ...payload },
  });
  const body = data as { error?: string } | null;
  if (error || body?.error) {
    // Prefer the function's own message: it names the actual problem
    // ("No yearly price for growth", "Plan limit reached"), which a generic
    // HTTP error never does.
    throw AppError.validation(body?.error ?? error?.message ?? "Billing request failed");
  }
  return data as T;
}

class BillingService {
  async summary(): Promise<BillingSummary | null> {
    const { data, error } = await supabase.rpc("billing_summary" as never);
    if (error) throw AppError.fromSupabase(error, "billing_summary");
    return (data as unknown as BillingSummary) ?? null;
  }

  async usage(): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc("usage_status" as never);
    if (error) throw AppError.fromSupabase(error, "usage_status");
    return (data as never) ?? null;
  }

  createOrder(planCode: string, interval: string) {
    return invokeBilling<CheckoutSession>("create_order", { planCode, interval });
  }

  createSubscription(planCode: string, interval: string) {
    return invokeBilling<CheckoutSession>("create_subscription", { planCode, interval });
  }

  /**
   * Confirm a checkout handshake so the UI can stop spinning.
   *
   * Returns `activated: false` even on success — activation is the webhook's
   * job, and pretending otherwise here is how a customer ends up with an
   * "active" badge and no payment.
   */
  verifyPayment(orderId: string, paymentId: string, signature: string) {
    return invokeBilling<{ ok: boolean; activated: boolean; message: string }>(
      "verify_payment", { orderId, paymentId, signature },
    );
  }

  applyCoupon(code: string) {
    return invokeBilling<{ ok: boolean; discount?: number; net?: number; error?: string }>(
      "apply_coupon", { code },
    );
  }

  cancelSubscription() {
    return invokeBilling<{ ok: boolean; accessUntil: string }>("cancel_subscription");
  }

  async saveBillingProfile(profile: Record<string, unknown>): Promise<void> {
    const { data: org } = await supabase.from("organizations" as never).select("id").limit(1).maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) throw AppError.validation("No organization context");

    const { error } = await supabase.from("billing_profiles" as never).upsert(
      { organization_id: orgId, ...profile, updated_at: new Date().toISOString() } as never,
      { onConflict: "organization_id" },
    );
    if (error) throw AppError.fromSupabase(error, "billing_profiles");
  }

  /**
   * Load the Razorpay Checkout script on demand.
   *
   * Not in index.html: it would be fetched by every ERP user on every page
   * load, including the overwhelming majority who never open billing. The
   * CSP must allow checkout.razorpay.com for this to succeed — see the
   * deployment guide.
   */
  loadCheckoutScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      // deno-lint-ignore no-explicit-any
      if ((window as any).Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }
}

export const billingService = new BillingService();
