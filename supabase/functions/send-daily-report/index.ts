import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stampOrg } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── AiSensy config ────────────────────────────────────────────────────────
// Set this secret in Supabase dashboard → Project Settings → Edge Functions → Secrets
// or via CLI: supabase secrets set AISENSY_API_KEY=cf6ce8c962f8c5410750b
const AISENSY_API_URL   = "https://backend.aisensy.com/campaign/t1/api/v2";
const AISENSY_CAMPAIGN  = "ark_daily_report_summary";  // must match your AiSensy dashboard
const RECIPIENT_NAME    = "Management";            // display name in AiSensy CRM
const REPORT_RECIPIENT  = "+917358199217";         // +91 73581 99217 (management number, with +)

// ┌── THIS REPORT IS SINGLE-TENANT, AND SAYS SO ───────────────────────────┐
// │ The recipient number and the AiSensy campaign above are both ARK's,    │
// │ hardcoded. Every query below, however, used to run UNSCOPED — so from  │
// │ the day a second organization existed, ABC Academi's attendance, fees  │
// │ and violations were silently folded into the numbers WhatsApp'd to     │
// │ ARK's management. The totals were wrong and nothing said so.           │
// │                                                                        │
// │ Scoping every read to one organization is the correct fix for the      │
// │ report that exists. Making the report genuinely multi-tenant is a      │
// │ separate, product-level change: each tenant needs its own recipient    │
// │ number and its own Meta-approved template (this campaign name is       │
// │ ARK-branded), neither of which can be invented here.                   │
// │                                                                        │
// │ Override with DAILY_REPORT_ORG_SLUG if the owning tenant ever changes. │
// └────────────────────────────────────────────────────────────────────────┘
const REPORT_ORG_SLUG = Deno.env.get("DAILY_REPORT_ORG_SLUG") || "ark";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aisensyApiKey     = Deno.env.get("AISENSY_API_KEY") || "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body
    let triggerType = "scheduled";
    try {
      const body = await req.json();
      triggerType = body.trigger_type || "scheduled";
    } catch { /* default to scheduled */ }

    const isPreview = triggerType === "preview";
    const today = new Date().toISOString().split("T")[0];

    // The tenant this report describes. Resolved by slug, never from the
    // request body — this endpoint is reachable by any authenticated caller.
    const { data: reportOrg } = await supabase
      .from("organizations")
      .select("id, display_name")
      .ilike("slug", REPORT_ORG_SLUG)
      .is("deleted_at", null)
      .maybeSingle();
    if (!reportOrg) {
      return new Response(
        JSON.stringify({
          error: `Daily report is configured for organization "${REPORT_ORG_SLUG}", which does not exist. Set DAILY_REPORT_ORG_SLUG.`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const orgId = reportOrg.id as string;

    // ── Deduplicate: skip if already sent today (not preview) ─────────────
    if (!isPreview) {
      const { data: existing } = await supabase
        .from("daily_report_log")
        .select("id")
        .eq("organization_id", orgId)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ success: true, message: "Report already sent today", alreadySent: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Gather report data ────────────────────────────────────────────────

    const [
      { data: ihiData },
      { data: todayViolations, count: violationCount },
      { data: checklistItems },
      { count: pendingRetests },
      { count: completedRetests },
      { data: feeData },
      { data: teacherAttData },
      { data: admissionData },
      { data: studentAttData },
    ] = await Promise.all([
      supabase.from("ihi_trend").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(1),
      supabase.from("violations").select("*", { count: "exact" }).eq("organization_id", orgId).eq("date", today).eq("resolved", false),
      supabase.from("admin_checklist").select("*").eq("organization_id", orgId).eq("date", today),
      supabase.from("retests").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending"),
      supabase.from("retests").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "completed"),
      supabase.from("fee_transactions").select("amount, paid").eq("organization_id", orgId).eq("date", today),
      supabase.from("teacher_attendance").select("status").eq("organization_id", orgId).eq("date", today),
      supabase.from("admission_calls").select("is_walkin, status").eq("organization_id", orgId).eq("date", today),
      supabase.from("student_attendance").select("status").eq("organization_id", orgId).eq("date", today),
    ]);

    const latestIhi      = ihiData?.[0]?.ihi || 0;
    const checklistTotal = checklistItems?.length || 0;
    const checklistDone  = checklistItems?.filter((c: any) => c.completed)?.length || 0;
    const feesCollected  = feeData?.filter((f: any) => f.paid)?.reduce((s: number, f: any) => s + Number(f.amount), 0) || 0;
    const feesPending    = feeData?.filter((f: any) => !f.paid)?.reduce((s: number, f: any) => s + Number(f.amount), 0) || 0;
    const onTimeCount    = teacherAttData?.filter((t: any) => t.status === "on_time")?.length || 0;
    const lateCount      = teacherAttData?.filter((t: any) => t.status === "late")?.length || 0;
    const absentCount    = teacherAttData?.filter((t: any) => t.status === "absent")?.length || 0;
    const walkIns        = admissionData?.filter((a: any) => a.is_walkin)?.length || 0;
    const calls          = admissionData?.filter((a: any) => !a.is_walkin)?.length || 0;
    const conversions    = admissionData?.filter((a: any) => a.status === "converted")?.length || 0;
    const studentPresent = studentAttData?.filter((s: any) => s.status === "present")?.length || 0;
    const studentAbsent  = studentAttData?.filter((s: any) => s.status === "absent")?.length || 0;
    const studentTotal   = studentAttData?.length || 0;

    const reportData = {
      date: today, ihi: latestIhi,
      violations: violationCount || 0,
      checklist: { done: checklistDone, total: checklistTotal },
      retests: { pending: pendingRetests || 0, completed: completedRetests || 0 },
      fees: { collected: feesCollected, pending: feesPending },
      teacherAttendance: { onTime: onTimeCount, late: lateCount, absent: absentCount },
      admissions: { walkIns, calls, conversions },
      studentAttendance: { present: studentPresent, absent: studentAbsent, total: studentTotal },
    };

    // ── Build the report text (goes into templateParams[1]) ───────────────
    const reportText = [
      `IHI Score: ${latestIhi}/100`,
      `Checklist: ${checklistDone}/${checklistTotal} done`,
      `Teachers: ${onTimeCount} on-time | ${lateCount} late | ${absentCount} absent`,
      `Students: ${studentPresent}/${studentTotal} present`,
      `Retests: ${pendingRetests || 0} pending | ${completedRetests || 0} done`,
      `Fees collected: Rs.${feesCollected.toLocaleString()} | Pending: Rs.${feesPending.toLocaleString()}`,
      `Admissions: ${calls} calls | ${walkIns} walk-ins | ${conversions} conversions`,
      `Active violations: ${violationCount || 0}`,
      `Trigger: ${triggerType === "manual" ? "Manual" : isPreview ? "Preview" : "Auto (scheduled)"}`,
    ].join("\n");

    // Also build the full styled message (used for preview in DailyReport.tsx)
    const reportMessage = `📊 *ARK EDUCATION – Daily Report*
📅 Date: ${today}
━━━━━━━━━━━━━━━━━━━━

🏥 *IHI Score:* ${latestIhi}/100

📋 *Admin Checklist:* ${checklistDone}/${checklistTotal} completed

👩‍🏫 *Teacher Attendance:*
  ✅ On-time: ${onTimeCount}
  ⏰ Late: ${lateCount}
  ❌ Absent: ${absentCount}

🎓 *Student Attendance:*
  Present: ${studentPresent}/${studentTotal}
  Absent: ${studentAbsent}

📝 *Retests:*
  Pending: ${pendingRetests || 0}
  Completed: ${completedRetests || 0}

💰 *Fees:*
  Collected today: ₹${feesCollected.toLocaleString()}
  Pending: ₹${feesPending.toLocaleString()}

📞 *Admissions:*
  Calls: ${calls} | Walk-ins: ${walkIns}
  Conversions: ${conversions}

⚠️ *Active Violations:* ${violationCount || 0}

📌 Trigger: ${triggerType === "manual" ? "EOD Completion" : isPreview ? "Preview" : "Auto (11:59 PM)"}
━━━━━━━━━━━━━━━━━━━━`;

    // ── Preview mode — return data without sending or logging ─────────────
    if (isPreview) {
      return new Response(
        JSON.stringify({ success: true, preview: true, reportData, reportMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Send via AiSensy WhatsApp API ─────────────────────────────────────
    let sendStatus = "sent";
    let sendError: string | null = null;

    if (!aisensyApiKey) {
      sendStatus = "skipped";
      sendError = "AISENSY_API_KEY secret not set in Supabase edge function secrets.";
      console.warn(sendError);
    } else {
      try {
        const aisensyPayload = {
          apiKey:         aisensyApiKey,
          campaignName:   AISENSY_CAMPAIGN,
          destination:    REPORT_RECIPIENT,   // already has + prefix
          userName:       RECIPIENT_NAME,     // recipient display name in AiSensy CRM
          source:         "smart-ark-edge-fn",
          templateParams: [today, reportText],
        };

        const aisensyResponse = await fetch(AISENSY_API_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(aisensyPayload),
        });

        const responseText = await aisensyResponse.text();
        // Log status only — full body may contain PII / API keys.
        console.log("AiSensy API status:", aisensyResponse.status);

        if (!aisensyResponse.ok) {
          sendStatus = "failed";
          sendError  = `AiSensy API error (${aisensyResponse.status}): ${responseText}`;
          console.error(sendError);
        }
      } catch (apiError) {
        sendStatus = "failed";
        sendError  = `AiSensy API call failed: ${(apiError as Error).message}`;
        console.error(sendError);
      }
    }

    // ── Log report in database ────────────────────────────────────────────
    await supabase.from("daily_report_log").insert(stampOrg({
      date:         today,
      trigger_type: triggerType,
      status:       sendStatus,
      report_data:  reportData,
    }, orgId, "daily report log"));

    return new Response(
      JSON.stringify({
        success:       sendStatus === "sent",
        message:       sendStatus === "sent"
          ? "Daily report sent via WhatsApp"
          : `Report logged but send failed: ${sendError}`,
        reportData,
        reportMessage,
        triggerType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("send-daily-report error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
