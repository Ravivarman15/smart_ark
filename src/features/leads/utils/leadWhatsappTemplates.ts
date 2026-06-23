// ──────────────────────────────────────────────────────────────────────────────
// Lead CRM WhatsApp templates.
//
// Mirrors communication/utils/whatsappTemplates.ts — defines the builtin lead
// templates and reuses the shared `renderMessage` pipeline so no UI/service
// builds raw provider payloads. The leadWhatsapp service enqueues the resulting
// RenderedMessage via aisensyService → message_queue → send-aisensy.
// ──────────────────────────────────────────────────────────────────────────────

import {
  renderMessage,
  extractVariables,
  type RenderedMessage,
} from "@/features/communication";

export type LeadTemplateKey =
  | "lead_welcome"
  | "lead_assigned_counselor"
  | "lead_followup_reminder"
  | "sla_breach_alert"
  | "lead_demo_scheduled_v2"
  | "lead_admission_completed_v2"
  | "lead_demo_reminder_v2"
  | "lead_low_performance"
  | "lead_unassigned_alert";

interface LeadTemplate {
  key: LeadTemplateKey;
  body: string;
  variables: string[];
  providerName: string;
}

const def = (key: LeadTemplateKey, body: string): LeadTemplate => ({
  key,
  body,
  variables: extractVariables(body),
  providerName: key,
});

export const LEAD_TEMPLATES: Record<LeadTemplateKey, LeadTemplate> = {
  // Single Meta Utility Template. Positional params: {{1}} = student_name,
  // {{2}} = course_name. The render pipeline substitutes the named placeholders
  // below and send-aisensy delivers the resulting body.
  lead_welcome: def(
    "lead_welcome",
    "Hi {{student_name}}\n\n" +
      "Thank you for your interest in ARK Learning Arena.\n\n" +
      "We have successfully received your enquiry for {{course_name}}.",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name, {{4}} mobile_number
  lead_assigned_counselor: def(
    "lead_assigned_counselor",
    "Hi {{counselor_name}}\n\nNew Lead Assigned\n\nStudent:\n{{student_name}}\n\nCourse:\n{{course_name}}\n\nMobile:\n{{mobile_number}}\n\nPlease contact within 15 minutes.\n\nARK CRM",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  lead_followup_reminder: def(
    "lead_followup_reminder",
    "Hi {{counselor_name}}\n\nReminder: please follow up with {{student_name}} regarding {{course_name}}. This lead is awaiting your response.",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  sla_breach_alert: def(
    "sla_breach_alert",
    "Hi {{counselor_name}}\n\nSLA BREACH\n\nStudent:\n{{student_name}}\n\nCourse:\n{{course_name}}\n\nThis lead has crossed its response SLA. Immediate action required.\n\nARK CRM",
  ),
  // Approved AiSensy Utility template (v2). Positional params:
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time, {{5}} faculty_name
  lead_demo_scheduled_v2: def(
    "lead_demo_scheduled_v2",
    "Hi {{student_name}},\n\nYour demo session for {{course_name}} is confirmed.\n\nDate: {{demo_date}}\nTime: {{demo_time}}\nFaculty: {{faculty_name}}\n\nWe look forward to seeing you at ARK Learning Arena!",
  ),
  // Approved AiSensy Utility template (v2). Positional params (order is FINAL):
  // {{1}} parent_name, {{2}} student_name, {{3}} course_name
  lead_admission_completed_v2: def(
    "lead_admission_completed_v2",
    "Hi {{parent_name}},\n\n" +
      "We are pleased to inform you that the admission of {{student_name}} for {{course_name}} has been successfully completed.\n\n" +
      "Welcome to ARK Learning Arena.\n\n" +
      "We look forward to supporting your academic journey.\n\n" +
      "Thank you,\nARK Learning Arena",
  ),
  // Approved AiSensy Utility template (v2). Positional params:
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time
  lead_demo_reminder_v2: def(
    "lead_demo_reminder_v2",
    "Hi {{student_name}},\n\nThis is a reminder for your upcoming demo session for {{course_name}}.\n\nDate: {{demo_date}}\nTime: {{demo_time}}\n\nSee you soon at ARK Learning Arena!",
  ),
  lead_low_performance: def(
    "lead_low_performance",
    "Hi {{counselor_name}}, your lead follow-up rate is currently {{rate}}%. Please prioritise pending follow-ups to improve conversions.",
  ),
  lead_unassigned_alert: def(
    "lead_unassigned_alert",
    "Action needed: a new {{course}} lead ({{student_name}}, {{phone}}) could not be auto-assigned. Please assign a counselor.",
  ),
};

/**
 * Welcome template selector. The funnel now uses a single Meta Utility Template
 * (`lead_welcome`) for every course — the course name is passed as the {{2}}
 * variable rather than baked into separate templates. Kept as a function so the
 * call sites stay stable.
 */
export function welcomeTemplateForCourse(_course?: string | null): LeadTemplateKey {
  return "lead_welcome";
}

/** Build a ready-to-enqueue RenderedMessage for a lead template + variables. */
export function renderLeadMessage(
  key: LeadTemplateKey,
  vars: Record<string, string | number | undefined | null>,
): RenderedMessage {
  const t = LEAD_TEMPLATES[key];
  return renderMessage(
    {
      templateKey: t.key,
      language: "en",
      providerName: t.providerName,
      body: t.body,
      buttons: [],
      media: undefined,
      variables: t.variables,
    },
    vars,
  );
}
