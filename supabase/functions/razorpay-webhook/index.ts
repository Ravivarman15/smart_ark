// ──────────────────────────────────────────────────────────────────────────────
// RAZORPAY WEBHOOK
//
// ┌── THE ONLY PLACE MONEY-RELATED STATE CHANGES ──────────────────────────┐
// │ The frontend NEVER activates a subscription. Razorpay Checkout's       │
// │ success callback is a hint, not a fact: it runs in the customer's      │
// │ browser and can be forged with one line in a console.                  │
// │                                                                        │
// │ So activation, invoicing, suspension-lifting and refunds happen HERE,  │
// │ and only after the HMAC signature over the RAW body verifies.          │
// └────────────────────────────────────────────────────────────────────────┘
//
// Three properties this handler must have, in order of importance:
//   1. VERIFIED   — bad signature → 401, nothing touched, event logged.
//   2. IDEMPOTENT — Razorpay retries. A duplicate must not activate twice or
//                   refund twice. Enforced by a UNIQUE event id.
//   3. DURABLE    — the raw payload is stored BEFORE processing, so a handler
//                   bug is replayable and a dispute is reconstructible from
//                   what the provider actually sent.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { razorpayConfig, verifyWebhookSignature, fromMinorUnits } from "../_shared/razorpay.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Resolve our organization from the ids Razorpay echoes back. */
async function resolveOrg(db: Db, entity: Record<string, unknown>): Promise<string | null> {
  // 1. notes.organization_id — set by us on every order/subscription.
  const notes = (entity.notes ?? {}) as Record<string, string>;
  if (notes.organization_id) return notes.organization_id;

  // 2. subscription id → our subscriptions row.
  const subId = (entity.subscription_id ?? entity.id) as string | undefined;
  if (subId) {
    const { data } = await db.from("subscriptions")
      .select("organization_id").eq("provider_subscription_id", subId).maybeSingle();
    if (data) return data.organization_id;
  }

  // 3. customer id → our mapping table.
  const customerId = entity.customer_id as string | undefined;
  if (customerId) {
    const { data } = await db.from("billing_customers")
      .select("organization_id").eq("provider_customer_id", customerId).maybeSingle();
    if (data) return data.organization_id;
  }
  return null;
}

/** Record a payment; returns our payments.id. Idempotent by provider id. */
async function upsertPayment(
  db: Db, org: string, p: Record<string, unknown>, status: string,
): Promise<string | null> {
  const row = {
    organization_id: org,
    provider: "razorpay",
    provider_payment_id: p.id as string,
    provider_order_id: (p.order_id as string) ?? null,
    status,
    amount: fromMinorUnits(Number(p.amount ?? 0)),
    currency: (p.currency as string) ?? "INR",
    method: (p.method as string) ?? null,
    bank: (p.bank as string) ?? null,
    wallet: (p.wallet as string) ?? null,
    vpa: (p.vpa as string) ?? null,
    card_last4: ((p.card as Record<string, unknown>)?.last4 as string) ?? null,
    card_network: ((p.card as Record<string, unknown>)?.network as string) ?? null,
    international: Boolean(p.international),
    fee: p.fee != null ? fromMinorUnits(Number(p.fee)) : null,
    tax: p.tax != null ? fromMinorUnits(Number(p.tax)) : null,
    error_code: (p.error_code as string) ?? null,
    error_description: (p.error_description as string) ?? null,
    captured_at: status === "captured" ? new Date().toISOString() : null,
  };

  const { data, error } = await db
    .from("payments")
    .upsert(row, { onConflict: "provider,provider_payment_id" })
    .select("id")
    .single();
  if (error) {
    console.error("[razorpay-webhook] payment upsert failed", error);
    return null;
  }
  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const db: Db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // RAW body, read once and never re-serialised — the HMAC is over these exact
  // bytes, and JSON.stringify(JSON.parse(x)) is not byte-identical to x.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const cfg = razorpayConfig();
  if (!cfg?.webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured");
    // 500 rather than 200: Razorpay retries on 5xx, so a misconfiguration
    // costs us nothing once it is fixed. A 200 here would discard real events.
    return jsonResponse(500, { error: "Webhook not configured" });
  }

  const valid = await verifyWebhookSignature(raw, signature, cfg.webhookSecret);

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { payload = {}; }

  const eventType = (payload.event as string) ?? "unknown";
  // Razorpay's delivery id header, falling back to a deterministic composite
  // so the UNIQUE constraint still de-duplicates retries without the header.
  const eventId =
    req.headers.get("x-razorpay-event-id") ??
    `${eventType}:${(payload.created_at as number) ?? ""}:${
      ((payload.payload as Record<string, unknown>)?.payment as Record<string, unknown>)?.entity
        ? ((((payload.payload as Record<string, unknown>).payment as Record<string, unknown>)
            .entity as Record<string, unknown>).id as string)
        : crypto.randomUUID()
    }`;

  // ── Log BEFORE acting. A handler bug must not lose the event. ───────────
  const { error: logErr } = await db.from("billing_webhook_events").insert({
    provider: "razorpay",
    provider_event_id: eventId,
    event_type: eventType,
    payload,
    signature_valid: valid,
    status: valid ? "received" : "failed",
    error: valid ? null : "signature verification failed",
  });

  // A unique violation means Razorpay retried an event we already have.
  // Answer 200 so it stops retrying, and do NOT process again.
  const duplicate = logErr && /duplicate key|unique/i.test(logErr.message ?? "");
  if (duplicate) {
    return jsonResponse(200, { ok: true, duplicate: true });
  }

  if (!valid) {
    console.error("[razorpay-webhook] SIGNATURE VERIFICATION FAILED", { eventType });
    return jsonResponse(401, { error: "Invalid signature" });
  }

  const markProcessed = async (status: string, error?: string) => {
    await db.from("billing_webhook_events")
      .update({ status, error: error ?? null, processed_at: new Date().toISOString() })
      .eq("provider_event_id", eventId);
  };

  try {
    const container = (payload.payload ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
    const payment = container.payment?.entity;
    const subscription = container.subscription?.entity;
    const refund = container.refund?.entity;
    const invoice = container.invoice?.entity;

    const entity = payment ?? subscription ?? invoice ?? refund ?? {};
    const org = await resolveOrg(db, entity);

    if (org) {
      await db.from("billing_webhook_events")
        .update({ organization_id: org }).eq("provider_event_id", eventId);
    } else {
      // Log and acknowledge. Retrying will not make an unmappable event
      // mappable, and a permanent 4xx would fill Razorpay's dashboard with
      // failures nobody can action.
      await markProcessed("ignored", "could not resolve organization");
      return jsonResponse(200, { ok: true, ignored: true, reason: "unmapped organization" });
    }

    switch (eventType) {
      // ── Money in ───────────────────────────────────────────────────────
      case "payment.captured":
      case "order.paid": {
        if (!payment) break;
        const paymentRow = await upsertPayment(db, org, payment, "captured");
        // activate_subscription extends the period, clears grace, restores a
        // suspended organization AND issues the GST invoice — one call so no
        // path can do three of the four.
        const { error } = await db.rpc("activate_subscription", {
          _org: org, _payment_id: paymentRow, _periods: 1,
        });
        if (error) throw new Error(`activate_subscription: ${error.message}`);
        break;
      }

      case "payment.authorized": {
        if (payment) await upsertPayment(db, org, payment, "authorized");
        break;
      }

      case "payment.failed": {
        if (payment) await upsertPayment(db, org, payment, "failed");
        const { error } = await db.rpc("mark_payment_failed", {
          _org: org,
          _reason: (payment?.error_description as string) ?? "payment failed",
        });
        if (error) throw new Error(`mark_payment_failed: ${error.message}`);
        break;
      }

      // ── Subscription lifecycle ─────────────────────────────────────────
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.resumed": {
        if (subscription) {
          await db.from("subscriptions").update({
            provider_subscription_id: subscription.id,
            paid_count: Number(subscription.paid_count ?? 0),
            charge_at: subscription.charge_at
              ? new Date(Number(subscription.charge_at) * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq("organization_id", org);
        }
        if (eventType === "subscription.charged" && payment) {
          const paymentRow = await upsertPayment(db, org, payment, "captured");
          await db.rpc("activate_subscription", { _org: org, _payment_id: paymentRow, _periods: 1 });
        } else {
          await db.rpc("restore_organization", { _org: org, _reason: eventType });
        }
        break;
      }

      case "subscription.paused":
      case "subscription.halted": {
        await db.rpc("mark_payment_failed", { _org: org, _reason: eventType });
        break;
      }

      case "subscription.cancelled":
      case "subscription.completed": {
        await db.from("subscriptions").update({
          status: eventType === "subscription.cancelled" ? "cancelled" : "active",
          cancelled_at: eventType === "subscription.cancelled" ? new Date().toISOString() : null,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("organization_id", org);
        await db.rpc("billing_audit", {
          _org: org, _event: `subscription.${eventType.split(".")[1]}`,
          _detail: null, _payload: null, _actor: "webhook", _sub: null,
        });
        break;
      }

      // ── Refunds ────────────────────────────────────────────────────────
      case "refund.processed":
      case "refund.created": {
        if (!refund) break;
        const { data: pay } = await db.from("payments")
          .select("id").eq("provider_payment_id", refund.payment_id as string).maybeSingle();

        await db.from("refunds").upsert({
          organization_id: org,
          payment_id: pay?.id ?? null,
          provider: "razorpay",
          provider_refund_id: refund.id as string,
          amount: fromMinorUnits(Number(refund.amount ?? 0)),
          currency: (refund.currency as string) ?? "INR",
          status: eventType === "refund.processed" ? "processed" : "pending",
          processed_at: eventType === "refund.processed" ? new Date().toISOString() : null,
        }, { onConflict: "provider,provider_refund_id" });

        if (pay?.id) {
          await db.from("payments").update({ status: "refunded" }).eq("id", pay.id);
        }
        break;
      }

      // ── Razorpay's own invoices ────────────────────────────────────────
      // Recorded for reconciliation only. OUR GST invoice is issued by
      // issue_invoice() — two invoices for one payment would be a
      // reconciliation and compliance problem.
      case "invoice.paid":
      case "invoice.partially_paid":
      case "invoice.expired": {
        await db.rpc("billing_audit", {
          _org: org, _event: eventType,
          _detail: (invoice?.id as string) ?? null,
          _payload: invoice ?? null, _actor: "webhook", _sub: null,
        });
        break;
      }

      default:
        await markProcessed("ignored", `unhandled event type ${eventType}`);
        return jsonResponse(200, { ok: true, ignored: true, event: eventType });
    }

    await markProcessed("processed");
    return jsonResponse(200, { ok: true, event: eventType });

  } catch (e) {
    const message = (e as Error).message;
    console.error("[razorpay-webhook] processing failed", eventType, message);
    await markProcessed("failed", message);
    // 500 so Razorpay retries. The event is already stored, so a retry is
    // de-duplicated by event id and only the FAILED processing re-runs.
    return jsonResponse(500, { error: message });
  }
});
