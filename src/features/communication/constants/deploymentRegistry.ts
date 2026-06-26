// ──────────────────────────────────────────────────────────────────────────────
// COMMUNICATION DEPLOYMENT REGISTRY — descriptive metadata only.
//
// This is NOT a second engine and holds NO send logic. It is the catalogue the
// Deployment Manager reads to answer "which ERP module depends on which template
// and what is the full module → provider path". Each entry mirrors the verified
// trace in docs/COMMUNICATION_VERIFICATION.md.
// ──────────────────────────────────────────────────────────────────────────────

import type { CommsChannel } from "../types/communication.types";

export interface TemplateDeployMeta {
  /** comms_templates key (single source of truth). */
  key: string;
  /** Owning ERP module (human label). */
  module: string;
  /** When it fires. */
  trigger: string;
  /** Where it's invoked from (page route / automation). */
  usedIn: string;
  channel: CommsChannel | "email";
  /** Client service that enqueues it. */
  service: string;
  /** Edge function that dispatches it. */
  edgeFn: "send-aisensy" | "send-email";
  provider: "AiSensy" | "Brevo";
  retry: boolean;
  webhook: boolean;
  audit: boolean;
  /** True once the module UI/automation actively sends this template today. */
  wired: boolean;
  deprecated?: boolean;
}

const wa = {
  channel: "whatsapp" as const,
  edgeFn: "send-aisensy" as const,
  provider: "AiSensy" as const,
  retry: true,
  webhook: true,
  audit: true,
};

const CAMPAIGN_SVC = "commsCampaignsService.launch → aisensyService.enqueueBulk";
const CRED_SVC = "verify-credentials → aisensyService.enqueue";

// Keyed by template key. Wired entries correspond to the 12 audited modules; the
// remaining keys are registered templates awaiting module/automation wiring.
export const DEPLOYMENT_REGISTRY: TemplateDeployMeta[] = [
  // ── Wired modules (the audited 12) ──────────────────────────────────────
  { key: "inquiry_followup", module: "Inquiry", trigger: "Manual campaign", usedIn: "communication/send-inquiry", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "student_welcome", module: "Student", trigger: "Manual campaign", usedIn: "communication/send-student", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "staff_welcome", module: "Staff", trigger: "Manual campaign", usedIn: "communication/send-staff", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "staff_credentials", module: "Staff", trigger: "Credential send (login-gated)", usedIn: "communication/send-staff-credentials", service: CRED_SVC, wired: true, ...wa },
  { key: "student_credentials", module: "Student", trigger: "Credential send (login-gated)", usedIn: "communication/send-student-credentials", service: CRED_SVC, wired: true, ...wa },
  { key: "exam_reminder", module: "Exam", trigger: "Upcoming exam campaign", usedIn: "communication/send-exam-reminder", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "exam_result", module: "Exam", trigger: "Marks published campaign", usedIn: "communication/send-exam-marks", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "fee_status", module: "Fee", trigger: "Fee status campaign", usedIn: "communication/send-fee-status", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "fee_due_reminder", module: "Fee", trigger: "Fee due campaign", usedIn: "communication/send-fee-due-reminder", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "attendance_absent", module: "Attendance", trigger: "Today-absent campaign", usedIn: "communication/send-absent-attendance", service: CAMPAIGN_SVC, wired: true, ...wa },
  { key: "birthday_wish", module: "Student", trigger: "Birthday campaign", usedIn: "communication/send-birthday", service: CAMPAIGN_SVC, wired: true, ...wa },

  // ── Registered, awaiting module/automation wiring ───────────────────────
  { key: "payment_received", module: "Fee", trigger: "On payment (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "parent_credentials", module: "Student", trigger: "Parent portal provisioning", usedIn: "automation (planned)", service: CRED_SVC, wired: false, ...wa },
  { key: "password_reset", module: "Credentials", trigger: "Password reset", usedIn: "automation (planned)", service: CRED_SVC, wired: false, ...wa },
  { key: "account_activated", module: "Credentials", trigger: "Account activated", usedIn: "automation (planned)", service: CRED_SVC, wired: false, ...wa },
  { key: "account_disabled", module: "Credentials", trigger: "Account disabled", usedIn: "automation (planned)", service: CRED_SVC, wired: false, ...wa },
  { key: "attendance_present", module: "Attendance", trigger: "Present confirmation (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "holiday_notice", module: "Announcement", trigger: "Holiday broadcast", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "salary_slip", module: "Payroll", trigger: "Payroll approval (Resend Payslips)", usedIn: "payroll/approval", service: "payrollEmailService → send-email", edgeFn: "send-email", provider: "Brevo", channel: "email", retry: false, webhook: false, audit: true, wired: true },
  { key: "payroll_approved", module: "Payroll", trigger: "Payroll approved (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "task_assigned", module: "Tasks", trigger: "Task assigned (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "task_reminder", module: "Tasks", trigger: "Task due (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "certificate_ready", module: "Certificate", trigger: "Certificate issued (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "live_class_notification", module: "Live Class", trigger: "Class scheduled", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
  { key: "class_cancelled", module: "Live Class", trigger: "Class cancelled (planned)", usedIn: "automation (planned)", service: CAMPAIGN_SVC, wired: false, ...wa },
];

export const DEPLOYMENT_REGISTRY_BY_KEY: Record<string, TemplateDeployMeta> =
  DEPLOYMENT_REGISTRY.reduce(
    (acc, m) => {
      acc[m.key] = m;
      return acc;
    },
    {} as Record<string, TemplateDeployMeta>,
  );
