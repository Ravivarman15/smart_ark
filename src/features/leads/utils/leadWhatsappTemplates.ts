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
    "Dear {{student_name}},\n\n" +
      "We have received your enquiry for {{course_name}}.\n\n" +
      "Our admissions team will review your details and contact you shortly with the information you requested.\n\n" +
      "Thank you,\n{{org_name}} Admissions Team.",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name, {{4}} mobile_number
  lead_assigned_counselor: def(
    "lead_assigned_counselor",
    "Dear {{counselor_name}},\n\n" +
      "A new enquiry has been assigned to you.\n\n" +
      "Student: {{student_name}}\nCourse: {{course_name}}\nContact: {{mobile_number}}\n\n" +
      "Please respond within your agreed follow-up window and update the enquiry record once you have made contact.\n\n" +
      "Thank you,\n{{org_name}} Team.",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  lead_followup_reminder: def(
    "lead_followup_reminder",
    "Dear {{counselor_name}},\n\n" +
      "A follow-up is pending on the enquiry from {{student_name}} for {{course_name}}.\n\n" +
      "This enquiry is still awaiting your response. Please contact them and update the enquiry record.\n\n" +
      "Thank you,\n{{org_name}} Team.",
  ),
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  sla_breach_alert: def(
    "sla_breach_alert",
    "Dear {{counselor_name}},\n\n" +
      "The enquiry from {{student_name}} for {{course_name}} has passed its agreed response time.\n\n" +
      "Please contact them at the earliest and record the outcome against the enquiry.\n\n" +
      "Thank you,\n{{org_name}} Team.",
  ),
  // Approved AiSensy Utility template. Positional params:
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time, {{5}} faculty_name
  lead_demo_scheduled_v2: def(
    "lead_demo_scheduled_v2",
    "Dear {{student_name}},\n\n" +
      "Your demo session for {{course_name}} is confirmed.\n\n" +
      "Date: {{demo_date}}\nTime: {{demo_time}}\nFaculty: {{faculty_name}}\n\n" +
      "Please arrive ten minutes before the scheduled time. To reschedule, reply to this message or contact the office.\n\n" +
      "Thank you,\n{{org_name}} Admissions Team.",
  ),
  // Approved AiSensy Utility template. Positional params:
  // {{1}} parent_name, {{2}} student_name, {{3}} course_name
  lead_admission_completed_v2: def(
    "lead_admission_completed_v2",
    "Dear {{parent_name}},\n\n" +
      "The admission of {{student_name}} for {{course_name}} is now complete.\n\n" +
      "The enrolment record has been created. Fee and schedule details will be shared with you separately.\n\n" +
      "Thank you,\n{{org_name}} Administration.",
  ),
  // Approved AiSensy Utility template. Positional params:
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time
  lead_demo_reminder_v2: def(
    "lead_demo_reminder_v2",
    "Dear {{student_name}},\n\n" +
      "This is a reminder of your demo session for {{course_name}}.\n\n" +
      "Date: {{demo_date}}\nTime: {{demo_time}}\n\n" +
      "To reschedule, reply to this message or contact the office.\n\n" +
      "Thank you,\n{{org_name}} Admissions Team.",
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
