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

    // ──────────────────────────────────────────────────────────────────────
    // 6. LEAD CRM — follow-up escalation ladder (15m / 1h / 3h) + SLA breach.
    //    Self-contained + degrades silently (missing tables just return errors
    //    the client swallows; the try/catch is a final safety net).
    // ──────────────────────────────────────────────────────────────────────
    let leadFollowupsEscalated = 0;
    let leadSlaBreached = 0;
    try {
      const { data: mgmtAdmins } = await supabase
        .from("profiles")
        .select("id, name, phone")
        .in("role", ["management", "admin"])
        .eq("is_active", true);
      const mgmtIds = (mgmtAdmins || []).map((p: any) => p.id);

      // `vars` carries the named positional values (counselor_name/student_name/
      // course_name/…) so the drainer's buildTemplateParams can order them for
      // the Meta utility template. __body is kept for the guard + single-param
      // fallback templates.
      const enqueueWa = async (
        phone: string | null | undefined,
        body: string,
        leadId: string,
        templateKey: string,
        recipientKind = "staff",
        vars: Record<string, unknown> = {}
      ) => {
        if (!phone) return;
        await supabase.from("message_queue").insert({
          channel: "whatsapp",
          provider: "aisensy",
          template: templateKey,
          template_key: templateKey,
          language: "en",
          recipient_kind: recipientKind,
          recipient_phone: phone,
          payload: { __body: body, ...vars },
          context_type: "lead",
          context_id: leadId,
          status: "queued",
          scheduled_at: new Date().toISOString(),
        });
        // Mirror to lead_whatsapp_logs + comms_audit so escalation messages are
        // as traceable as app-originated ones.
        await supabase.from("lead_whatsapp_logs").insert({
          lead_id: leadId,
          template_key: templateKey,
          template_name: templateKey,
          recipient_phone: phone,
          recipient_kind: recipientKind,
          message_body: body,
          status: "queued",
          queued_at: new Date().toISOString(),
        });
        await supabase.from("comms_audit").insert({
          entity_type: "lead",
          entity_id: leadId,
          action: "queue",
          payload: { template: templateKey, recipient_kind: recipientKind, message_body: body, source: "sla-checker" },
        });
      };

      const { data: dueFollowups } = await supabase
        .from("lead_followups")
        .select("*")
        .eq("status", "pending")
        .lte("due_at", now.toISOString());

      for (const f of dueFollowups || []) {
        const { data: lead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", f.lead_id)
          .maybeSingle();
        if (!lead || lead.deleted_at) continue;

        // Counselor already responded → close the timer, no escalation.
        if (lead.first_response_at) {
          await supabase
            .from("lead_followups")
            .update({ status: "done", completed_at: now.toISOString() })
            .eq("id", f.id);
          continue;
        }

        const ageMin = (now.getTime() - new Date(lead.created_at).getTime()) / 60000;
        const esc = lead.escalation_count || 0;

        let counselorPhone: string | null = null;
        let counselorName: string | null = null;
        if (lead.assigned_to) {
          const { data: c } = await supabase
            .from("profiles")
            .select("name, phone")
            .eq("id", lead.assigned_to)
            .maybeSingle();
          counselorPhone = c?.phone || null;
          counselorName = c?.name || null;
        }
        // Named positional vars for the lead_followup_reminder Meta template.
        const followupVars = {
          counselor_name: counselorName || "Counselor",
          student_name: lead.student_name,
          course_name: lead.course || "",
        };

        if (ageMin >= 180 && esc < 2) {
          // 3 hours: WhatsApp everyone + mark OVERDUE.
          await supabase
            .from("leads")
            .update({ is_overdue: true, escalation_count: 2 })
            .eq("id", lead.id);
          await supabase.from("lead_followups").update({ status: "overdue" }).eq("id", f.id);
          await enqueueWa(
            counselorPhone,
            `Reminder: please contact ${lead.student_name} (${lead.phone || ""}). Lead pending follow-up for 3+ hours.`,
            lead.id,
            "lead_followup_reminder",
            "staff",
            followupVars
          );
          for (const p of mgmtAdmins || [])
            await enqueueWa(
              p.phone,
              `OVERDUE lead: ${lead.student_name} has had no follow-up for 3+ hours.`,
              lead.id,
              "lead_followup_reminder",
              "management",
              followupVars
            );
          const recips = [...mgmtIds, ...(lead.assigned_to ? [lead.assigned_to] : [])];
          if (recips.length)
            await supabase.from("lead_notifications").insert(
              recips.map((rid: string) => ({
                recipient_id: rid,
                lead_id: lead.id,
                type: "followup_missed",
                title: "Lead overdue (3h+)",
                message: lead.student_name,
              }))
            );
          await supabase.from("escalation_log").insert({
            issue_type: "lead_overdue",
            description: `Lead ${lead.student_name} overdue >3h without follow-up`,
            status: "open",
            date: today,
          });
          leadFollowupsEscalated++;
        } else if (ageMin >= 60 && esc < 1) {
          // 1 hour: escalate management/admin + dashboard alert.
          await supabase.from("leads").update({ escalation_count: 1 }).eq("id", lead.id);
          if (mgmtIds.length)
            await supabase.from("lead_notifications").insert(
              mgmtIds.map((rid: string) => ({
                recipient_id: rid,
                lead_id: lead.id,
                type: "followup_missed",
                title: "Lead pending 1h+",
                message: lead.student_name,
              }))
            );
          await supabase.from("alerts").insert({
            type: "warning",
            severity: "warning",
            message: `Lead pending follow-up >1h: ${lead.student_name}`,
            related_user_id: lead.assigned_to || null,
          });
          await supabase.from("escalation_log").insert({
            issue_type: "lead_followup",
            description: `Lead ${lead.student_name} no follow-up >1h`,
            status: "open",
            date: today,
          });
          leadFollowupsEscalated++;
        } else if (esc < 1) {
          // 15 minutes: nudge the counselor.
          await enqueueWa(
            counselorPhone,
            `New lead pending follow-up: ${lead.student_name} (${lead.phone || ""}). Please reach out.`,
            lead.id,
            "lead_followup_reminder",
            "staff",
            followupVars
          );
          if (lead.assigned_to)
            await supabase.from("lead_notifications").insert({
              recipient_id: lead.assigned_to,
              lead_id: lead.id,
              type: "followup_due",
              title: "Follow-up due",
              message: lead.student_name,
            });
        }
      }

      // SLA breaches across any open stage window.
      const { data: openSla } = await supabase
        .from("lead_sla")
        .select("*")
        .eq("breached", false)
        .is("resolved_at", null)
        .lte("due_at", now.toISOString());

      for (const s of openSla || []) {
        await supabase
          .from("lead_sla")
          .update({
            breached: true,
            breached_at: now.toISOString(),
            escalation_count: (s.escalation_count || 0) + 1,
          })
          .eq("id", s.id);
        const { data: lead } = await supabase
          .from("leads")
          .select("id, student_name, phone, course, assigned_to")
          .eq("id", s.lead_id)
          .maybeSingle();
        if (lead) {
          await supabase.from("leads").update({ sla_breached: true }).eq("id", lead.id);
          if (mgmtIds.length)
            await supabase.from("lead_notifications").insert(
              mgmtIds.map((rid: string) => ({
                recipient_id: rid,
                lead_id: lead.id,
                type: "sla_breach",
                title: `SLA breach (${s.stage})`,
                message: lead.student_name,
              }))
            );
          // WhatsApp the SLA breach to the assigned counselor + management.
          let breachCounselorPhone: string | null = null;
          let breachCounselorName: string | null = null;
          if (lead.assigned_to) {
            const { data: c } = await supabase
              .from("profiles")
              .select("name, phone")
              .eq("id", lead.assigned_to)
              .maybeSingle();
            breachCounselorPhone = c?.phone || null;
            breachCounselorName = c?.name || null;
          }
          const breachBody =
            `SLA BREACH\n\nLead: ${lead.student_name}\nStage: ${s.stage}\n` +
            `Mobile: ${lead.phone || ""}\n\nThis lead has crossed its response SLA. Immediate action required.\n\nARK CRM`;
          // Positional vars for sla_breach_alert: [counselor_name, student_name, course_name].
          const breachVars = {
            counselor_name: breachCounselorName || "Counselor",
            student_name: lead.student_name,
            course_name: lead.course || "",
          };
          await enqueueWa(breachCounselorPhone, breachBody, lead.id, "sla_breach_alert", "staff", breachVars);
          for (const p of mgmtAdmins || [])
            await enqueueWa(p.phone, breachBody, lead.id, "sla_breach_alert", "management", breachVars);
          await supabase.from("escalation_log").insert({
            issue_type: "lead_sla",
            description: `SLA breach on ${lead.student_name} at stage ${s.stage}`,
            status: "open",
            date: today,
          });
          leadSlaBreached++;
        }
      }
      // ── Daily reminders (deduped per lead+type+day via lead_reminders) ────
      const todayStart = new Date(`${today}T00:00:00.000Z`).toISOString();
      const remind = async (
        leadId: string,
        type: string,
        recipientId: string | null,
        title: string,
        message: string,
        phone?: string | null,
        body?: string
      ) => {
        const { data: existing } = await supabase
          .from("lead_reminders")
          .select("id")
          .eq("lead_id", leadId)
          .eq("type", type)
          .gte("due_at", todayStart)
          .limit(1)
          .maybeSingle();
        if (existing) return;
        await supabase.from("lead_reminders").insert({
          lead_id: leadId,
          type,
          channel: phone ? "whatsapp" : "app",
          recipient_id: recipientId,
          due_at: now.toISOString(),
          status: "sent",
          sent_at: now.toISOString(),
        });
        if (recipientId)
          await supabase
            .from("lead_notifications")
            .insert({ recipient_id: recipientId, lead_id: leadId, type, title, message });
        // Demo reminder goes to the LEAD — use a single-body template (not the
        // counselor-facing positional lead_followup_reminder) so the actual
        // reminder text is delivered via the {{1}} fallback.
        if (phone && body) await enqueueWa(phone, body, leadId, "lead_demo_reminder", "lead");
      };

      // Demos scheduled for tomorrow / today → remind faculty + counselor.
      const dayStart = (d: Date) => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
      };
      const dayEnd = (d: Date) => {
        const x = new Date(d);
        x.setHours(23, 59, 59, 999);
        return x;
      };
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      for (const [type, day] of [["demo_today", now], ["demo_tomorrow", tomorrow]] as [string, Date][]) {
        const { data: demos } = await supabase
          .from("demo_classes")
          .select("id, lead_id, faculty_id, scheduled_at")
          .eq("status", "scheduled")
          .gte("scheduled_at", dayStart(day).toISOString())
          .lte("scheduled_at", dayEnd(day).toISOString());
        for (const d of demos || []) {
          const { data: lead } = await supabase
            .from("leads")
            .select("student_name, phone, assigned_to")
            .eq("id", d.lead_id)
            .maybeSingle();
          if (!lead) continue;
          const when = new Date(d.scheduled_at).toLocaleString();
          if (d.faculty_id)
            await remind(d.lead_id, `${type}_faculty`, d.faculty_id, "Upcoming demo", `${lead.student_name} — ${when}`);
          if (lead.assigned_to)
            await remind(d.lead_id, `${type}_counselor`, lead.assigned_to, "Upcoming demo", `${lead.student_name} — ${when}`);
          await remind(
            d.lead_id,
            type,
            null,
            "Demo reminder",
            lead.student_name,
            lead.phone,
            `Reminder: ${lead.student_name}'s ARK demo is ${type === "demo_today" ? "today" : "tomorrow"} at ${when}.`
          );
        }
      }

      // Unassigned + high-value leads still waiting → nudge management.
      const { data: waiting } = await supabase
        .from("leads")
        .select("id, student_name, assignment_state, score_category, assigned_to")
        .is("deleted_at", null)
        .neq("status", "closed")
        .or("assignment_state.eq.unassigned,score_category.in.(hot,priority)")
        .limit(200);
      for (const l of waiting || []) {
        if (l.assignment_state === "unassigned") {
          for (const rid of mgmtIds)
            await remind(l.id, "unassigned", rid, "Unassigned lead waiting", l.student_name);
        } else if (!l.assigned_to) {
          for (const rid of mgmtIds)
            await remind(l.id, "high_value", rid, "High-value lead unassigned", l.student_name);
        }
      }
    } catch (e: unknown) {
      console.warn("[sla-checker] lead block failed:", (e as Error).message);
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
        lead_followups_escalated: leadFollowupsEscalated,
        lead_sla_breached: leadSlaBreached,
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
