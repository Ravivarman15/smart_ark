import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stampOrg } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ──────────────────────────────────────────────────────────────────────────────
// WHY THIS FUNCTION SWEEPS ONE ORGANIZATION AT A TIME
//
// It used to run ONE global pass: every query read across all tenants and every
// insert relied on the organization_id column DEFAULT. Both halves broke when a
// second organization was created.
//
//   1. THE WRITES STOPPED. Every tenant table is `organization_id uuid NOT NULL
//      DEFAULT current_org_id()`. This function runs as SERVICE ROLE, which has
//      no JWT, so current_org_id() falls through to fallback_org_id() — which
//      deliberately returns NULL once more than one organization exists. Every
//      insert here began failing the NOT NULL constraint, and because the whole
//      lead block sits inside `catch { console.warn(...) }`, it failed SILENTLY.
//      violations, escalation_log and lead_notifications simply stopped being
//      written on the day tenant #2 appeared, with a 200 OK returned each run.
//
//   2. THE READS WERE ALREADY WRONG. A single global pass counted one tenant's
//      walk-ins toward another's daily target, penalised EVERY organization's
//      admins for one organization's overdue retests, and WhatsApp'd one
//      institution's management about another institution's leads.
//
// Scoping the reads and stamping the writes are the same fix: iterate the
// organizations, and inside each iteration the tenant is unambiguous. A partial
// failure is now reported per organization instead of aborting the sweep, so one
// tenant's bad data cannot stop every other tenant's SLA enforcement.
// ──────────────────────────────────────────────────────────────────────────────

interface OrgResult {
  organizationId: string;
  organizationName: string;
  violationsCreated: number;
  alertsCreated: number;
  escalationsCreated: number;
  leadFollowupsEscalated: number;
  leadSlaBreached: number;
  error: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gate: cron-only function. Without CRON_SECRET anyone could mint violations.
  // FAIL CLOSED — see the note in kpi-engine. An unset CRON_SECRET used to skip
  // the check entirely, leaving this verify_jwt = false endpoint open to anyone;
  // minting SLA violations is a write, so that was worse than a read DoS.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-key");
  if (!cronSecret || provided !== cronSecret) {
    if (!cronSecret) {
      console.error("[sla-checker] CRON_SECRET is not set — refusing all calls.");
    }
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // A suspended tenant is not paying and must not have staff penalised or
    // parents messaged on its behalf.
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, display_name, status")
      .is("deleted_at", null);
    if (orgErr) {
      return new Response(JSON.stringify({ error: `Could not list organizations: ${orgErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const active = (orgs ?? []).filter((o: any) => o.status !== "suspended");

    const results: OrgResult[] = [];

    for (const org of active) {
      const orgId = org.id as string;
      const orgName = (org.display_name as string) ?? "";
      const result: OrgResult = {
        organizationId: orgId,
        organizationName: orgName,
        violationsCreated: 0,
        alertsCreated: 0,
        escalationsCreated: 0,
        leadFollowupsEscalated: 0,
        leadSlaBreached: 0,
        error: null,
      };

      try {
        const violations: any[] = [];
        const alerts: any[] = [];
        const escalations: any[] = [];

        // Strict mode is a per-tenant setting. `maybeSingle` because a tenant
        // that has never opened Settings has no row — `.single()` made that an
        // error and took the whole sweep down with it.
        const { data: settings } = await supabase
          .from("system_settings")
          .select("value")
          .eq("organization_id", orgId)
          .eq("key", "strict_mode")
          .maybeSingle();
        const strictMode = settings?.value === true || settings?.value === "true";

        // This tenant's admins. Resolved inside the loop: the old global lookup
        // is what sent one institution's escalations to another's staff.
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("organization_id", orgId)
          .eq("role", "admin")
          .eq("is_active", true);

        // 1. Marks SLA: test results uploaded > 48 hours without verification
        const { data: unverifiedTests } = await supabase
          .from("test_results")
          .select("*, profiles!test_results_teacher_id_fkey(id, name)")
          .eq("organization_id", orgId)
          .is("verified_at", null)
          .not("uploaded_at", "is", null);

        if (unverifiedTests) {
          for (const test of unverifiedTests) {
            const uploadedAt = new Date(test.uploaded_at);
            const hoursDiff = (now.getTime() - uploadedAt.getTime()) / (1000 * 60 * 60);
            if (hoursDiff > 48) {
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
          .eq("organization_id", orgId)
          .eq("status", "pending");

        if (pendingRetests) {
          const overdueAllocations = pendingRetests.filter((r: any) => {
            const created = new Date(r.created_at);
            return (now.getTime() - created.getTime()) / (1000 * 60 * 60) > 24;
          });

          if (overdueAllocations.length > 0) {
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
          .eq("organization_id", orgId)
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
            .eq("organization_id", orgId)
            .eq("date", today)
            .eq("is_walkin", true);

          if ((walkinCount || 0) < 2) {
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
          .eq("organization_id", orgId)
          .eq("status", "absent")
          .gte("date", sevenDaysAgo.toISOString().split("T")[0]);

        if (absentRecords) {
          const absentCounts: Record<string, number> = {};
          for (const r of absentRecords) {
            absentCounts[r.student_id] = (absentCounts[r.student_id] || 0) + 1;
          }
          const chronicallyAbsent = Object.entries(absentCounts).filter(([, c]) => c >= 3);

          if (chronicallyAbsent.length > 0) {
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

        // ──────────────────────────────────────────────────────────────────
        // 6. LEAD CRM — follow-up escalation ladder (15m / 1h / 3h) + SLA breach.
        // ──────────────────────────────────────────────────────────────────
        const { data: mgmtAdmins } = await supabase
          .from("profiles")
          .select("id, name, phone, mobile")
          .eq("organization_id", orgId)
          .in("role", ["management", "admin"])
          .eq("is_active", true);
        const mgmtIds = (mgmtAdmins || []).map((p: any) => p.id);
        // Staff numbers live in profiles.mobile; `phone` is the legacy column
        // kept for older rows. Preferring mobile matches the Create/Edit Staff
        // form, which only ever writes mobile.
        const staffPhone = (p: any): string | null => p?.mobile || p?.phone || null;

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
          await supabase.from("message_queue").insert(stampOrg({
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
          }, orgId, "queued message"));
          // Mirror to lead_whatsapp_logs + comms_audit so escalation messages are
          // as traceable as app-originated ones.
          await supabase.from("lead_whatsapp_logs").insert(stampOrg({
            lead_id: leadId,
            template_key: templateKey,
            template_name: templateKey,
            recipient_phone: phone,
            recipient_kind: recipientKind,
            message_body: body,
            status: "queued",
            queued_at: new Date().toISOString(),
          }, orgId, "whatsapp log"));
          await supabase.from("comms_audit").insert(stampOrg({
            entity_type: "lead",
            entity_id: leadId,
            action: "queue",
            payload: { template: templateKey, recipient_kind: recipientKind, message_body: body, source: "sla-checker" },
          }, orgId, "comms audit"));
        };

        const { data: dueFollowups } = await supabase
          .from("lead_followups")
          .select("*")
          .eq("organization_id", orgId)
          .eq("status", "pending")
          .lte("due_at", now.toISOString());

        for (const f of dueFollowups || []) {
          const { data: lead } = await supabase
            .from("leads")
            .select("*")
            .eq("organization_id", orgId)
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
              .select("name, phone, mobile")
              .eq("organization_id", orgId)
              .eq("id", lead.assigned_to)
              .maybeSingle();
            counselorPhone = staffPhone(c);
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
                staffPhone(p),
                `OVERDUE lead: ${lead.student_name} has had no follow-up for 3+ hours.`,
                lead.id,
                "lead_followup_reminder",
                "management",
                followupVars
              );
            const recips = [...mgmtIds, ...(lead.assigned_to ? [lead.assigned_to] : [])];
            if (recips.length)
              await supabase.from("lead_notifications").insert(
                recips.map((rid: string) => stampOrg({
                  recipient_id: rid,
                  lead_id: lead.id,
                  type: "followup_missed",
                  title: "Lead overdue (3h+)",
                  message: lead.student_name,
                }, orgId, "lead notification"))
              );
            await supabase.from("escalation_log").insert(stampOrg({
              issue_type: "lead_overdue",
              description: `Lead ${lead.student_name} overdue >3h without follow-up`,
              status: "open",
              date: today,
            }, orgId, "escalation"));
            result.leadFollowupsEscalated++;
          } else if (ageMin >= 60 && esc < 1) {
            // 1 hour: escalate management/admin + dashboard alert.
            await supabase.from("leads").update({ escalation_count: 1 }).eq("id", lead.id);
            if (mgmtIds.length)
              await supabase.from("lead_notifications").insert(
                mgmtIds.map((rid: string) => stampOrg({
                  recipient_id: rid,
                  lead_id: lead.id,
                  type: "followup_missed",
                  title: "Lead pending 1h+",
                  message: lead.student_name,
                }, orgId, "lead notification"))
              );
            await supabase.from("alerts").insert(stampOrg({
              type: "warning",
              severity: "warning",
              message: `Lead pending follow-up >1h: ${lead.student_name}`,
              related_user_id: lead.assigned_to || null,
            }, orgId, "alert"));
            await supabase.from("escalation_log").insert(stampOrg({
              issue_type: "lead_followup",
              description: `Lead ${lead.student_name} no follow-up >1h`,
              status: "open",
              date: today,
            }, orgId, "escalation"));
            result.leadFollowupsEscalated++;
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
              await supabase.from("lead_notifications").insert(stampOrg({
                recipient_id: lead.assigned_to,
                lead_id: lead.id,
                type: "followup_due",
                title: "Follow-up due",
                message: lead.student_name,
              }, orgId, "lead notification"));
          }
        }

        // SLA breaches across any open stage window.
        const { data: openSla } = await supabase
          .from("lead_sla")
          .select("*")
          .eq("organization_id", orgId)
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
            .eq("organization_id", orgId)
            .eq("id", s.lead_id)
            .maybeSingle();
          if (lead) {
            await supabase.from("leads").update({ sla_breached: true }).eq("id", lead.id);
            if (mgmtIds.length)
              await supabase.from("lead_notifications").insert(
                mgmtIds.map((rid: string) => stampOrg({
                  recipient_id: rid,
                  lead_id: lead.id,
                  type: "sla_breach",
                  title: `SLA breach (${s.stage})`,
                  message: lead.student_name,
                }, orgId, "lead notification"))
              );
            let breachCounselorPhone: string | null = null;
            let breachCounselorName: string | null = null;
            if (lead.assigned_to) {
              const { data: c } = await supabase
                .from("profiles")
                .select("name, phone, mobile")
                .eq("organization_id", orgId)
                .eq("id", lead.assigned_to)
                .maybeSingle();
              breachCounselorPhone = staffPhone(c);
              breachCounselorName = c?.name || null;
            }
            // Signed with THIS tenant's name — the sweep is already inside the
            // organization loop, so no per-lead lookup is needed.
            const breachBody =
              `SLA BREACH\n\nLead: ${lead.student_name}\nStage: ${s.stage}\n` +
              `Mobile: ${lead.phone || ""}\n\nThis lead has crossed its response SLA. Immediate action required.\n\n${orgName}`;
            // Positional vars for sla_breach_alert: [counselor_name, student_name, course_name].
            const breachVars = {
              counselor_name: breachCounselorName || "Counselor",
              student_name: lead.student_name,
              course_name: lead.course || "",
            };
            await enqueueWa(breachCounselorPhone, breachBody, lead.id, "sla_breach_alert", "staff", breachVars);
            for (const p of mgmtAdmins || [])
              await enqueueWa(staffPhone(p), breachBody, lead.id, "sla_breach_alert", "management", breachVars);
            await supabase.from("escalation_log").insert(stampOrg({
              issue_type: "lead_sla",
              description: `SLA breach on ${lead.student_name} at stage ${s.stage}`,
              status: "open",
              date: today,
            }, orgId, "escalation"));
            result.leadSlaBreached++;
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
          body?: string,
          waVars: Record<string, unknown> = {}
        ) => {
          const { data: existing } = await supabase
            .from("lead_reminders")
            .select("id")
            .eq("organization_id", orgId)
            .eq("lead_id", leadId)
            .eq("type", type)
            .gte("due_at", todayStart)
            .limit(1)
            .maybeSingle();
          if (existing) return;
          await supabase.from("lead_reminders").insert(stampOrg({
            lead_id: leadId,
            type,
            channel: phone ? "whatsapp" : "app",
            recipient_id: recipientId,
            due_at: now.toISOString(),
            status: "sent",
            sent_at: now.toISOString(),
          }, orgId, "reminder"));
          if (recipientId)
            await supabase
              .from("lead_notifications")
              .insert(stampOrg(
                { recipient_id: recipientId, lead_id: leadId, type, title, message },
                orgId,
                "lead notification",
              ));
          // Demo reminder goes to the LEAD via the approved AiSensy Utility template
          // lead_demo_reminder_v2. Positional params {{1}} student_name, {{2}} course_name,
          // {{3}} demo_date, {{4}} demo_time are carried in waVars (body kept for logs).
          if (phone && body)
            await enqueueWa(phone, body, leadId, "lead_demo_reminder_v2", "lead", waVars);
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
            .eq("organization_id", orgId)
            .eq("status", "scheduled")
            .gte("scheduled_at", dayStart(day).toISOString())
            .lte("scheduled_at", dayEnd(day).toISOString());
          for (const d of demos || []) {
            const { data: lead } = await supabase
              .from("leads")
              .select("student_name, phone, assigned_to, course")
              .eq("organization_id", orgId)
              .eq("id", d.lead_id)
              .maybeSingle();
            if (!lead) continue;
            const scheduled = new Date(d.scheduled_at);
            const when = scheduled.toLocaleString();
            const demoDate = scheduled.toLocaleDateString();
            const demoTime = scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
              // Signed with the tenant this demo belongs to. This message goes
              // to a prospective parent, so the old hardcoded "ARK demo" named
              // the wrong institution to every other tenant's leads.
              `Reminder: ${lead.student_name}'s ${orgName || "demo"} demo is ${type === "demo_today" ? "today" : "tomorrow"} at ${when}.`,
              // lead_demo_reminder_v2 positional vars.
              {
                student_name: lead.student_name,
                course_name: lead.course ?? "your course",
                demo_date: demoDate,
                demo_time: demoTime,
              }
            );
          }
        }

        // Unassigned + high-value leads still waiting → nudge management.
        const { data: waiting } = await supabase
          .from("leads")
          .select("id, student_name, assignment_state, score_category, assigned_to")
          .eq("organization_id", orgId)
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

        // Insert all violations (dedup by user_id + type + date)
        for (const v of violations) {
          const { data: existing } = await supabase
            .from("violations")
            .select("id")
            .eq("organization_id", orgId)
            .eq("user_id", v.user_id)
            .eq("type", v.type)
            .eq("date", v.date)
            .maybeSingle();

          if (!existing) {
            const { error } = await supabase.from("violations").insert(stampOrg(v, orgId, "violation"));
            if (!error) result.violationsCreated++;
          }
        }

        for (const a of alerts) {
          const { error } = await supabase.from("alerts").insert(stampOrg(a, orgId, "alert"));
          if (!error) result.alertsCreated++;
        }

        for (const e of escalations) {
          const { error } = await supabase.from("escalation_log").insert(stampOrg(e, orgId, "escalation"));
          if (!error) result.escalationsCreated++;
        }
      } catch (e: unknown) {
        // Per-tenant isolation: one organization's bad data must not stop the
        // sweep for everybody else. The error is REPORTED, not just logged —
        // the previous console.warn is why six days of silent failure looked
        // like six days of "success".
        result.error = (e as Error).message;
        console.error(`[sla-checker] org ${orgId} (${orgName}) failed:`, result.error);
      }

      results.push(result);
    }

    const sum = (k: keyof OrgResult) =>
      results.reduce((n, r) => n + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
    const failed = results.filter((r) => r.error);

    return new Response(
      JSON.stringify({
        // `success` now means every tenant swept cleanly, not merely that the
        // handler reached the end.
        success: failed.length === 0,
        organizations_swept: results.length,
        organizations_failed: failed.length,
        violations_created: sum("violationsCreated"),
        alerts_created: sum("alertsCreated"),
        escalations_created: sum("escalationsCreated"),
        lead_followups_escalated: sum("leadFollowupsEscalated"),
        lead_sla_breached: sum("leadSlaBreached"),
        results,
      }),
      {
        status: failed.length === 0 ? 200 : 207,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
