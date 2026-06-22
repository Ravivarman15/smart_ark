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
// Retry ONLY for these provider/server statuses. Everything else (incl. 401/403/
// 404 auth/permission/not-found, 4xx, network) is a permanent failure — no retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const classify = (status: number): "transient" | "permanent" =>
  RETRYABLE_STATUSES.has(status) ? "transient" : "permanent";

// ── Ordered Meta utility template params ─────────────────────────────────────
// KEEP IN LOCKSTEP with src/features/leads/utils/templateParams.ts.
// Meta utility templates take positional params ({{1}},{{2}},…). Map the queue
// payload (resolved variable map) to the ordered array per template; fall back
// to the single rendered body for templates without a positional spec.
const tVal = (p: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};
const TEMPLATE_PARAM_SPECS: Record<string, (p: Record<string, unknown>) => string[]> = {
  lead_welcome: (p) => [tVal(p, "student_name"), tVal(p, "course_name", "course")],
  lead_assigned_counselor: (p) => [
    tVal(p, "counselor_name"),
    tVal(p, "student_name"),
    tVal(p, "course_name", "course"),
    tVal(p, "mobile_number", "mobile", "phone"),
  ],
  lead_followup_reminder: (p) => [
    tVal(p, "counselor_name"),
    tVal(p, "student_name"),
    tVal(p, "course_name", "course"),
  ],
  sla_breach_alert: (p) => [
    tVal(p, "counselor_name"),
    tVal(p, "student_name"),
    tVal(p, "course_name", "course"),
  ],
  demo_scheduled: (p) => [tVal(p, "student_name"), tVal(p, "course_name", "course")],
  admission_completed: (p) => [tVal(p, "student_name"), tVal(p, "course_name", "course")],
};
const buildTemplateParams = (templateName: string, payload: Record<string, unknown>): string[] => {
  const spec = TEMPLATE_PARAM_SPECS[templateName];
  if (spec) return spec(payload || {});
  const body = (payload || {})["__body"];
  return body !== undefined && body !== null ? [String(body)] : [];
};

// AiSensy Campaign API V2 expects the destination as bare digits WITH the
// country code and WITHOUT a leading "+", spaces or hyphens (e.g. 917305801869).
const normalizePhone = (phone: string): string => {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "91" + digits.slice(1);
  return digits; // already has CC (e.g. 12-digit 91XXXXXXXXXX) or other format
};

// STEP 6 — explicit debug-probe payload (TEST MODE; never touches the queue).
interface DebugProbe {
  campaignName?: string;
  destination?: string;
  templateParams?: unknown[];
  userName?: string;
  source?: string;
}

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
  context_type: string | null;
  context_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Trim defensively: copy-pasted secrets frequently carry a trailing newline
    // or surrounding whitespace, which makes AiSensy reject the key as ERR401.
    const apiKey = (Deno.env.get("AISENSY_API_KEY") || "").trim();
    const projectName = (Deno.env.get("AISENSY_PROJECT_NAME") || "").trim();
    const defaultCampaign = Deno.env.get("AISENSY_DEFAULT_CAMPAIGN") || "ark_broadcast_alert";

    // ── Secret diagnostics (NEVER log the key value itself) ─────────────────
    console.log("AISENSY_API_KEY_EXISTS", !!apiKey);
    console.log("AISENSY_API_KEY_LENGTH", apiKey.length);
    console.log("PROJECT", projectName);
    console.log("Using Project:", projectName);

    // A missing key is a hard stop — never burn a provider call without it.
    if (!apiKey) {
      throw new Error("AISENSY_API_KEY missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let campaignId: string | undefined;
    let limit = 50;
    let debug: DebugProbe | undefined;
    try {
      const body = await req.json();
      campaignId = body?.campaignId;
      if (Number.isFinite(body?.limit)) limit = Math.min(Math.max(1, body.limit), 200);
      if (body?.debug && typeof body.debug === "object") debug = body.debug as DebugProbe;
    } catch { /* defaults */ }

    // ── STEP 6 — TEST MODE (sendAiSensyDebug) ───────────────────────────────
    // POST { debug: { campaignName, destination, templateParams?, userName?, source? } }
    // Posts a single message to AiSensy and returns the raw status + body WITHOUT
    // reading or mutating message_queue / lead_whatsapp_logs. Use this to prove
    // whether a given campaign + params is accepted by AiSensy, independent of
    // the queue/automation. Never fires unless an explicit `debug` block is sent.
    if (debug && (debug.campaignName || debug.destination)) {
      const dest = normalizePhone(String(debug.destination ?? ""));
      const templateParams = Array.isArray(debug.templateParams)
        ? debug.templateParams.map((v) => String(v))
        : [];
      const requestBody = {
        apiKey,
        campaignName: debug.campaignName ?? "",
        destination: dest,
        userName: debug.userName || "ARK LEARNING ARENA",
        source: debug.source || "ARK Lead CRM Debug",
        templateParams,
        tags: [] as string[],
        attributes: {} as Record<string, unknown>,
      };
      console.log("send-aisensy [DEBUG] → request", {
        campaignName: requestBody.campaignName,
        destination: dest,
        templateParams,
      });
      let responseStatus = 0;
      let responseBody = "";
      try {
        const res = await fetch(AISENSY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        responseStatus = res.status;
        responseBody = await res.text();
      } catch (e) {
        responseStatus = 0;
        responseBody = (e as Error).message;
      }
      console.log("send-aisensy [DEBUG] ← response", {
        status: responseStatus,
        body: responseBody.slice(0, 1000),
      });
      return new Response(
        JSON.stringify({
          debug: true,
          campaignName: requestBody.campaignName,
          destination: dest,
          templateParams,
          responseStatus,
          responseBody,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();

    // ── Claim due rows: queued, scheduled, not waiting on backoff ───────────
    let q = supabase
      .from("message_queue")
      .select("id, channel, provider, template, recipient_name, recipient_phone, payload, campaign_id, retry_count, context_type, context_id")
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
      const payload = row.payload ?? {};
      const bodyText = String(payload["__body"] ?? "");
      // Ordered positional params for the Meta utility template (falls back to
      // the single rendered body for non-positional templates).
      const templateParams = buildTemplateParams(row.template || "", payload);

      // Guard: a row with no phone / no body should never have been queued —
      // fail it permanently rather than burn a provider call.
      if (!dest || !bodyText) {
        const reason = !dest ? "no destination phone" : "empty body";
        await supabase
          .from("message_queue")
          .update({ status: "failed", last_error: reason })
          .eq("id", row.id);
        await updateLeadLog(supabase, row, { status: "failed", error: reason });
        await audit(supabase, row, "fail", { reason: !dest ? "no_phone" : "empty_body" });
        failed += 1;
        continue;
      }

      const campaignName = row.template || defaultCampaign;
      const userName = row.recipient_name || "ARK LEARNING ARENA";
      const source = "ARK Lead CRM";
      // Official AiSensy Campaign API V2 body. apiKey goes IN THE BODY (no
      // Authorization header). Content-Type: application/json only.
      const requestBody = {
        apiKey,
        campaignName,
        destination: dest,
        userName,
        source,
        templateParams,
        tags: [] as string[],
        attributes: {} as Record<string, unknown>,
      };
      // STEP 1 — full per-row trace WITHOUT the apiKey. `template` is the queue
      // row's template, `campaignName` is what we send to AiSensy (they should
      // match), and `payload` is the stored variable map the params derive from.
      console.log("send-aisensy → request", {
        template: row.template,
        campaignName,
        destination: dest,
        userName,
        source,
        templateParams,
        payload,
      });

      let httpStatus = 0;
      let providerMsgId: string | null = null;
      let errText = "";
      let responseText = "";
      try {
        const res = await fetch(AISENSY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        httpStatus = res.status;
        responseText = await res.text();
        // Log response status + body.
        console.log("send-aisensy ← response", { status: httpStatus, body: responseText.slice(0, 1000) });
        try {
          const json = JSON.parse(responseText);
          providerMsgId = json?.messageId ?? json?.data?.messageId ?? null;
          if (!res.ok) errText = json?.message || json?.error || res.statusText;
        } catch {
          if (!res.ok) errText = responseText || res.statusText;
        }
      } catch (e) {
        httpStatus = 0;
        errText = (e as Error).message;
        console.log("send-aisensy ← network error", { message: errText });
      }

      if (httpStatus >= 200 && httpStatus < 300) {
        const sentAt = new Date().toISOString();
        await supabase
          .from("message_queue")
          .update({
            status: "sent",
            sent_at: sentAt,
            provider_message_id: providerMsgId,
            last_error: null,
            attempts: (row.retry_count ?? 0) + 1,
          })
          .eq("id", row.id);
        await supabase
          .from("comms_campaign_recipients")
          .update({ status: "sent", sent_at: sentAt })
          .eq("message_queue_id", row.id);
        await updateLeadLog(supabase, row, {
          status: "sent",
          provider_message_id: providerMsgId,
          sent_at: sentAt,
          error: null,
        });
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
        const lastError = `HTTP ${httpStatus}: ${errText}`.slice(0, 500);
        await supabase
          .from("message_queue")
          .update({
            status: "failed",
            retry_count: priorRetries + 1,
            last_error: lastError,
          })
          .eq("id", row.id);
        await supabase
          .from("comms_campaign_recipients")
          .update({ status: "failed", last_error: `HTTP ${httpStatus}` })
          .eq("message_queue_id", row.id);
        await updateLeadLog(supabase, row, { status: "failed", error: lastError });
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

// Best-effort lead_whatsapp_logs lifecycle update. Matches the log row by its
// message_queue_id link (app-originated sends) AND, for lead-context rows that
// weren't linked (edge-originated enqueues), flips the still-queued row for the
// same lead + template. Never blocks the drain.
async function updateLeadLog(
  supabase: ReturnType<typeof createClient>,
  row: QueueRow,
  patch: Record<string, unknown>,
) {
  try {
    await supabase.from("lead_whatsapp_logs").update(patch).eq("message_queue_id", row.id);
    if (row.context_type === "lead" && row.context_id) {
      await supabase
        .from("lead_whatsapp_logs")
        .update(patch)
        .eq("lead_id", row.context_id)
        .eq("template_key", row.template)
        .eq("status", "queued");
    }
  } catch { /* swallow */ }
}
