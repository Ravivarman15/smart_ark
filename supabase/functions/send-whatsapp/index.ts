// ── send-whatsapp Edge Function ──────────────────────────────────────────────
// Server-side proxy for AiSensy WhatsApp API.
//
// WHY A PROXY?
//  • Direct browser → AiSensy calls fail due to CORS restrictions
//  • The API key must never be bundled into client-side JavaScript
//  • All WhatsApp sends go through this single function (audit trail)
//
// AUTH: Supabase platform validates the JWT at the network edge (verify_jwt=true
// in config.toml). Only authenticated users reach this function — no need for
// a second auth.getUser() call inside the function itself.
//
// REQUIRED SUPABASE SECRET:
//   supabase secrets set AISENSY_API_KEY=cf6ce8c962f8c5410750b
//
// REQUEST BODY (from client):
//   { campaignName, destination, recipientName, templateParams?, media? }
//
// RESPONSE:
//   { success: boolean, message: string }
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse request body ────────────────────────────────────────────────
    // Malformed JSON should return 400 (client error), not 500 (server error).
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { campaignName, destination, recipientName, templateParams, media } = body ?? {};

    if (!campaignName || !destination || !recipientName) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required fields: campaignName, destination, recipientName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── API key from Supabase secrets ─────────────────────────────────────
    const aisensyApiKey = Deno.env.get("AISENSY_API_KEY");
    if (!aisensyApiKey) {
      console.error("AISENSY_API_KEY secret not configured in Supabase");
      return new Response(
        JSON.stringify({
          success: false,
          message: "AISENSY_API_KEY not set. Go to Supabase Dashboard → Edge Functions → Secrets and add AISENSY_API_KEY.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Normalise destination (ensure + prefix) ───────────────────────────
    const digits = String(destination).replace(/[^0-9]/g, "");
    const dest   = "+" + digits;

    // ── Build AiSensy payload ─────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      apiKey:       aisensyApiKey,
      campaignName,
      destination:  dest,
      userName:     recipientName,
      source:       "smart-ark-edge-fn",
    };

    if (Array.isArray(templateParams) && templateParams.length > 0) {
      payload.templateParams = templateParams.map(String);
    }

    if (media?.url) {
      payload.media = media;
    }

    // ── Call AiSensy (server-to-server, no CORS issues) ───────────────────
    const aisensyRes = await fetch(AISENSY_API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    const responseText = await aisensyRes.text();
    let responseJson: any = {};
    try { responseJson = JSON.parse(responseText); } catch { /* plain text */ }

    // Log status only — the full response may contain PII or sensitive data.
    console.log(`AiSensy [${campaignName}] → ${dest}: HTTP ${aisensyRes.status}`);

    if (aisensyRes.ok) {
      return new Response(
        JSON.stringify({ success: true, message: "WhatsApp message sent successfully!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Surface upstream HTTP status on failure so the caller can distinguish
    // between "retriable" (5xx) and "fix your input" (4xx).
    return new Response(
      JSON.stringify({
        success: false,
        message: `AiSensy error (${aisensyRes.status}): ${responseJson?.message || aisensyRes.statusText}`,
      }),
      { status: aisensyRes.status >= 500 ? 502 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-whatsapp error:", err);
    return new Response(
      JSON.stringify({ success: false, message: `Server error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
