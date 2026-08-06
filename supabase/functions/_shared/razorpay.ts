// ──────────────────────────────────────────────────────────────────────────────
// RAZORPAY CLIENT
//
// A thin, typed wrapper over the Razorpay REST API behind a PaymentGateway
// shape. The abstraction exists now — while there is exactly one provider —
// because retrofitting it once Stripe is needed for international customers
// means touching every call site under time pressure.
//
// CREDENTIALS live in edge-function secrets ONLY:
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
// The key ID is also needed by the browser for Checkout; it is public by
// design. The SECRET never leaves this runtime.
// ──────────────────────────────────────────────────────────────────────────────

const API = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function razorpayConfig(): RazorpayConfig | null {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: webhookSecret ?? "" };
}

function authHeader(c: RazorpayConfig): string {
  return `Basic ${btoa(`${c.keyId}:${c.keySecret}`)}`;
}

async function call<T>(
  c: RazorpayConfig, method: string, path: string, body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(c),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = (json as { error?: { description?: string; code?: string } }).error;
    // Surface Razorpay's own description: it is specific ("Customer already
    // exists", "amount must be at least 100") in a way a generic HTTP status
    // never is, and support will be reading these.
    throw new Error(
      `Razorpay ${method} ${path} → ${res.status}: ${err?.description ?? text.slice(0, 200)}`,
    );
  }
  return json as T;
}

// ── Amounts ─────────────────────────────────────────────────────────────────

/**
 * Razorpay works in the smallest currency unit — paise for INR.
 *
 * Rounding here rather than at call sites: `Math.round` on a float that came
 * from `numeric(14,2)` is exact for realistic amounts, and doing it in ONE
 * place means a rupee cannot go missing because two call sites disagreed.
 */
export const toMinorUnits = (amount: number): number => Math.round(amount * 100);
export const fromMinorUnits = (minor: number): number => minor / 100;

// ── Signature verification ──────────────────────────────────────────────────

/**
 * Verify a Razorpay webhook signature.
 *
 * ┌── THE MOST SECURITY-CRITICAL FUNCTION IN THE BILLING SYSTEM ───────────┐
 * │ Webhooks are how money-related state changes. Without verification,    │
 * │ anyone who learns the endpoint URL can POST                            │
 * │   { event: "payment.captured", ... }                                   │
 * │ and activate a subscription they never paid for.                       │
 * │                                                                        │
 * │ Two details that are easy to get wrong and fatal:                      │
 * │  1. The HMAC must be computed over the RAW REQUEST BODY, byte for      │
 * │     byte. Re-serialising the parsed JSON changes key order and         │
 * │     whitespace, and the signature will never match.                    │
 * │  2. The comparison must be CONSTANT TIME. A `===` on hex strings       │
 * │     leaks the signature one byte at a time under timing analysis.      │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export async function verifyWebhookSignature(
  rawBody: string, signature: string, secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature);
}

/** Constant-time string comparison — never short-circuits on first mismatch. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify the checkout handshake (order_id + payment_id signed with the key secret). */
export async function verifyPaymentSignature(
  orderId: string, paymentId: string, signature: string, keySecret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(keySecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${orderId}|${paymentId}`),
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature);
}

// ── API surface ─────────────────────────────────────────────────────────────

export interface RzpCustomer { id: string; name: string; email: string; contact?: string }
export interface RzpOrder { id: string; amount: number; currency: string; status: string; receipt?: string }
export interface RzpSubscription {
  id: string; plan_id: string; status: string; current_start: number | null;
  current_end: number | null; charge_at: number | null; paid_count: number;
  total_count: number | null; short_url: string | null;
}
export interface RzpPlan { id: string; period: string; interval: number; item: { name: string; amount: number; currency: string } }
export interface RzpRefund { id: string; payment_id: string; amount: number; status: string }

export const razorpay = {
  /** Idempotent by email — Razorpay 400s on a duplicate, which we treat as success. */
  async ensureCustomer(
    c: RazorpayConfig, args: { name: string; email: string; contact?: string; notes?: Record<string, string> },
  ): Promise<RzpCustomer> {
    try {
      return await call<RzpCustomer>(c, "POST", "/customers", {
        name: args.name, email: args.email, contact: args.contact,
        fail_existing: 0,      // return the existing customer instead of erroring
        notes: args.notes,
      });
    } catch (e) {
      const list = await call<{ items: RzpCustomer[] }>(c, "GET", `/customers?count=100`);
      const found = list.items.find((x) => x.email?.toLowerCase() === args.email.toLowerCase());
      if (found) return found;
      throw e;
    }
  },

  createOrder(
    c: RazorpayConfig,
    args: { amount: number; currency?: string; receipt: string; notes?: Record<string, string> },
  ): Promise<RzpOrder> {
    return call<RzpOrder>(c, "POST", "/orders", {
      amount: toMinorUnits(args.amount),
      currency: args.currency ?? "INR",
      receipt: args.receipt,
      // Auto-capture. Manual capture means an authorised payment can expire
      // uncaptured and the customer is debited-then-refunded for nothing.
      payment_capture: 1,
      notes: args.notes,
    });
  },

  createPlan(
    c: RazorpayConfig,
    args: { period: "monthly" | "quarterly" | "yearly"; interval: number;
            name: string; amount: number; currency?: string; notes?: Record<string, string> },
  ): Promise<RzpPlan> {
    return call<RzpPlan>(c, "POST", "/plans", {
      period: args.period, interval: args.interval,
      item: { name: args.name, amount: toMinorUnits(args.amount), currency: args.currency ?? "INR" },
      notes: args.notes,
    });
  },

  createSubscription(
    c: RazorpayConfig,
    args: { planId: string; customerId: string; totalCount: number;
            startAt?: number; notes?: Record<string, string> },
  ): Promise<RzpSubscription> {
    return call<RzpSubscription>(c, "POST", "/subscriptions", {
      plan_id: args.planId,
      customer_id: args.customerId,
      total_count: args.totalCount,
      // Razorpay emails its own invoices by default; we issue GST-compliant
      // ones ourselves, and two different invoices for one payment is a
      // reconciliation problem nobody enjoys.
      customer_notify: 0,
      start_at: args.startAt,
      notes: args.notes,
    });
  },

  cancelSubscription(c: RazorpayConfig, id: string, atCycleEnd = true): Promise<RzpSubscription> {
    return call<RzpSubscription>(c, "POST", `/subscriptions/${id}/cancel`, {
      cancel_at_cycle_end: atCycleEnd ? 1 : 0,
    });
  },

  fetchPayment(c: RazorpayConfig, id: string): Promise<Record<string, unknown>> {
    return call(c, "GET", `/payments/${id}`);
  },

  refund(
    c: RazorpayConfig, paymentId: string, args?: { amount?: number; notes?: Record<string, string> },
  ): Promise<RzpRefund> {
    return call<RzpRefund>(c, "POST", `/payments/${paymentId}/refund`, {
      amount: args?.amount ? toMinorUnits(args.amount) : undefined,
      speed: "normal",
      notes: args?.notes,
    });
  },
};

/** Razorpay period name for our billing interval. */
export function razorpayPeriod(interval: string): { period: "monthly" | "quarterly" | "yearly"; interval: number } {
  switch (interval) {
    case "monthly":     return { period: "monthly", interval: 1 };
    case "quarterly":   return { period: "quarterly", interval: 1 };
    // Razorpay has no half-yearly period; two quarters is the correct
    // expression of it and bills on the same cadence.
    case "half_yearly": return { period: "quarterly", interval: 2 };
    default:            return { period: "yearly", interval: 1 };
  }
}
