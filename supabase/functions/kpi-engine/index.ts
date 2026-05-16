import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gate: cron-only function. Scheduler must send `x-cron-key` matching the
  // CRON_SECRET env var. Without this any anon caller could trigger heavy
  // KPI recomputation as a DoS vector.
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
    console.warn("[kpi-engine] CRON_SECRET not set — function is open. Set it in Supabase Dashboard → Edge Functions → Secrets.");
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const today = now.toISOString().split("T")[0];
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

    // Get all teachers
    const { data: teachers } = await supabase
      .from("profiles")
      .select("id, name, campus_id")
      .eq("role", "teacher")
      .eq("is_active", true);

    // Get all admins
    const { data: admins } = await supabase
      .from("profiles")
      .select("id, name, campus_id")
      .eq("role", "admin")
      .eq("is_active", true);

    const snapshots: any[] = [];

    // TEACHER KPI CALCULATION
    for (const teacher of teachers || []) {
      // Attendance score (10%): check-in compliance %
      const { data: attendanceRecords } = await supabase
        .from("teacher_attendance")
        .select("status")
        .eq("teacher_id", teacher.id)
        .gte("date", monthStart);
      
      const totalDays = attendanceRecords?.length || 1;
      const onTimeDays = attendanceRecords?.filter((a) => a.status === "on_time").length || 0;
      const attendanceScore = Math.round((onTimeDays / totalDays) * 100);

      // Academic execution (30%): class logs completion %
      const { data: classLogs } = await supabase
        .from("class_logs")
        .select("conducted, portion_completed_pct")
        .eq("teacher_id", teacher.id)
        .gte("date", monthStart);
      
      const totalLogs = classLogs?.length || 1;
      const conductedLogs = classLogs?.filter((l) => l.conducted).length || 0;
      const academicScore = Math.round((conductedLogs / totalLogs) * 100);

      // Marks SLA (20%): % marks uploaded within 48hrs
      const { data: testResults } = await supabase
        .from("test_results")
        .select("sla_status")
        .eq("teacher_id", teacher.id)
        .gte("test_date", monthStart);
      
      const totalTests = testResults?.length || 1;
      const withinSla = testResults?.filter((t) => t.sla_status === "within").length || 0;
      const marksSlaScore = Math.round((withinSla / totalTests) * 100);

      // Portion completion (20%): from class logs
      const portionAvg = classLogs?.length
        ? Math.round(classLogs.reduce((s, l) => s + (l.portion_completed_pct || 0), 0) / classLogs.length)
        : 80;

      // Student improvement (15%): avg test-to-test improvement
      const studentImprovementScore = 75; // Default, would need historical comparison

      // Retest handling (5%): retest completion %
      const { data: retests } = await supabase
        .from("retests")
        .select("status")
        .eq("teacher_id", teacher.id)
        .gte("created_at", monthStart);
      
      const totalRetests = retests?.length || 1;
      const completedRetests = retests?.filter((r) => r.status === "completed").length || 0;
      const retestScore = Math.round((completedRetests / totalRetests) * 100);

      const finalKpi = Math.round(
        attendanceScore * 0.10 +
        academicScore * 0.30 +
        marksSlaScore * 0.20 +
        portionAvg * 0.20 +
        studentImprovementScore * 0.15 +
        retestScore * 0.05
      );

      snapshots.push({
        user_id: teacher.id,
        role: "teacher",
        month,
        year,
        attendance_score: attendanceScore,
        academic_execution_score: academicScore,
        marks_sla_score: marksSlaScore,
        portion_score: portionAvg,
        student_improvement_score: studentImprovementScore,
        retest_score: retestScore,
        final_kpi: finalKpi,
        campus_id: teacher.campus_id,
      });
    }

    // ADMIN KPI CALCULATION
    for (const admin of admins || []) {
      // Checklist (30%)
      const { data: checklist } = await supabase
        .from("admin_checklist")
        .select("completed")
        .eq("admin_id", admin.id)
        .gte("date", monthStart);
      
      const totalItems = checklist?.length || 1;
      const completedItems = checklist?.filter((c) => c.completed).length || 0;
      const checklistScore = Math.round((completedItems / totalItems) * 100);

      // Fee target (25%)
      const { data: fees } = await supabase
        .from("fee_transactions")
        .select("paid")
        .gte("date", monthStart);
      const totalFees = fees?.length || 1;
      const paidFees = fees?.filter((f) => f.paid).length || 0;
      const feeScore = Math.round((paidFees / totalFees) * 100);

      // Admission (20%): calls ≥10/day + walk-ins ≥2/day
      const { data: calls } = await supabase
        .from("admission_calls")
        .select("is_walkin, date")
        .gte("date", monthStart);
      
      const uniqueDates = [...new Set(calls?.map((c) => c.date) || [])];
      const daysWithEnoughCalls = uniqueDates.filter((d) => {
        const dayCalls = calls?.filter((c) => c.date === d) || [];
        const dayWalkins = dayCalls.filter((c) => c.is_walkin).length;
        return dayCalls.length >= 10 && dayWalkins >= 2;
      }).length;
      const admissionScore = uniqueDates.length > 0
        ? Math.round((daysWithEnoughCalls / uniqueDates.length) * 100)
        : 80;

      // Retest allocation SLA (10%)
      const { data: allRetests } = await supabase
        .from("retests")
        .select("status, created_at, allocated_at")
        .gte("created_at", monthStart);
      
      const retestsWithAllocation = allRetests?.filter((r) => r.allocated_at) || [];
      const withinSla = retestsWithAllocation.filter((r) => {
        const created = new Date(r.created_at);
        const allocated = new Date(r.allocated_at!);
        return (allocated.getTime() - created.getTime()) / (1000 * 60 * 60) <= 24;
      }).length;
      const retestSlaScore = retestsWithAllocation.length > 0
        ? Math.round((withinSla / retestsWithAllocation.length) * 100)
        : 85;

      // Marks verification SLA (10%)
      const marksVerifScore = 85; // Default

      // Student care (5%)
      const studentCareScore = 80; // Default

      const finalKpi = Math.round(
        checklistScore * 0.30 +
        feeScore * 0.25 +
        admissionScore * 0.20 +
        retestSlaScore * 0.10 +
        marksVerifScore * 0.10 +
        studentCareScore * 0.05
      );

      snapshots.push({
        user_id: admin.id,
        role: "admin",
        month,
        year,
        checklist_score: checklistScore,
        fee_score: feeScore,
        admission_score: admissionScore,
        retest_score: retestSlaScore,
        marks_sla_score: marksVerifScore,
        student_care_score: studentCareScore,
        final_kpi: finalKpi,
        campus_id: admin.campus_id,
      });
    }

    // Calculate IHI per campus
    const { data: campuses } = await supabase.from("campuses").select("id, name");
    
    for (const campus of campuses || []) {
      const campusTeacherSnapshots = snapshots.filter(
        (s) => s.role === "teacher" && s.campus_id === campus.id
      );
      const campusAdminSnapshots = snapshots.filter(
        (s) => s.role === "admin" && s.campus_id === campus.id
      );

      const avgTeacherKpi = campusTeacherSnapshots.length > 0
        ? campusTeacherSnapshots.reduce((s, t) => s + t.final_kpi, 0) / campusTeacherSnapshots.length
        : 80;
      
      const avgAdminKpi = campusAdminSnapshots.length > 0
        ? campusAdminSnapshots.reduce((s, a) => s + a.final_kpi, 0) / campusAdminSnapshots.length
        : 80;

      // Student avg for campus
      const { data: campusStudents } = await supabase
        .from("students")
        .select("spi")
        .eq("campus_id", campus.id)
        .eq("is_active", true);
      
      const studentAvg = campusStudents?.length
        ? campusStudents.reduce((s, st) => s + (st.spi || 0), 0) / campusStudents.length
        : 70;

      // Fee collection for campus
      const { data: campusFees } = await supabase
        .from("fee_transactions")
        .select("paid")
        .eq("campus_id", campus.id);
      
      const feePct = campusFees?.length
        ? (campusFees.filter((f) => f.paid).length / campusFees.length) * 100
        : 75;

      const ihi = Math.round(
        avgTeacherKpi * 0.30 +
        studentAvg * 0.30 +
        avgAdminKpi * 0.20 +
        feePct * 0.20
      );

      // Update snapshots with IHI
      for (const s of snapshots.filter((s) => s.campus_id === campus.id)) {
        s.ihi_score = ihi;
      }
    }

    // Upsert snapshots (delete existing for this month, then insert)
    await supabase
      .from("kpi_snapshots")
      .delete()
      .eq("month", month)
      .eq("year", year);

    if (snapshots.length > 0) {
      await supabase.from("kpi_snapshots").insert(snapshots);
    }

    return new Response(
      JSON.stringify({ success: true, snapshots_created: snapshots.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
