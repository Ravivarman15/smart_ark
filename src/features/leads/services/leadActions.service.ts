// Composed lead mutations used by the UI/hooks. Each one keeps the activity
// timeline, notifications, SLA windows and WhatsApp automation in sync — so a
// drag on the Kanban board or a "Schedule demo" click does the full job.

import { BaseService } from "@/shared/services";
import { leadsService } from "./leads.service";
import { leadActivityService } from "./leadActivity.service";
import { leadNotificationsService } from "./leadNotifications.service";
import { leadWhatsappService } from "./leadWhatsapp.service";
import { demosService } from "./demos.service";
import { admissionsService } from "./admissions.service";
import { followupsService } from "./followups.service";
import { slaService } from "./sla.service";
import { statusLabel } from "../utils/leadStatus";
import { ensureWhatsappPhone } from "../utils/whatsappPhone";
import type { Lead, LeadStatus } from "../types/lead.types";

interface Actor {
  profileId?: string;
  name?: string;
}

class LeadActionsService extends BaseService {
  private async getProfile(
    id: string,
  ): Promise<{ name: string; role?: string; phone?: string; canReceiveWhatsapp: boolean } | null> {
    // Staff numbers live in profiles.mobile (the Create/Edit Staff form writes
    // there); `phone` is legacy. Prefer mobile, normalise for AiSensy, and read
    // the WhatsApp opt-out. Degrades if capability columns aren't migrated yet.
    const FULL = "name, role, mobile, phone, can_receive_whatsapp";
    const CORE = "name, role, mobile, phone";
    let res = await this.db.from("profiles").select(FULL).eq("id", id).maybeSingle();
    if (res.error && /column|schema cache|does not exist/i.test(res.error.message ?? "")) {
      res = await this.db.from("profiles").select(CORE).eq("id", id).maybeSingle();
    }
    if (res.error || !res.data) return null;
    const r = res.data as Record<string, unknown>;
    const { phone } = ensureWhatsappPhone(
      (r.mobile ? String(r.mobile) : r.phone ? String(r.phone) : null),
    );
    return {
      name: String(r.name ?? ""),
      role: r.role ? String(r.role) : undefined,
      phone: phone ?? undefined,
      canReceiveWhatsapp: r.can_receive_whatsapp !== false,
    };
  }

  private async recipientsByRole(roles: string[]): Promise<string[]> {
    const res = await this.db.from("profiles").select("id").in("role", roles).eq("is_active", true);
    if (res.error || !res.data) return [];
    return (res.data as Record<string, unknown>[]).map((r) => String(r.id));
  }

  /** Record the counselor's first response (stops the 15-min timer). */
  async recordFirstResponse(lead: Lead, actor?: Actor): Promise<void> {
    if (lead.firstResponseAt) return;
    await leadsService.update(lead.id, {
      firstResponseAt: new Date().toISOString(),
      isOverdue: false,
      lastActivityAt: new Date().toISOString(),
      updatedBy: actor?.profileId,
    });
    await slaService.resolve(lead.id, "new");
  }

  async moveStage(lead: Lead, to: LeadStatus, actor?: Actor): Promise<void> {
    const from = lead.status;
    if (from === to) return;

    const patch: Parameters<typeof leadsService.update>[1] = {
      status: to,
      lastActivityAt: new Date().toISOString(),
      updatedBy: actor?.profileId,
    };
    if (!lead.firstResponseAt && from === "new") {
      patch.firstResponseAt = new Date().toISOString();
      patch.isOverdue = false;
    }
    if (to === "closed") patch.isOverdue = false;
    await leadsService.update(lead.id, patch);

    // SLA: resolve old window, open the new one (if the stage has an SLA).
    await slaService.resolve(lead.id, from);
    await slaService.open(lead.id, to);

    await leadActivityService.log({
      leadId: lead.id,
      type: "status_change",
      detail: `${statusLabel(from)} → ${statusLabel(to)}`,
      oldValue: from,
      newValue: to,
      actorId: actor?.profileId,
      actorName: actor?.name,
    });

    // Notify management on key stage milestones.
    if (to === "admission" || to === "demo_attended") {
      const mgmt = await this.recipientsByRole(["management", "admin"]);
      await leadNotificationsService.notifyMany(mgmt, {
        leadId: lead.id,
        type: to === "admission" ? "admission" : "demo_scheduled",
        title: to === "admission" ? "Lead converted to admission" : "Demo attended",
        message: lead.studentName,
        mirrorGlobal: to === "admission",
      });
    }
  }

  async assign(lead: Lead, counselorId: string, actor?: Actor): Promise<void> {
    await leadsService.update(lead.id, {
      assignedTo: counselorId,
      assignedAt: new Date().toISOString(),
      assignmentState: "assigned",
      updatedBy: actor?.profileId,
    });
    await leadActivityService.log({
      leadId: lead.id,
      type: "assigned",
      detail: "Lead assigned to counselor",
      oldValue: lead.assignedTo,
      newValue: counselorId,
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
    // In-app notification.
    await leadNotificationsService.notify({
      recipientId: counselorId,
      leadId: lead.id,
      type: "lead_assigned",
      title: "Lead assigned to you",
      message: `${lead.studentName}${lead.course ? ` — ${lead.course}` : ""}`,
    });
    // WhatsApp to the assigned staff member (+ comms_audit + lead_whatsapp_logs
    // inside send()). Called UNCONDITIONALLY — a missing phone or WhatsApp opt-out
    // records a visible status='skipped' row instead of silently dropping it.
    const counselor = await this.getProfile(counselorId);
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
  }

  async scheduleDemo(
    lead: Lead,
    input: { facultyId?: string; scheduledAt: string; batch?: string; subject?: string; mode?: "offline" | "online" },
    actor?: Actor,
  ): Promise<void> {
    const demo = await demosService.schedule({ leadId: lead.id, ...input, createdBy: actor?.profileId });
    if (lead.status === "new" || lead.status === "contacted" || lead.status === "followup") {
      await this.moveStage(lead, "demo_scheduled", actor);
    }
    await leadActivityService.log({
      leadId: lead.id,
      type: "demo",
      detail: `Demo scheduled for ${new Date(input.scheduledAt).toLocaleString()}`,
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
    const faculty = input.facultyId ? await this.getProfile(input.facultyId) : null;
    const d = new Date(input.scheduledAt);
    await leadWhatsappService.send({
      leadId: lead.id,
      templateKey: "demo_scheduled",
      phone: lead.phone,
      recipientName: lead.parentName ?? lead.studentName,
      vars: {
        student_name: lead.studentName,
        course_name: lead.course ?? "—",
        demo_date: d.toLocaleDateString(),
        demo_time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        faculty: faculty?.name ?? "ARK faculty",
        batch: input.batch ?? "—",
      },
      createdBy: actor?.profileId,
    });
    if (input.facultyId && demo) {
      await leadNotificationsService.notify({
        recipientId: input.facultyId,
        leadId: lead.id,
        type: "demo_scheduled",
        title: "Demo class assigned to you",
        message: `${lead.studentName} — ${d.toLocaleString()}`,
      });
    }
  }

  async convertToAdmission(
    lead: Lead,
    input: {
      feeAmount?: number;
      scholarshipAmount?: number;
      paymentStatus?: "pending" | "partial" | "paid";
      batch?: string;
      campus?: string;
      course?: string;
      studentId?: string;
    },
    actor?: Actor,
  ): Promise<void> {
    await admissionsService.create({
      leadId: lead.id,
      counselorId: lead.assignedTo,
      course: input.course ?? lead.course,
      batch: input.batch,
      campus: input.campus ?? lead.campus,
      feeAmount: input.feeAmount,
      scholarshipAmount: input.scholarshipAmount,
      paymentStatus: input.paymentStatus,
      studentId: input.studentId,
      createdBy: actor?.profileId,
    });
    await this.moveStage(lead, "admission", actor);
    await leadActivityService.log({
      leadId: lead.id,
      type: "admission",
      detail: `Admission confirmed${input.feeAmount ? ` (₹${input.feeAmount})` : ""}`,
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
    await leadWhatsappService.send({
      leadId: lead.id,
      templateKey: "admission_completed",
      phone: lead.phone,
      recipientName: lead.parentName ?? lead.studentName,
      vars: {
        parent_name: lead.parentName ?? lead.studentName,
        student_name: lead.studentName,
        course: input.course ?? lead.course ?? "your course",
        course_name: input.course ?? lead.course ?? "your course",
      },
      createdBy: actor?.profileId,
    });
  }

  /** Complete a follow-up and record it as the counselor's response. */
  async completeFollowup(lead: Lead, followupId: string, actor?: Actor, notes?: string): Promise<void> {
    await followupsService.complete(followupId, actor?.profileId, notes);
    await this.recordFirstResponse(lead, actor);
    await leadActivityService.log({
      leadId: lead.id,
      type: "followup",
      detail: notes ? `Follow-up completed: ${notes}` : "Follow-up completed",
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
  }
}

export const leadActionsService = new LeadActionsService();
