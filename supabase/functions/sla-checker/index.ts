import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gate: cron-only function. Without CRON_SECRET anyone could mint violations.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const provided = req.headers.get("x-cron-key");
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("[sla-checker] CRON_SECRET not set — function is open.");
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const violations: any[] = [];
    const alerts: any[] = [];
    const escalations: any[] = [];

    // Check strict mode
    const { data: settings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "strict_mode")
      .single();
    const strictMode = settings?.value === true || settings?.value === "true";

    // 1. Marks SLA: test results uploaded > 48 hours without verification
    const { data: unverifiedTests } = await supabase
      .from("test_results")
      .select("*, profiles!test_results_teacher_id_fkey(id, name)")
      .is("verified_at", null)
      .not("uploaded_at", "is", null);

    if (unverifiedTests) {
      for (const test of unverifiedTests) {
        const uploadedAt = new Date(test.uploaded_at);
        const hoursDiff = (now.getTime() - uploadedAt.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 48) {
          // Update SLA status
          await supabase.from("test_results").update({ sla_status: "breached" }).eq("id", test.id);

          violations.push({
            user_id: test.teacher_id,
            user_name: (test.profiles as any)?.name || "Unknown",
            type: "marks_sla",
            date: today,
            description: `Marks upload overdue >48hrs. Auto KPI deduction applied.`,
            auto_generated: true,
          });

          alerts.push({
            type: "danger",
            severity: strictMode ? "critical" : "warning",
            message: `⚡ Marks SLA breach: ${(test.profiles as any)?.name || "Teacher"} — marks unverified >48hrs`,
            related_user_id: test.teacher_id,
          });
        }
      }
    }

    // 2. Retest allocation > 24 hours (Admin penalty)
    const { data: pendingRetests } = await supabase
      .from("retests")
      .select("*")
      .eq("status", "pending");

    if (pendingRetests) {
      const overdueAllocations = pendingRetests.filter((r) => {
        const created = new Date(r.created_at);
        return (now.getTime() - created.getTime()) / (1000 * 60 * 60) > 24;
      });

      if (overdueAllocations.length > 0) {
        // Get admin profiles
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("role", "admin");

        for (const admin of admins || []) {
          violations.push({
            user_id: admin.id,
            user_name: admin.name,
            type: "retest_delay",
            date: today,
            description: `${overdueAllocations.length} retest allocation(s) pending >24hrs. Auto admin KPI deduction.`,
            auto_generated: true,
          });
        }

        alerts.push({
          type: "danger",
          severity: "critical",
          message: `⚡ ${overdueAllocations.length} retest allocations overdue >24hrs. Admin KPI penalized.`,
        });

        escalations.push({
          issue_type: "retest_delay",
          description: `${overdueAllocations.length} retests not allocated within 24hr SLA`,
          status: "open",
          date: today,
        });
      }
    }

    // 3. Retest completion > 5 days (Teacher penalty)
    const { data: allocatedRetests } = await supabase
      .from("retests")
      .select("*, profiles!retests_teacher_id_fkey(id, name)")
      .eq("status", "allocated")
      .not("allocated_at", "is", null);

    if (allocatedRetests) {
      for (const r of allocatedRetests) {
        const allocDate = new Date(r.allocated_at!);
        const daysDiff = (now.getTime() - allocDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 5) {
          violations.push({
            user_id: r.teacher_id,
            user_name: (r.profiles as any)?.name || "Unknown",
            type: "retest_delay",
            date: today,
            description: `Retest allocated ${Math.floor(daysDiff)} days ago, not completed. Auto KPI deduction.`,
            auto_generated: true,
          });
        }
      }
    }

    // 4. Walk-ins < 2/day (after 6pm or if strict mode)
    const hour = now.getHours();
    if (hour >= 18 || strictMode) {
      const { count: walkinCount } = await supabase
        .from("admission_calls")
        .select("*", { count: "exact", head: true })
        .eq("date", today)
        .eq("is_walkin", true);

      if ((walkinCount || 0) < 2) {
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("role", "admin");

        for (const admin of admins || []) {
          violations.push({
            user_id: admin.id,
            user_name: admin.name,
            type: "walk_in_miss",
            date: today,
            description: `Walk-ins today: ${walkinCount || 0}/2. Below minimum target.`,
            auto_generated: true,
          });
        }

        alerts.push({
          type: "warning",
          severity: "warning",
          message: `Walk-ins today: ${walkinCount || 0}/2 — below daily target`,
        });
      }
    }

    // 5. Absentee > 3 days without follow-up
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: absentRecords } = await supabase
      .from("student_attendance")
      .select("student_id, date")
      .eq("status", "absent")
      .gte("date", sevenDaysAgo.toISOString().split("T")[0]);

    if (absentRecords) {
      const absentCounts: Record<string, number> = {};
      for (const r of absentRecords) {
        absentCounts[r.student_id] = (absentCounts[r.student_id] || 0) + 1;
      }
      const chronicallyAbsent = Object.entries(absentCounts).filter(([, c]) => c >= 3);
      
      if (chronicallyAbsent.length > 0) {
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("role", "admin");

        for (const admin of admins || []) {
          violations.push({
            user_id: admin.id,
            user_name: admin.name,
            type: "attendance_gap",
            date: today,
            description: `${chronicallyAbsent.length} student(s) absent >3 days without follow-up.`,
            auto_generated: true,
          });
        }
      }
    }

    // Insert all violations (dedup by user_id + type + date)
    for (const v of violations) {
      const { data: existing } = await supabase
        .from("violations")
        .select("id")
        .eq("user_id", v.user_id)
        .eq("type", v.type)
        .eq("date", v.date)
        .maybeSingle();

      if (!existing) {
        await supabase.from("violations").insert(v);
      }
    }

    // Insert alerts
    for (const a of alerts) {
      await supabase.from("alerts").insert(a);
    }

    // Insert escalations
    for (const e of escalations) {
      await supabase.from("escalation_log").insert(e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        violations_created: violations.length,
        alerts_created: alerts.length,
        escalations_created: escalations.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
