// ──────────────────────────────────────────────────────────────────────────────
// MULTI-TENANT PROVIDER TEMPLATE FAMILY  (Phase E)
//
// ┌── WHY A LOCAL BODY EDIT WAS NOT ENOUGH ────────────────────────────────┐
// │ send-aisensy posts { campaignName, templateParams } to AiSensy. Meta   │
// │ then renders ITS OWN approved template body using those positional     │
// │ parameters. Our local `body` never reaches WhatsApp — it is used for   │
// │ email, the queue payload and previews only.                            │
// │                                                                        │
// │ So `ark_attendance_absent`, whose approved Meta body ends              │
// │ "Thank you, ARK Learning Arena", sends that text to EVERY tenant's     │
// │ parents no matter what our local template says. Adding {{org_name}} to │
// │ the local body fixed email and previews, and changed nothing about the │
// │ WhatsApp message.                                                      │
// │                                                                        │
// │ The only real fix is a NEW approved template that takes the            │
// │ organization name as a parameter. That requires Meta approval, which   │
// │ is an operational step this code cannot perform or fake.               │
// └────────────────────────────────────────────────────────────────────────┘
//
// CONTROLLED ROLLOUT, NOT A SWITCH
//   Every new template starts at READY_FOR_SUBMISSION. Only a human marking
//   it ACTIVE — after Meta approves it and a test send is verified — makes the
//   engine use it. Until then the legacy ARK campaign continues to serve ARK,
//   unchanged, which is what keeps a live production flow working during a
//   migration that depends on a third party.
//
// This is metadata only. No second registry, no second dispatcher, no second
// queue — `whatsappTemplates.ts` remains the canonical body/variable source.
// ──────────────────────────────────────────────────────────────────────────────

import {
  campaignVerdict,
  type CampaignExistence,
} from "./providerCampaigns";

/**
 * Where a provider template is in the approval pipeline.
 *
 * Deliberately NOT a boolean. "Submitted" and "approved" are different states
 * with different consequences, and collapsing them is how an unapproved
 * template gets sent and the whole WhatsApp number gets flagged.
 */
export type ProviderTemplateStatus =
  | "LEGACY"                // The ARK-branded template in production today.
  | "READY_FOR_SUBMISSION"  // Body finalised here; not yet given to Meta.
  | "SUBMITTED"             // Awaiting Meta review.
  | "APPROVED"              // Meta approved it; NOT yet verified by a test send.
  | "ACTIVE"                // Approved AND verified. Only this state may send.
  | "REJECTED"
  | "DISABLED";

/** Only this status may be used for a live send. */
export const SENDABLE_STATUS: ProviderTemplateStatus = "ACTIVE";

export interface ProviderTemplate {
  /** Canonical ERP template key — matches whatsappTemplates.ts. */
  key: string;
  /** Canonical automation event this serves. */
  eventKey: string;
  /** The ARK-branded campaign in production today. Never deleted. */
  legacyCampaign: string;
  /** The organization-neutral campaign to be approved. */
  campaign: string;
  /** Meta template category — drives approval rules and pricing. */
  category: "UTILITY" | "MARKETING";
  /**
   * Positional parameter order for the NEW template, {{1}}…{{n}}.
   *
   * This is the contract with Meta. It MUST match the submitted body exactly,
   * and it must be append-only relative to the legacy order — inserting
   * org_name in the middle would silently shift every later parameter and send
   * a date where a name belongs.
   */
  params: string[];
  /** The exact body submitted to Meta, in {{n}} form. */
  body: string;
  status: ProviderTemplateStatus;
  /** Why it is not ACTIVE yet, when that is not obvious. */
  note?: string;
}

/**
 * The multi-tenant family.
 *
 * Naming: `smartark_` prefix, because the template is owned by the PLATFORM and
 * shared by every organization. `ark_` would repeat the mistake — one tenant's
 * name on a shared asset.
 *
 * Every `params` array below appends `org_name` to the END of the legacy order,
 * so the existing positional mapping is preserved verbatim and only a new
 * trailing parameter is introduced.
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    key: "attendance_absent",
    eventKey: "attendance_absent",
    legacyCampaign: "ark_attendance_absent",
    campaign: "smartark_attendance_absent",
    category: "UTILITY",
    // Legacy order was parent, student, class, section, date — preserved, with
    // org_name appended as {{6}}.
    params: ["parent_name", "student_name", "class", "section", "attendance_date", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.\n\n" +
      "If your child was present or if this attendance was marked incorrectly, please contact the school office.\n\n" +
      "Thank you,\n{{6}}",
    status: "ACTIVE",
  },
  {
    key: "attendance_corrected",
    eventKey: "attendance_corrected",
    legacyCampaign: "ark_attendance_corrected",
    campaign: "smartark_attendance_corrected",
    category: "UTILITY",
    params: ["parent_name", "student_name", "attendance_date", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.\n\n" +
      "Thank you.\n\n{{4}}",
    status: "ACTIVE",
  },
  {
    key: "staff_credentials",
    eventKey: "staff_credentials",
    legacyCampaign: "staff_credentials",
    // Suffixed `1` because `smartark_staff_credentials` was REJECTED by Meta
    // and a rejected campaign name cannot be reused for a resubmission. The
    // suffix is not a version number — it is a fresh identifier. If this one is
    // also rejected the next attempt needs another new name, not an edit.
    campaign: "smartark_staff_credentials1",
    category: "UTILITY",
    params: ["staff_name", "role", "login_email", "password", "login_url", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your staff portal account has been created.\n\n" +
      "Role: {{2}}\nLogin Email: {{3}}\nTemporary Password: {{4}}\nPortal: {{5}}\n\n" +
      "Please sign in and change your password after the first login. Keep these details confidential.\n\n" +
      "Thank you,\n{{6}}",
    status: "REJECTED",
    note:
      "REJECTED BY META on the 2026-08-13 submission — the SECOND rejection of this " +
      "design. The structural faults were already fixed (no duplicate parameter, " +
      "ascending order), so the remaining cause is the content: the message carries a " +
      "plaintext password, which Meta routes to the Authentication category. An " +
      "Authentication template cannot carry free-form Role / Login Email / Portal " +
      "fields, so this shape cannot be made to fit. " +
      "DO NOT RESUBMIT IT — `smartark_staff_credentials1` is now burned as a name too. " +
      "The replacement is the set-password-link flow in AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md §5, " +
      "which carries no secret at all. Staff credentials continue to send through the " +
      "legacy `staff_credentials` campaign meanwhile — resolveCampaign() returns it for " +
      "every status except ACTIVE, so nothing about the live flow changed. " +
      "Credential value is supplied at trigger time and never persisted — see Phase C2.",
  },
  {
    key: "student_credentials",
    eventKey: "student_credentials",
    legacyCampaign: "parent_credentials",
    // Suffixed `1` for the same reason as the staff template — the original
    // name was rejected and cannot be resubmitted.
    campaign: "smartark_student_credentials1",
    category: "UTILITY",
    params: ["parent_name", "student_name", "login_email", "password", "login_url", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "The Parent Portal account for {{2}} has been created.\n\n" +
      "Login Email: {{3}}\nTemporary Password: {{4}}\nPortal: {{5}}\n\n" +
      "Please sign in and change your password after the first login. Keep these details confidential.\n\n" +
      "Thank you,\n{{6}}",
    status: "REJECTED",
    note:
      "REJECTED BY META alongside smartark_staff_credentials1, for the same reason: the " +
      "body carries a plaintext password. See that entry's note. DO NOT RESUBMIT this " +
      "design — the name is burned. Parent Portal credentials continue on the legacy " +
      "`parent_credentials` campaign.",
  },
  {
    key: "fee_receipt",
    eventKey: "fee_paid",
    legacyCampaign: "fee_receipt",
    campaign: "smartark_fee_receipt",
    category: "UTILITY",
    params: ["parent_name", "student_name", "class", "receipt_no", "amount_paid", "pending_balance", "org_name"],
    body:
      "Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).\n" +
      "Receipt No: {{4}}\nAmount Paid: ₹{{5}}\nPending Balance: ₹{{6}}\n" +
      "Thank you. — {{7}}",
    status: "ACTIVE",
    note:
      "fee_paid executes through feeReceiptDelivery.service — a LEGACY WORKING FLOW that is " +
      "deliberately not migrated. This entry exists so the campaign can be approved ahead of " +
      "any future migration; activating it does NOT change the fee receipt execution path.",
  },

  // ── PHASE F — LEAD CRM / ENQUIRY FUNNEL ────────────────────────────────────
  {
    key: "lead_welcome",
    eventKey: "lead_created",
    legacyCampaign: "lead_welcome",
    campaign: "smartark_lead_enquiry_received",
    category: "UTILITY",
    params: ["student_name", "course_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "We have received your enquiry for {{2}}.\n\n" +
      "Our admissions team will review your details and contact you shortly with the information you requested.\n\n" +
      "Thank you,\n{{3}} Admissions Team.",
    status: "ACTIVE",
    note:
      "Replaces the ARK-branded `lead_welcome`, which delivers to every tenant's " +
      "enquirers with ARK's name as static text. Approved by Meta.",
  },
  {
    key: "lead_assigned_counselor",
    eventKey: "lead_assigned",
    legacyCampaign: "lead_assigned_counselor",
    campaign: "smartark_lead_assigned",
    category: "UTILITY",
    params: ["counselor_name", "student_name", "course_name", "mobile_number", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "A new enquiry has been assigned to you.\n\n" +
      "Student: {{2}}\nCourse: {{3}}\nContact: {{4}}\n\n" +
      "Please respond within your agreed follow-up window and update the enquiry record once you have made contact.\n\n" +
      "Thank you,\n{{5}} Team.",
    status: "ACTIVE",
  },
  {
    key: "lead_followup_reminder",
    eventKey: "lead_followup_due",
    legacyCampaign: "lead_followup_reminder",
    campaign: "smartark_lead_followup_due",
    category: "UTILITY",
    params: ["counselor_name", "student_name", "course_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "A follow-up is pending on the enquiry from {{2}} for {{3}}.\n\n" +
      "This enquiry is still awaiting your response. Please contact them and update the enquiry record.\n\n" +
      "Thank you,\n{{4}} Team.",
    status: "ACTIVE",
  },
  {
    key: "sla_breach_alert",
    eventKey: "lead_sla_breach",
    legacyCampaign: "sla_breach_alert",
    campaign: "smartark_lead_sla_breach",
    category: "UTILITY",
    params: ["counselor_name", "student_name", "course_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "The enquiry from {{2}} for {{3}} has passed its agreed response time.\n\n" +
      "Please contact them at the earliest and record the outcome against the enquiry.\n\n" +
      "Thank you,\n{{4}} Team.",
    status: "ACTIVE",
  },
  {
    key: "lead_demo_scheduled_v2",
    eventKey: "demo_scheduled",
    legacyCampaign: "lead_demo_scheduled_v2",
    campaign: "smartark_lead_demo_scheduled",
    category: "UTILITY",
    params: ["student_name", "course_name", "demo_date", "demo_time", "faculty_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your demo session for {{2}} is confirmed.\n\n" +
      "Date: {{3}}\nTime: {{4}}\nFaculty: {{5}}\n\n" +
      "Please arrive ten minutes before the scheduled time. To reschedule, reply to this message or contact the office.\n\n" +
      "Thank you,\n{{6}} Admissions Team.",
    status: "ACTIVE",
  },
  {
    key: "lead_demo_reminder_v2",
    eventKey: "demo_reminder",
    legacyCampaign: "lead_demo_reminder_v2",
    campaign: "smartark_lead_demo_reminder",
    category: "UTILITY",
    params: ["student_name", "course_name", "demo_date", "demo_time", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is a reminder of your demo session for {{2}}.\n\n" +
      "Date: {{3}}\nTime: {{4}}\n\n" +
      "To reschedule, reply to this message or contact the office.\n\n" +
      "Thank you,\n{{5}} Admissions Team.",
    status: "ACTIVE",
  },
  {
    key: "lead_admission_completed_v2",
    eventKey: "admission_completed",
    legacyCampaign: "lead_admission_completed_v2",
    campaign: "smartark_lead_admission_confirmed",
    category: "UTILITY",
    params: ["parent_name", "student_name", "course_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "The admission of {{2}} for {{3}} is now complete.\n\n" +
      "The enrolment record has been created. Fee and schedule details will be shared with you separately.\n\n" +
      "Thank you,\n{{4}} Administration.",
    status: "ACTIVE",
    note:
      "Approved by Meta. Names the organization once in the sign-off.",
  },

  // ── PHASE G — FEE DUE REMINDER ─────────────────────────────────────────────
  {
    key: "fee_due_reminder",
    eventKey: "fee_due",
    legacyCampaign: "fee_due",
    campaign: "smartark_fee_due_reminder",
    category: "UTILITY",
    params: ["parent_name", "amount_due", "student_name", "due_date", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is a reminder that a fee payment of ₹{{2}} is due for {{3}} on or before {{4}}.\n\n" +
      "Please contact our office if you have any questions regarding this balance.\n\n" +
      "Thank you,\n{{5}} Accounts Team.",
    status: "ACTIVE",
  },

  // ── PHASE H — ACADEMIC & FACULTY ALLOCATION (Approved Meta UTILITY) ─────────
  {
    key: "teacher_class_scheduled",
    eventKey: "teacher_class_scheduled",
    legacyCampaign: "teacher_class_scheduled",
    campaign: "smartark_teacher_class_scheduled",
    category: "UTILITY",
    params: ["faculty_name", "subject", "date", "start_time", "end_time", "room", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "A class for {{2}} has been scheduled on {{3}} from {{4}} to {{5}} in Room {{6}}.\n\n" +
      "Regards,\n{{7}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "teacher_class_rescheduled",
    eventKey: "teacher_class_rescheduled",
    legacyCampaign: "teacher_class_rescheduled",
    campaign: "smartark_teacher_class_rescheduled",
    category: "UTILITY",
    params: ["faculty_name", "subject", "date", "start_time", "end_time", "room", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your class for {{2}} has been rescheduled to {{3}} from {{4}} to {{5}} in Room {{6}}.\n\n" +
      "Regards,\n{{7}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "teacher_class_cancelled",
    eventKey: "teacher_class_cancelled",
    legacyCampaign: "teacher_class_cancelled",
    campaign: "smartark_teacher_class_cancelled",
    category: "UTILITY",
    params: ["faculty_name", "subject", "date", "time", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your class for {{2}} on {{3}} ({{4}}) has been cancelled.\n\n" +
      "Regards,\n{{5}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "teacher_extra_class",
    eventKey: "teacher_extra_class",
    legacyCampaign: "teacher_extra_class",
    campaign: "smartark_teacher_extra_class",
    category: "UTILITY",
    params: ["faculty_name", "subject", "date", "time", "room", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "An extra class for {{2}} has been assigned to you on {{3}} at {{4}} in {{5}}.\n\n" +
      "Regards,\n{{6}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "teacher_substitute_assigned",
    eventKey: "teacher_substitute_assigned",
    legacyCampaign: "teacher_substitute_assigned",
    campaign: "smartark_teacher_substitute_assigned",
    category: "UTILITY",
    params: ["faculty_name", "subject", "date", "time", "room", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "You have been assigned as substitute faculty for {{2}} on {{3}} at {{4}} in {{5}}.\n\n" +
      "Regards,\n{{6}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_reminder_faculty",
    eventKey: "class_reminder_faculty",
    legacyCampaign: "class_reminder_faculty",
    campaign: "smartark_class_reminder_faculty",
    category: "UTILITY",
    params: ["faculty_name", "subject", "time", "room", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your class for {{2}} starts in 15 minutes at {{3}} in {{4}}.\n\n" +
      "Regards,\n{{5}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_reminder_coordinator",
    eventKey: "class_reminder_coordinator",
    legacyCampaign: "class_reminder_coordinator",
    campaign: "smartark_class_reminder_coordinator",
    category: "UTILITY",
    params: ["subject", "faculty_name", "time", "room", "org_name"],
    body:
      "Coordinator Alert:\n\n" +
      "The class for {{1}} (Faculty: {{2}}) has not started and is due at {{3}} in {{4}}.\n\n" +
      "Regards,\n{{5}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_started",
    eventKey: "class_started",
    legacyCampaign: "class_started",
    campaign: "smartark_class_started",
    category: "UTILITY",
    params: ["subject", "faculty_name", "time", "room", "org_name"],
    body:
      "Academic Notice:\n\n" +
      "Class for {{1}} (Faculty: {{2}}) went live at {{3}} in {{4}}.\n\n" +
      "Regards,\n{{5}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_ended",
    eventKey: "class_ended",
    legacyCampaign: "class_ended",
    campaign: "smartark_class_ended",
    category: "UTILITY",
    params: ["subject", "faculty_name", "time", "duration", "org_name"],
    body:
      "Academic Notice:\n\n" +
      "Class for {{1}} (Faculty: {{2}}) concluded at {{3}}. Duration: {{4}} hrs.\n\n" +
      "Regards,\n{{5}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_attendance_due",
    eventKey: "class_attendance_due",
    legacyCampaign: "class_attendance_due",
    campaign: "smartark_class_attendance_due",
    category: "UTILITY",
    params: ["subject", "org_name"],
    body:
      "Attendance Reminder:\n\n" +
      "10 minutes remain in the session for {{1}}. Please complete and submit student attendance.\n\n" +
      "Thank you,\n{{2}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_attendance_missing",
    eventKey: "class_attendance_missing",
    legacyCampaign: "class_attendance_missing",
    campaign: "smartark_class_attendance_missing",
    category: "UTILITY",
    params: ["subject", "org_name"],
    body:
      "Attendance Alert:\n\n" +
      "The session for {{1}} has ended, but student attendance has not been submitted. Please record attendance immediately.\n\n" +
      "Thank you,\n{{2}} Academic Office.",
    status: "ACTIVE",
  },
  {
    key: "class_cancelled_students",
    eventKey: "class_cancelled_students",
    legacyCampaign: "class_cancelled",
    campaign: "smartark_class_cancelled_students",
    category: "UTILITY",
    params: ["subject", "date", "time", "org_name"],
    body:
      "Notice to Students and Parents:\n\n" +
      "The scheduled class for {{1}} on {{2}} at {{3}} has been cancelled. Please contact the academic office for rescheduled timings.\n\n" +
      "Regards,\n{{4}} Administration.",
    status: "ACTIVE",
  },

  // ── PHASE I — ACADEMIC MILESTONES, STAFF PAYROLL & TASKS ──────────────────
  {
    key: "exam_result",
    eventKey: "exam_published",
    legacyCampaign: "exam_result",
    campaign: "smartark_exam_result",
    category: "UTILITY",
    params: ["parent_name", "student_name", "exam_title", "marks_obtained", "total_marks", "grade", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "The exam results for {{2}} in {{3}} are now published.\n\n" +
      "Marks Obtained: {{4}} / {{5}}\nGrade: {{6}}\n\n" +
      "Thank you,\n{{7}} Academic Team.",
    status: "ACTIVE",
  },
  {
    key: "exam_reminder",
    eventKey: "exam_scheduled",
    legacyCampaign: "exam_reminder",
    campaign: "smartark_exam_reminder",
    category: "UTILITY",
    params: ["parent_name", "student_name", "exam_title", "exam_date", "exam_time", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is a reminder for {{2}} regarding the upcoming exam {{3}} scheduled on {{4}} at {{5}}.\n\n" +
      "Thank you,\n{{6}} Examination Cell.",
    status: "APPROVED",
  },
  {
    key: "birthday_wish",
    eventKey: "birthday_student",
    legacyCampaign: "birthday_wish",
    campaign: "smartark_birthday_wish",
    category: "UTILITY",
    params: ["parent_name", "student_name", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "We wish {{2}} a very happy birthday and a wonderful year ahead filled with learning and success.\n\n" +
      "Warm regards,\n{{3}} Team.",
    status: "ACTIVE",
  },
  {
    key: "payroll_approved",
    eventKey: "payroll_approved",
    legacyCampaign: "payroll_approved",
    campaign: "smartark_payroll_approved",
    category: "UTILITY",
    params: ["staff_name", "month_year", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "Your payroll for {{2}} has been approved and processed. Your payslip is available on the staff portal.\n\n" +
      "Regards,\n{{3}} Accounts Team.",
    status: "ACTIVE",
  },
  {
    key: "task_assigned",
    eventKey: "task_assigned",
    legacyCampaign: "task_assigned",
    campaign: "smartark_task_assigned",
    category: "UTILITY",
    params: ["assignee_name", "task_title", "due_date", "priority", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "A new task has been assigned to you.\n\n" +
      "Task: {{2}}\nDue Date: {{3}}\nPriority: {{4}}\n\n" +
      "Regards,\n{{5}} Team.",
    status: "ACTIVE",
  },
  {
    key: "task_reminder",
    eventKey: "task_due",
    legacyCampaign: "task_reminder",
    campaign: "smartark_task_reminder",
    category: "UTILITY",
    params: ["assignee_name", "task_title", "due_date", "org_name"],
    body:
      "Dear {{1}},\n\n" +
      "This is a reminder that your assigned task is due soon.\n\n" +
      "Task: {{2}}\nDue Date: {{3}}\n\n" +
      "Regards,\n{{4}} Team.",
    status: "ACTIVE",
  },
];

export const PROVIDER_TEMPLATES_BY_KEY: Record<string, ProviderTemplate> =
  PROVIDER_TEMPLATES.reduce((acc, t) => {
    acc[t.key] = t;
    return acc;
  }, {} as Record<string, ProviderTemplate>);

// Key aliases for backward compatibility and alternate event mappings
if (PROVIDER_TEMPLATES_BY_KEY["class_cancelled_students"]) {
  PROVIDER_TEMPLATES_BY_KEY["class_cancelled"] = PROVIDER_TEMPLATES_BY_KEY["class_cancelled_students"];
}

/**
 * The campaign to actually post for a template key.
 *
 * Returns the NEW campaign only once it is ACTIVE — meaning Meta approved it
 * AND a human verified a test send. Every other state falls back to the legacy
 * campaign, so ARK's production communication is untouched by this file until
 * somebody deliberately flips a status.
 *
 * `null` means "no provider template registered" — the caller keeps whatever
 * providerName the canonical template already carries.
 */
export interface ResolvedCampaign {
  campaign: string;
  isMultiTenant: boolean;
  status: ProviderTemplateStatus;
  /**
   * Whether posting to `campaign` can succeed AT THE PROVIDER.
   *
   * ┌── THE GAP THIS CLOSES ─────────────────────────────────────────────┐
   * │ `status` describes the NEW template's journey through Meta review. │
   * │ It says nothing about the legacy campaign this function falls back │
   * │ to — and the fallback is what actually sends for every template    │
   * │ that is not ACTIVE.                                                │
   * │                                                                    │
   * │ `staff_credentials` sat at REJECTED, resolved to its legacy        │
   * │ campaign exactly as designed, and that legacy campaign does not    │
   * │ exist at AiSensy. Six sends, six `HTTP 400: Campaign does not      │
   * │ exist.`, zero staff credentials ever delivered over WhatsApp —     │
   * │ while the registry reported the reassuring PROVIDER_PENDING.       │
   * │                                                                    │
   * │ So the resolver now answers both questions: which campaign, AND    │
   * │ whether that campaign is real.                                     │
   * └────────────────────────────────────────────────────────────────────┘
   */
  sendable: boolean;
  existence: CampaignExistence;
  /** Present exactly when `sendable` is false. Operator-facing, one sentence. */
  blockedReason?: string;
}

export function resolveCampaign(templateKey: string): ResolvedCampaign | null {
  const t = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  if (!t) return null;
  const active = t.status === SENDABLE_STATUS;
  const campaign = active ? t.campaign : t.legacyCampaign;
  const verdict = campaignVerdict(campaign);
  return {
    campaign,
    isMultiTenant: active,
    status: t.status,
    sendable: verdict.sendable,
    existence: verdict.existence,
    ...(verdict.blockedReason ? { blockedReason: verdict.blockedReason } : {}),
  };
}

/** True when this template still sends one tenant's branding to every tenant. */
export function isBrandingLeaked(templateKey: string): boolean {
  const t = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  return !!t && t.status !== SENDABLE_STATUS;
}
