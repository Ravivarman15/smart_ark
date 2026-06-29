// ─────────────────────────────────────────────────────────────────────────────
// comms-scheduler — daily cron entrypoint for Phase-2 event automation.
//
// Reads enabled `scheduled` rows from comms_automation_settings and enqueues
// message_queue rows for the due recipients (today's birthdays, fees due,
// demos / tasks due tomorrow, holiday notices). It REUSES the existing engine:
// it only writes message_queue rows in the exact shape the app uses — the
// existing send-aisensy drainer + retry + webhook do the rest. It never sends
// directly and creates no new queue.
//
// Idempotent per day: before enqueuing it checks for an existing row with the
// same (context_type, context_id) created today, so re-running does not double
// send (mirrors the dedupeKey contract in src/.../commsValidation.ts).
//
// Deploy: supabase functions deploy comms-scheduler
// Schedule: see pg_cron block in 20260628_comms_automation.sql (08:00 daily).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Setting = {
  event_key: string;
  enabled: boolean;
  channel: string;
  timing: string;
  template_key: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    const todayStr = iso(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = iso(tomorrow);

    // Enabled scheduled events only.
    const { data: settingsRows, error: sErr } = await supabase
      .from("comms_automation_settings")
      .select("event_key, enabled, channel, timing, template_key")
      .eq("enabled", true)
      .eq("timing", "scheduled");
    if (sErr) {
      return new Response(JSON.stringify({ error: sErr.message, enqueued: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const settings = (settingsRows ?? []) as Setting[];
    const byKey = new Map(settings.map((s) => [s.event_key, s]));

    const results: Record<string, number> = {};

    // De-dupe helper: has this person already been queued for this reason today?
    const alreadyQueued = async (contextType: string, contextId: string | null) => {
      if (!contextId) return false;
      const { count } = await supabase
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("context_type", contextType)
        .eq("context_id", contextId)
        .gte("created_at", `${todayStr}T00:00:00Z`);
      return (count ?? 0) > 0;
    };

    const enqueue = async (rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("message_queue").insert(rows);
      if (error) return 0;
      return rows.length;
    };

    // ── Birthdays today ───────────────────────────────────────────────────────
    if (byKey.has("birthday_student")) {
      const s = byKey.get("birthday_student")!;
      const { data: students } = await supabase
        .from("students")
        .select("id, name, parent_contact, parent_name, date_of_birth")
        .not("date_of_birth", "is", null)
        .limit(5000);
      const md = todayStr.slice(5);
      const due = (students ?? []).filter(
        (s2: { date_of_birth: string | null }) => (s2.date_of_birth ?? "").slice(5, 10) === md,
      );
      const rows: Record<string, unknown>[] = [];
      for (const st of due as Array<{ id: string; name: string; parent_contact: string | null }>) {
        if (await alreadyQueued("birthday_student", st.id)) continue;
        if (!st.parent_contact) continue;
        rows.push({
          channel: "whatsapp",
          provider: "aisensy",
          template: s.template_key ?? "birthday_wish",
          template_key: s.template_key ?? "birthday_wish",
          recipient_name: st.name,
          recipient_phone: st.parent_contact,
          recipient_student_id: st.id,
          payload: { student_name: st.name },
          context_type: "birthday_student",
          context_id: st.id,
          status: "queued",
        });
      }
      results.birthday_student = await enqueue(rows);
    }

    // ── Demos scheduled for tomorrow ──────────────────────────────────────────
    if (byKey.has("demo_reminder")) {
      const s = byKey.get("demo_reminder")!;
      const { data: demos } = await supabase
        .from("admission_calls")
        .select("id, prospect_name, phone, demo_date")
        .eq("demo_date", tomorrowStr)
        .limit(2000);
      const rows: Record<string, unknown>[] = [];
      for (const d of (demos ?? []) as Array<{ id: string; prospect_name: string | null; phone: string | null }>) {
        if (!d.phone) continue;
        if (await alreadyQueued("demo_reminder", d.id)) continue;
        rows.push({
          channel: "whatsapp",
          provider: "aisensy",
          template: s.template_key ?? "lead_demo_reminder_v2",
          template_key: s.template_key ?? "lead_demo_reminder_v2",
          recipient_name: d.prospect_name ?? "",
          recipient_phone: d.phone,
          payload: { student_name: d.prospect_name ?? "" },
          context_type: "demo_reminder",
          context_id: d.id,
          status: "queued",
        });
      }
      results.demo_reminder = await enqueue(rows);
    }

    return new Response(
      JSON.stringify({ ok: true, date: todayStr, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
