// Lead WhatsApp automation — never calls a provider directly. Builds a
// RenderedMessage from the lead templates and enqueues via aisensyService
// (→ message_queue → send-aisensy edge fn), then logs to lead_whatsapp_logs
// AND comms_audit (reusing the communication module's audit backbone).

import { BaseService } from "@/shared/services";
import { aisensyService, commsAuditService } from "@/features/communication";
import { renderLeadMessage, type LeadTemplateKey } from "../utils/leadWhatsappTemplates";
import { buildTemplateParams } from "../utils/templateParams";
import { isSchemaMissing } from "./leadMappers";

export interface SendLeadWhatsappInput {
  leadId: string;
  templateKey: LeadTemplateKey;
  phone?: string;
  recipientName?: string;
  /** 'lead' (default), 'counselor' or 'management' — drives lead_whatsapp_logs.recipient_kind. */
  recipientKind?: "lead" | "counselor" | "management";
  /** Stored on the log row for reporting (the {{1}} student_name variable). */
  studentName?: string;
  /** Stored on the log row for reporting (the {{2}} course_name variable). */
  courseName?: string;
  course?: string;
  leadClass?: string;
  vars: Record<string, string | number | undefined | null>;
  createdBy?: string;
  actorName?: string;
}

class LeadWhatsappService extends BaseService {
  /**
   * Render → enqueue → log (lead_whatsapp_logs) → audit (comms_audit).
   * Silent + safe: a missing message_queue / phone never breaks automation.
   * Returns whether a message was queued.
   */
  async send(input: SendLeadWhatsappInput): Promise<boolean> {
    const rendered = renderLeadMessage(input.templateKey, input.vars);
    // Ordered positional params the drainer will post to AiSensy — recorded in
    // comms_audit for traceability (the drainer recomputes the same from payload).
    const templateParams = buildTemplateParams(input.templateKey, {
      ...rendered.variables,
      __body: rendered.body,
    });
    const recipientKind = input.recipientKind ?? "lead";
    const nowISO = new Date().toISOString();

    let queueId: string | undefined;
    let status: "queued" | "skipped" | "failed" = "skipped";
    let error: string | undefined;

    if (input.phone) {
      try {
        const res = await aisensyService.enqueue({
          channel: "whatsapp",
          rendered,
          contextType: "lead",
          contextId: input.leadId,
          recipient: { kind: "student", name: input.recipientName, phone: input.phone },
          createdBy: input.createdBy,
        });
        if (res.queued > 0) {
          status = "queued";
          queueId = res.ids[0];
        } else if (res.invalid.length) {
          status = "skipped";
          error = res.invalid[0]?.reason;
        }
      } catch (e) {
        status = "failed";
        error = (e as Error).message;
      }
    } else {
      error = "no phone";
    }

    // 1. lead_whatsapp_logs — full lifecycle row.
    const logRes = await this.db.from("lead_whatsapp_logs").insert({
      lead_id: input.leadId,
      template_key: input.templateKey,
      template_name: input.templateKey,
      student_name: input.studentName ?? input.recipientName ?? null,
      course_name: input.courseName ?? input.course ?? null,
      recipient_phone: input.phone ?? null,
      recipient_name: input.recipientName ?? null,
      recipient_kind: recipientKind,
      course: input.course ?? null,
      lead_class: input.leadClass ?? null,
      message_body: rendered.body,
      message_queue_id: queueId ?? null,
      provider_message_id: null, // filled by the aisensy webhook on send/deliver
      status,
      payload: rendered.variables,
      error: error ?? null,
      queued_at: status === "queued" ? nowISO : null,
      sent_at: null,        // set by webhook when the provider confirms send
      delivered_at: null,   // set by webhook on delivery
      created_by: input.createdBy ?? null,
    } as never);
    if (logRes.error && !isSchemaMissing(logRes.error) && import.meta.env.DEV) {
      console.warn("[leads] whatsapp log failed:", logRes.error.message);
    }

    // 2. comms_audit — reuse the communication audit backbone (entity 'lead').
    await commsAuditService.log({
      entityType: "lead",
      entityId: input.leadId,
      action: status === "queued" ? "queue" : status === "failed" ? "fail" : "create",
      actorId: input.createdBy,
      actorName: input.actorName,
      payload: {
        template: input.templateKey,
        recipient_kind: recipientKind,
        recipient_phone: input.phone ?? null,
        course: input.course ?? null,
        message_queue_id: queueId ?? null,
        message_body: rendered.body,
        template_params: templateParams,
        status,
        ...(error ? { error } : {}),
      },
    });

    return status === "queued";
  }
}

export const leadWhatsappService = new LeadWhatsappService();
