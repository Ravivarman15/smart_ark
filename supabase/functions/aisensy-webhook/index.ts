// ── aisensy-webhook Edge Function ────────────────────────────────────────────
// Ingests AiSensy delivery-status callbacks and writes them back onto
// `message_queue` (and the linked `comms_campaign_recipients`), so the
// Communication dashboard / reports show real Sent → Delivered → Read state
// instead of stopping at "sent".
//
// AUTH: external provider call — verify_jwt = false. Instead we require a shared
// secret (AISENSY_WEBHOOK_SECRET) supplied as ?secret= or the x-webhook-secret
// header, so only AiSensy (configured with the secret) can post here.
//
// EXPECTED PAYLOAD (AiSensy webhook — tolerant to field naming):
//   { messageId, status: "sent"|"delivered"|"read"|"failed", reason? }
//
// Configure in AiSensy dashboard → Webhooks → status callback URL:
//   https://<project>.functions.supabase.co/aisensy-webhook?secret=<secret>
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stampOrg } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const STATUS_MAP: Record<string, { queue: string; recipient: string; stamp?: string }> = {
  sent: { queue: "sent", recipient: "sent", stamp: "sent_at" },
  delivered: { queue: "delivered", recipient: "delivered", stamp: "delivered_at" },
  read: { queue: "read", recipient: "read", stamp: "read_at" },
  failed: { queue: "failed", recipient: "failed" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const secret = Deno.env.get("AISENSY_WEBHOOK_SECRET") || "";
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") || req.headers.get("x-webhook-secret") || "";
    if (!secret || provided !== secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body?.messageId ?? body?.data?.messageId ?? body?.id;
    const rawStatus: string = String(body?.status ?? body?.eventType ?? "").toLowerCase();
    const reason: string | undefined = body?.reason ?? body?.error;

    const mapped = STATUS_MAP[rawStatus];
    if (!messageId || !mapped) {
      return new Response(JSON.stringify({ ok: false, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    const queueUpdate: Record<string, unknown> = { status: mapped.queue };
    if (mapped.stamp) queueUpdate[mapped.stamp] = nowIso;
    if (mapped.queue === "failed" && reason) queueUpdate.last_error = String(reason).slice(0, 500);

    const { data: updated } = await supabase
      .from("message_queue")
      .update(queueUpdate)
      .eq("provider_message_id", messageId)
      // organization_id comes back with the row because comms_audit is
      // tenant-scoped and this is an UNAUTHENTICATED provider callback: there
      // is no caller to take a tenant from. The queue row we just matched is
      // the only trustworthy source — and the provider cannot influence which
      // row that is beyond supplying its own message id.
      .select("id, organization_id")
      .maybeSingle();

    const queueId = (updated as { id?: string } | null)?.id;
    const queueOrgId = (updated as { organization_id?: string } | null)?.organization_id;
    if (queueId) {
      const recUpdate: Record<string, unknown> = { status: mapped.recipient };
      if (mapped.stamp) recUpdate[mapped.stamp] = nowIso;
      await supabase.from("comms_campaign_recipients").update(recUpdate).eq("message_queue_id", queueId);
      await supabase.from("comms_audit").insert(stampOrg({
        entity_type: "webhook",
        entity_id: queueId,
        action: rawStatus === "failed" ? "fail" : rawStatus,
        actor_name: "aisensy-webhook",
        payload: { messageId, status: rawStatus, reason },
      }, queueOrgId, "webhook audit")).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({ ok: true, updated: !!queueId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aisensy-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
