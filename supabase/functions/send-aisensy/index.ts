// ── send-aisensy Edge Function ───────────────────────────────────────────────
// THE QUEUE DRAINER. This is the worker the communication module was designed
// around: `aisensyService.enqueue()` writes rows to `message_queue` (status
// 'queued') and this function drains them, posts to AiSensy server-to-server,
// writes delivery state back, retries transient failures with backoff, and logs
// every outcome to `comms_audit`.
//
// WHY THIS EXISTS
//   Before this function, `dispatchViaEdge()` invoked "send-aisensy" which was
//   never deployed — so queued rows sat forever and nothing was ever delivered
//   even though the UI said "queued". This closes that gap.
//
// INVOCATION
//   • App "Send" buttons → aisensyService.dispatchViaEdge() (authenticated JWT).
//   • Optional cron (pg_cron / scheduled trigger) for the steady-state drain.
//
// REQUIRED SUPABASE SECRETS
//   AISENSY_API_KEY            — provider key (server-side only)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-provided to edge functions
//   AISENSY_DEFAULT_CAMPAIGN   — (optional) AiSensy campaign used to send the
//                                rendered body as a single {{1}} param.
//                                Defaults to "ark_broadcast_alert".
//
// REQUEST BODY (all optional): { campaignId?: string, limit?: number }
// RESPONSE: { drained, sent, failed, retried }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

// Retry policy — keep in lockstep with src/features/communication/utils/retryPolicy.ts
const MAX_RETRIES = 3;
const BACKOFF_MINUTES = [1, 5, 30];
const backoff = (n: number) => BACKOFF_MINUTES[Math.min(Math.max(n, 0), BACKOFF_MINUTES.length - 1)];
const classify = (status: number): "transient" | "permanent" =>
  status === 0 || status === 429 || status >= 500 ? "transient" : "permanent";

const normalizePhone = (phone: string): string => {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  let withCC: string;
  if (digits.length === 10) withCC = "91" + digits;
  else if (digits.startsWith("0") && digits.length === 11) withCC = "91" + digits.slice(1);
  else withCC = digits;
  return withCC ? "+" + withCC : "";
};

interface QueueRow {
  id: string;
  channel: string;
  provider: string;
  template: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  payload: Record<string, unknown> | null;
  campaign_id: string | null;
  retry_count: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("AISENSY_API_KEY") || "";
    const defaultCampaign = Deno.env.get("AISENSY_DEFAULT_CAMPAIGN") || "ark_broadcast_alert";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AISENSY_API_KEY not configured in edge function secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let campaignId: string | undefined;
    let limit = 50;
    try {
      const body = await req.json();
      campaignId = body?.campaignId;
      if (Number.isFinite(body?.limit)) limit = Math.min(Math.max(1, body.limit), 200);
    } catch { /* defaults */ }

    const nowIso = new Date().toISOString();

    // ── Claim due rows: queued, scheduled, not waiting on backoff ───────────
    let q = supabase
      .from("message_queue")
      .select("id, channel, provider, template, recipient_name, recipient_phone, payload, campaign_id, retry_count")
      .eq("status", "queued")
      .eq("provider", "aisensy")
      .in("channel", ["whatsapp", "sms"])
      .lte("scheduled_at", nowIso)
      .or(`retry_at.is.null,retry_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (campaignId) q = q.eq("campaign_id", campaignId);

    const { data: rows, error: claimErr } = await q;
    if (claimErr) {
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queue = (rows ?? []) as QueueRow[];
    let sent = 0;
    let failed = 0;
    let retried = 0;

    for (const row of queue) {
      // Mark processing so a concurrent invocation doesn't double-send.
      await supabase
        .from("message_queue")
        .update({ status: "processing" })
        .eq("id", row.id)
        .eq("status", "queued");

      const dest = normalizePhone(row.recipient_phone ?? "");
      const bodyText = String((row.payload ?? {})["__body"] ?? "");

      // Guard: a row with no phone / no body should never have been queued —
      // fail it permanently rather than burn a provider call.
      if (!dest || !bodyText) {
        await supabase
          .from("message_queue")
          .update({ status: "failed", last_error: !dest ? "no destination phone" : "empty body" })
          .eq("id", row.id);
        await audit(supabase, row, "fail", { reason: !dest ? "no_phone" : "empty_body" });
        failed += 1;
        continue;
      }

      let httpStatus = 0;
      let providerMsgId: string | null = null;
      let errText = "";
      try {
        const res = await fetch(AISENSY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            campaignName: row.template || defaultCampaign,
            destination: dest,
            userName: row.recipient_name || "Customer",
            source: "smart-ark-send-aisensy",
            templateParams: [bodyText],
          }),
        });
        httpStatus = res.status;
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          providerMsgId = json?.messageId ?? json?.data?.messageId ?? null;
          if (!res.ok) errText = json?.message || res.statusText;
        } catch {
          if (!res.ok) errText = text || res.statusText;
        }
      } catch (e) {
        httpStatus = 0;
        errText = (e as Error).message;
      }

      if (httpStatus >= 200 && httpStatus < 300) {
        await supabase
          .from("message_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: providerMsgId,
            last_error: null,
            attempts: (row.retry_count ?? 0) + 1,
          })
          .eq("id", row.id);
        await supabase
          .from("comms_campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("message_queue_id", row.id);
        await audit(supabase, row, "send", { providerMessageId: providerMsgId });
        sent += 1;
        continue;
      }

      // ── Failure → backoff or permanent fail ────────────────────────────
      const priorRetries = row.retry_count ?? 0;
      const transient = classify(httpStatus) === "transient" && priorRetries < MAX_RETRIES;
      if (transient) {
        const retryAt = new Date(Date.now() + backoff(priorRetries) * 60_000).toISOString();
        await supabase
          .from("message_queue")
          .update({
            status: "queued",
            retry_count: priorRetries + 1,
            retry_at: retryAt,
            last_error: `HTTP ${httpStatus}: ${errText}`.slice(0, 500),
          })
          .eq("id", row.id);
        await audit(supabase, row, "retry", { httpStatus, retryAt });
        retried += 1;
      } else {
        await supabase
          .from("message_queue")
          .update({
            status: "failed",
            retry_count: priorRetries + 1,
            last_error: `HTTP ${httpStatus}: ${errText}`.slice(0, 500),
          })
          .eq("id", row.id);
        await supabase
          .from("comms_campaign_recipients")
          .update({ status: "failed", last_error: `HTTP ${httpStatus}` })
          .eq("message_queue_id", row.id);
        await audit(supabase, row, "fail", { httpStatus, error: errText });
        failed += 1;
      }
    }

    console.log(`send-aisensy: drained ${queue.length} (sent ${sent}, failed ${failed}, retried ${retried})`);
    return new Response(JSON.stringify({ drained: queue.length, sent, failed, retried }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-aisensy error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Best-effort audit write — never block the drain on an audit failure.
async function audit(
  supabase: ReturnType<typeof createClient>,
  row: QueueRow,
  action: string,
  payload: Record<string, unknown>,
) {
  try {
    await supabase.from("comms_audit").insert({
      entity_type: "queue",
      entity_id: row.id,
      action,
      actor_name: "send-aisensy",
      payload: { campaignId: row.campaign_id, template: row.template, ...payload },
    });
  } catch { /* swallow */ }
}
