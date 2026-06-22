// ──────────────────────────────────────────────────────────────────────────────
// Lead intake orchestrator — the automated pipeline the spec mandates:
//
//   create → duplicate check → score → auto-assign → activity → notify →
//   welcome WhatsApp → 15-min follow-up (+ Task) → open SLA window
//
// Used by the staff "Add Lead" form. The public landing form / Meta ads run the
// same steps server-side in the `lead-intake` edge function (so automation
// fires without a browser). Every step degrades gracefully.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { taskService } from "@/features/tasks";
import { leadsService } from "./leads.service";
import { assignmentService } from "./assignment.service";
import { leadActivityService } from "./leadActivity.service";
import { leadNotificationsService } from "./leadNotifications.service";
import { leadWhatsappService } from "./leadWhatsapp.service";
import { followupsService } from "./followups.service";
import { slaService } from "./sla.service";
import { calculateLeadScore } from "../utils/leadScore";
import { welcomeTemplateForCourse } from "../utils/leadWhatsappTemplates";
import { ensureWhatsappPhone } from "../utils/whatsappPhone";
import type { CreateLeadInput, IntakeResult, Lead } from "../types/lead.types";

interface ProfileLite {
  id: string;
  name: string;
  role?: string;
  /** Raw stored values — for diagnostics only. */
  rawMobile?: string;
  rawPhone?: string;
  /** Normalised AiSensy MSISDN (mobile ?? phone → 91XXXXXXXXXX), or undefined. */
  phone?: string;
  /** profiles.can_receive_whatsapp (default true when column absent). */
  canReceiveWhatsapp: boolean;
  /** profiles.can_receive_leads (default false when column absent). */
  canReceiveLeads: boolean;
}

const FOLLOWUP_MINUTES = 15;

class LeadIntakeService extends BaseService {
  private async getProfile(id: string): Promise<ProfileLite | null> {
    // ROOT CAUSE FIX: the Create/Edit Staff form writes the staff member's number
    // to `profiles.mobile`; `profiles.phone` is a LEGACY column that form never
    // populates. Reading only `phone` is why lead_assigned_counselor never had a
    // number to send to (and was skipped) even when the staff member clearly had
    // a mobile on file. Prefer `mobile`, fall back to the legacy `phone`, then
    // canonicalise for AiSensy (invalid → undefined → visible skip with reason).
    // Falls back gracefully if the capability columns aren't migrated yet.
    const FULL = "id, name, role, mobile, phone, can_receive_whatsapp, can_receive_leads";
    const CORE = "id, name, role, mobile, phone";
    let res = await this.db.from("profiles").select(FULL).eq("id", id).maybeSingle();
    if (res.error && /column|schema cache|does not exist/i.test(res.error.message ?? "")) {
      res = await this.db.from("profiles").select(CORE).eq("id", id).maybeSingle();
    }
    if (res.error || !res.data) return null;
    const r = res.data as Record<string, unknown>;
    const rawMobile = r.mobile ? String(r.mobile) : undefined;
    const rawPhone = r.phone ? String(r.phone) : undefined;
    const { phone } = ensureWhatsappPhone(rawMobile ?? rawPhone ?? null);
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      role: r.role ? String(r.role) : undefined,
      rawMobile,
      rawPhone,
      phone: phone ?? undefined,
      canReceiveWhatsapp: r.can_receive_whatsapp !== false, // default true when absent
      canReceiveLeads: r.can_receive_leads === true,
    };
  }

  private async recipientsByRole(roles: string[]): Promise<string[]> {
    const res = await this.db
      .from("profiles")
      .select("id")
      .in("role", roles)
      .eq("is_active", true);
    if (res.error || !res.data) return [];
    return (res.data as Record<string, unknown>[]).map((r) => String(r.id));
  }

  /** Run the full pipeline for a freshly-captured lead. */
  async intake(
    input: CreateLeadInput,
    actor?: { profileId?: string; name?: string },
  ): Promise<IntakeResult> {
    // 1. Duplicate check (non-fatal — we still create, but flag it).
    const duplicate = await leadsService.findDuplicate({
      phone: input.phone,
      email: input.email,
      studentName: input.studentName,
      parentName: input.parentName,
    });

    // 2. Create.
    const lead = await leadsService.create(input, actor?.profileId);

    // 3. Score.
    const { score, category, breakdown } = calculateLeadScore({
      source: lead.source,
      course: lead.course,
      standard: lead.standard,
      hasParentContact: !!lead.parentName,
      hasPhone: !!lead.phone,
      hasEmail: !!lead.email,
    });
    await leadsService.update(lead.id, {
      score,
      scoreCategory: category,
      isDuplicate: !!duplicate,
      duplicateOf: duplicate?.lead.id,
      estimatedValue: input.estimatedValue ?? lead.estimatedValue,
    });
    await this.db.from("lead_score_history").insert({
      lead_id: lead.id,
      score,
      category,
      factors: breakdown,
      created_by: actor?.profileId ?? null,
    } as never);

    await leadActivityService.log({
      leadId: lead.id,
      type: "created",
      detail: `Lead captured from ${lead.source}${duplicate ? " (possible duplicate)" : ""}`,
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
    await leadActivityService.log({
      leadId: lead.id,
      type: "score",
      detail: `Scored ${score} (${category})`,
      newValue: String(score),
    });

    // 4. Auto-assign.
    const counselorId = await assignmentService.resolveCounselor(lead.course);
    let assignedTo: string | undefined;
    let counselor: ProfileLite | null = null;
    if (counselorId) {
      assignedTo = counselorId;
      counselor = await this.getProfile(counselorId);
      await leadsService.update(lead.id, {
        assignedTo: counselorId,
        assignedAt: new Date().toISOString(),
        assignmentState: "assigned",
      });
      await leadActivityService.log({
        leadId: lead.id,
        type: "assigned",
        detail: "Auto-assigned to counselor",
        newValue: counselorId,
        actorId: actor?.profileId,
      });
      // In-app notification to the counselor.
      await leadNotificationsService.notify({
        recipientId: counselorId,
        leadId: lead.id,
        type: "new_lead",
        title: "New lead assigned",
        message: `${lead.studentName}${lead.course ? ` — ${lead.course}` : ""} (${lead.phone ?? "no phone"})`,
      });
      // TASK 6: trace the assigned staff member (role-agnostic).
      if (import.meta.env.DEV) {
        console.log("[leadIntake] assigned staff → lead_assigned_counselor", {
          staffId: counselorId,
          staffName: counselor?.name,
          staffRole: counselor?.role,
          canReceiveLeads: counselor?.canReceiveLeads,
          canReceiveWhatsapp: counselor?.canReceiveWhatsapp,
          mobile: counselor?.rawMobile ?? null,
          phone: counselor?.rawPhone ?? null,
          normalizedWhatsapp: counselor?.phone ?? null,
          template: "lead_assigned_counselor",
        });
      }
      // WhatsApp to the assigned staff member — "New Lead Assigned, contact
      // within 15 min". Called UNCONDITIONALLY: when the staff member has no
      // phone on file OR has WhatsApp disabled, leadWhatsappService.send records
      // a visible status='skipped' row ("WhatsApp disabled or phone missing")
      // instead of silently dropping the alert.
      await leadWhatsappService.send({
        leadId: lead.id,
        templateKey: "lead_assigned_counselor",
        phone: counselor?.phone,
        recipientName: counselor?.name,
        recipientKind: "staff",
        canReceiveWhatsapp: counselor?.canReceiveWhatsapp,
        studentName: lead.studentName,
        courseName: lead.course,
        course: lead.course,
        leadClass: lead.standard,
        vars: {
          counselor_name: counselor?.name ?? "Team",
          student_name: lead.studentName,
          course_name: lead.course ?? "—",
          mobile_number: lead.phone ?? "—",
        },
        createdBy: actor?.profileId,
        actorName: actor?.name,
      });
    } else {
      // 4b. Nobody available → UNASSIGNED + alert management/admin.
      await leadsService.update(lead.id, { assignmentState: "unassigned" });
      const mgmt = await this.recipientsByRole(["management", "admin"]);
      await leadNotificationsService.notifyMany(mgmt, {
        leadId: lead.id,
        type: "unassigned",
        title: "Unassigned lead needs a counselor",
        message: `${lead.studentName}${lead.course ? ` — ${lead.course}` : ""}`,
        mirrorGlobal: true,
      });
      await leadWhatsappService.send({
        leadId: lead.id,
        templateKey: "lead_unassigned_alert",
        // best-effort: notify first management profile with a phone
        phone: (await this.firstPhone(mgmt)) ?? undefined,
        vars: { course: lead.course ?? "general", student_name: lead.studentName, phone: lead.phone ?? "" },
        createdBy: actor?.profileId,
      });
    }

    // 5. Welcome WhatsApp to the lead — single Meta Utility Template
    //    (lead_welcome): {{1}} = student_name, {{2}} = course_name.
    const whatsappQueued = await leadWhatsappService.send({
      leadId: lead.id,
      templateKey: welcomeTemplateForCourse(lead.course),
      phone: lead.phone,
      recipientName: lead.parentName ?? lead.studentName,
      recipientKind: "lead",
      studentName: lead.studentName,
      courseName: lead.course,
      course: lead.course,
      leadClass: lead.standard,
      vars: {
        student_name: lead.studentName,
        course_name: lead.course ?? "your course of interest",
      },
      createdBy: actor?.profileId,
      actorName: actor?.name,
    });

    // 6. 15-minute follow-up + matching Task in the existing Tasks module.
    const dueAt = new Date(Date.now() + FOLLOWUP_MINUTES * 60_000);
    let taskId: string | undefined;
    try {
      const task = await taskService.create(
        {
          title: `Follow up: ${lead.studentName} (new lead)`,
          description: `Call ${lead.parentName ?? lead.studentName} at ${lead.phone ?? "—"} regarding ${lead.course ?? "enquiry"}.`,
          priority: lead.priority === "high" ? "high" : "medium",
          assignedTo: assignedTo ? [assignedTo] : [],
          dueDate: dueAt.toISOString().slice(0, 10),
          dueTime: dueAt.toTimeString().slice(0, 5),
        },
        { profileId: actor?.profileId },
      );
      taskId = task?.id;
    } catch {
      taskId = undefined;
    }
    const followup = await followupsService.create({
      leadId: lead.id,
      assignedTo,
      level: 0,
      channel: "call",
      dueAt: dueAt.toISOString(),
      taskId,
      createdBy: actor?.profileId,
    });

    // 7. Open the NEW-stage SLA window.
    await slaService.open(lead.id, "new");

    return {
      lead,
      duplicate: duplicate ?? undefined,
      assignedTo,
      whatsappQueued,
      followupCreated: !!followup,
      taskId,
    };
  }

  private async firstPhone(profileIds: string[]): Promise<string | null> {
    for (const id of profileIds) {
      const p = await this.getProfile(id);
      if (p?.phone) return p.phone;
    }
    return null;
  }
}

export const leadIntakeService = new LeadIntakeService();
