// ──────────────────────────────────────────────────────────────────────────────
// WhatsApp Template Engine — registration, variables, placeholders, preview,
// versioning. The single source of truth for every outbound template the
// communication module enqueues.
//
// All calculation / substitution lives here so no UI builds raw provider
// payloads. The AiSensy service consumes a `RenderedMessage` built from this
// registry.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  CommsTemplate,
  TemplateButton,
  TemplateCategory,
  TemplateMedia,
} from "../types/communication.types";

// ── Variable substitution ────────────────────────────────────────────────────
const VAR_RE = /\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}/g;

/**
 * Extract every {{variable}} / {variable} token from a template body, in order
 * of first appearance, de-duplicated.
 */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(body))) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/**
 * Replace every {{name}} / {name} token in a body with the matching value.
 * Missing values fall through to the second argument (defaultsTo) or "".
 */
export function renderBody(
  body: string,
  vars: Record<string, string | number | undefined | null>,
  defaultsTo = ""
): string {
  return body.replace(VAR_RE, (_match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? defaultsTo : String(v);
  });
}

/**
 * Validate a substitution: which required variables are still missing.
 */
export function missingVariables(
  required: string[],
  provided: Record<string, unknown>
): string[] {
  return required.filter((k) => {
    const v = provided[k];
    return v === undefined || v === null || v === "";
  });
}

// ── Built-in template registry ───────────────────────────────────────────────
// Every template the communication module references at build time. The DB
// table `comms_templates` is authoritative once seeded — this registry is the
// fallback used pre-migration AND the canonical default body the seed script
// inserts. Keys MUST stay in sync with FEE_WA_TEMPLATES / live-class keys.

export interface BuiltinTemplate {
  key: string;
  category: TemplateCategory;
  language: string;
  title: string;
  body: string;
  variables: string[];
  buttons?: TemplateButton[];
  media?: TemplateMedia;
  /** AiSensy campaign / template name to map to. */
  providerName?: string;
}

const def = (
  key: string,
  category: TemplateCategory,
  title: string,
  body: string,
  opts: Partial<Omit<BuiltinTemplate, "key" | "category" | "title" | "body">> = {}
): BuiltinTemplate => ({
  key,
  category,
  title,
  body,
  language: opts.language ?? "en",
  variables: opts.variables ?? extractVariables(body),
  buttons: opts.buttons,
  media: opts.media,
  providerName: opts.providerName ?? key,
});

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  def(
    "inquiry_followup",
    "inquiry",
    "Inquiry follow-up",
    "Hi {{name}}, thanks for your enquiry at {{branch_name}}. Reply YES to schedule a campus visit, or click the link to book a slot.",
    { buttons: [{ type: "url", label: "Book Visit", value: "{{cta_url}}" }] }
  ),
  def(
    "student_welcome",
    "student",
    "Student welcome",
    "Welcome to {{branch_name}}, {{student_name}}! Your admission is confirmed for {{batch_name}}. We look forward to a successful journey together."
  ),
  def(
    "staff_welcome",
    "staff",
    "Staff welcome",
    "Welcome aboard {{staff_name}}! You have joined {{branch_name}} as {{designation}}. Please complete your onboarding within 48 hours."
  ),
  // ── Staff credentials (AiSensy Utility template) ───────────────────────────
  // Sent when a staff account is created (Create Staff), when the welcome is
  // resent, and on a password reset — alongside the Brevo welcome email that
  // `invite-staff` owns. Also used by the gated Send Staff Credentials page.
  //
  // {{1}} staff_name {{2}} role {{3}} login_email {{4}} password {{5}} login_url
  //
  // Deliberately the SAME SHAPE as parent_credentials — name, who they are,
  // login, password, link — so the two credential templates cannot drift into
  // different orders and mislead whoever maintains them.
  //
  // `username` is kept as an accepted alias for {{3}} because the credential
  // send page composes with a login-proven `username`; see templateParams.ts.
  def(
    "staff_credentials",
    "credentials",
    "Staff credentials",
    "Dear {{staff_name}},\n\nYour ARK Learning Arena staff portal account has been created.\n\nRole: {{role}}\nLogin Email: {{login_email}}\nTemporary Password: {{password}}\nPortal: {{login_url}}\n\nPlease sign in and change your password after the first login. Keep these details confidential.\n\nThank you,\nARK Learning Arena",
    {
      // Same reasoning as parent_credentials: the org name is static text, and
      // the portal link is a body variable rather than a URL button so a
      // credential message can never be delivered without somewhere to log in.
      variables: ["staff_name", "role", "login_email", "password", "login_url"],
    }
  ),
  def(
    "student_credentials",
    "credentials",
    "Student app credentials",
    "Hi {{parent_name}}, the {{branch_name}} parent app credentials for {{student_name}} are:\nUser: {{username}}\nTemp Password: {{password}}",
    {
      buttons: [{ type: "url", label: "Open App", value: "{{login_url}}" }],
    }
  ),
  def(
    "exam_reminder",
    "exam",
    "Upcoming exam reminder",
    "Reminder: {{student_name}} has {{exam_name}} on {{exam_date}} at {{exam_time}}. Venue: {{venue}}. All the best!"
  ),
  def(
    "exam_result",
    "exam",
    "Exam result published",
    "{{student_name}}'s result for {{exam_name}} is now published. Score: {{marks}}/{{total}} ({{percentage}}%). Grade: {{grade}}.",
    {
      buttons: [{ type: "url", label: "View Report", value: "{{report_url}}" }],
    }
  ),
  def(
    "fee_status",
    "fee",
    "Fee status",
    "Hi {{parent_name}}, fee summary for {{student_name}} ({{batch_name}}):\nPaid: {{amount_paid}}\nPending: {{amount_pending}}\nNext Due: {{due_date}}"
  ),
  def(
    "fee_due_reminder",
    "fee",
    "Fee due reminder",
    "Reminder: fee of {{amount_pending}} for {{student_name}} ({{batch_name}}) is due on {{due_date}}. Please pay to avoid late fee.",
    {
      buttons: [{ type: "url", label: "Pay Now", value: "{{pay_url}}" }],
    }
  ),
  // ── Enterprise Attendance (AiSensy Utility templates) ──────────────────────
  // Sent SYNCHRONOUSLY the moment a teacher submits attendance — never queued,
  // never scheduled. Positional order is pinned in templateParams.ts (mirrored
  // in send-aisensy). See docs/ATTENDANCE_WHATSAPP_AUTOMATION.md.
  //
  // `section` is deliberately NOT a required variable: most students have no
  // section, and missingVariables() treats "" as missing — which would fail
  // validation and silently drop the notice for every section-less student.
  // The service substitutes "-" for a blank section (Meta rejects empty params).
  // {{1}} parent_name {{2}} student_name {{3}} class {{4}} section {{5}} attendance_date
  // `providerName` is the AiSensy CAMPAIGN NAME we post as `campaignName` — it is
  // NOT the internal template key. They differ here: AiSensy campaigns are
  // `ark_`-prefixed. Getting this wrong = AiSensy rejects the send.
  def(
    "attendance_absent",
    "attendance",
    "Attendance — absent",
    "Dear {{parent_name}},\n\nThis is to inform you that {{student_name}} (Class {{class}} - {{section}}) was marked ABSENT on {{attendance_date}}.\n\nIf your child was present or if this attendance was marked incorrectly, please contact the school office.\n\nThank you,\nARK Learning Arena",
    {
      variables: ["parent_name", "student_name", "class", "attendance_date"],
      providerName: "ark_attendance_absent",
    }
  ),
  // {{1}} parent_name {{2}} student_name {{3}} attendance_date
  def(
    "attendance_corrected",
    "attendance",
    "Attendance — corrected to present",
    "Dear {{parent_name}},\n\nThis is to inform you that the attendance for {{student_name}} on {{attendance_date}} has been corrected to PRESENT.\n\nThank you.\n\nARK Learning Arena",
    {
      variables: ["parent_name", "student_name", "attendance_date"],
      providerName: "ark_attendance_corrected",
    }
  ),
  def(
    "birthday_wish",
    "birthday",
    "Birthday wishes",
    "Wishing {{student_name}} a very happy birthday! 🎂 May the year ahead bring joy, growth and success. — Team {{branch_name}}"
  ),
  def(
    "payment_received",
    "fee",
    "Payment received",
    "Thank you {{parent_name}}! We have received {{amount}} for {{student_name}} ({{batch_name}}). Receipt: {{receipt_no}}.",
    {
      buttons: [{ type: "url", label: "View Receipt", value: "{{receipt_url}}" }],
    }
  ),
  // ── Enterprise Fee Receipt (AiSensy Utility template) ──────────────────────
  // Dedicated 6-variable utility receipt sent automatically on every collection.
  // {{receipt_url}} lives only in the button/media so it is NOT a required body
  // variable — a missing signed link never blocks the text message. The AiSensy
  // provider template name is `fee_receipt`; positional order is pinned in
  // templateParams.ts (mirrored in send-aisensy). See docs/AISENSY_TEMPLATES.md.
  def(
    "fee_receipt",
    "fee",
    "Fee payment receipt",
    "Dear {{parent_name}}, we have received a fee payment for {{student_name}} (Class {{class}}).\nReceipt No: {{receipt_no}}\nAmount Paid: ₹{{amount_paid}}\nPending Balance: ₹{{pending_balance}}\nThank you. — ARK Learning Arena",
    {
      buttons: [{ type: "url", label: "View Receipt", value: "{{receipt_url}}" }],
      media: { type: "pdf", url: "{{receipt_url}}" },
    }
  ),
  // ── Parent Portal credentials (AiSensy Utility template) ───────────────────
  // Sent the moment a parent login is provisioned (and on every reset/resend),
  // alongside the credential email. See parentCredentials.service.ts.
  //
  // {{1}} parent_name {{2}} student_name {{3}} login_email {{4}} password {{5}} login_url
  //
  // WHY THE LINK IS A BODY VARIABLE, NOT A BUTTON:
  // a dynamic URL button is a separate AiSensy/Meta configuration, and if it is
  // missing the message still sends — WITHOUT the address the parent needs. A
  // body param cannot silently disappear: `missingVariables` refuses to queue a
  // credential message that has nowhere to log in.
  //
  // The password is a temporary one shown once on screen; putting it here means
  // the parent has it without an office phone call. Utility category is correct —
  // this is an account-servicing message the recipient's own action triggered.
  def(
    "parent_credentials",
    "credentials",
    "Parent portal credentials",
    "Dear {{parent_name}},\n\nThe ARK Learning Arena Parent Portal account for {{student_name}} has been created.\n\nLogin Email: {{login_email}}\nTemporary Password: {{password}}\nPortal: {{login_url}}\n\nPlease sign in and change your password after the first login. Keep these details confidential.\n\nThank you,\nARK Learning Arena",
    {
      // The org name is deliberately STATIC text, not `{{branch_name}}`. Every
      // variable in this body is a positional Meta param; adding a sixth for a
      // value that never changes shifts the password and the link by one if it
      // is ever omitted. Static text cannot be misaligned.
      variables: ["parent_name", "student_name", "login_email", "password", "login_url"],
    }
  ),
  def(
    "password_reset",
    "credentials",
    "Password reset",
    "Hi {{name}}, your {{branch_name}} login password has been reset.\nUser: {{username}}\nNew Temp Password: {{password}}\nPlease log in and change it.",
    {
      buttons: [{ type: "url", label: "Login", value: "{{login_url}}" }],
    }
  ),
  def(
    "account_activated",
    "credentials",
    "Account activated",
    "Hi {{name}}, your {{branch_name}} account ({{username}}) is now active. You can log in any time.",
    {
      buttons: [{ type: "url", label: "Login", value: "{{login_url}}" }],
    }
  ),
  def(
    "account_disabled",
    "credentials",
    "Account disabled",
    "Hi {{name}}, your {{branch_name}} account ({{username}}) has been disabled. Contact the office if you believe this is a mistake.",
  ),
  def(
    "live_class_notification",
    "announcement",
    "Live class notification",
    "Hi {{student_name}}, your {{subject_name}} live class with {{teacher_name}} starts at {{start_time}} on {{start_date}}. Join via the link below.",
    {
      buttons: [{ type: "url", label: "Join Class", value: "{{meeting_link}}" }],
    }
  ),
  // ── Added for the unified Communication Center (spec: Supported Templates) ──
  // These complete the 25-template catalogue. Lead-domain templates
  // (inquiry/lead/demo/admission) remain owned by the Lead CRM registry
  // (leadWhatsappTemplates.ts) and are intentionally NOT duplicated here.
  def(
    "attendance_present",
    "attendance",
    "Attendance — present",
    "Hi {{parent_name}}, {{student_name}} was marked PRESENT for {{batch_name}} on {{date}}. Thank you."
  ),
  def(
    "holiday_notice",
    "announcement",
    "Holiday notice",
    "Dear {{recipient_name}}, {{branch_name}} will remain closed on {{holiday_date}} for {{holiday_name}}. Regular schedule resumes on {{resume_date}}."
  ),
  def(
    "salary_slip",
    "staff",
    "Salary slip",
    "Hi {{staff_name}}, your salary slip for {{salary_month}} is ready. Net Salary: {{net_salary}}. Download your payslip below.",
    {
      buttons: [{ type: "url", label: "Download Payslip", value: "{{download_url}}" }],
      media: { type: "pdf", url: "{{download_url}}" },
    }
  ),
  def(
    "payroll_approved",
    "staff",
    "Payroll approved",
    "Hi {{staff_name}}, payroll for {{salary_month}} has been approved. Net Salary: {{net_salary}} will be credited to your account on {{pay_date}}."
  ),
  def(
    "task_assigned",
    "general",
    "Task assigned",
    "Hi {{staff_name}}, a new task '{{task_name}}' has been assigned to you by {{assigned_by}}. Due: {{due_date}}.",
    {
      buttons: [{ type: "url", label: "View Task", value: "{{task_url}}" }],
    }
  ),
  def(
    "task_reminder",
    "general",
    "Task reminder",
    "Reminder: task '{{task_name}}' is due on {{due_date}}. Current status: {{status}}. Please update or complete it.",
    {
      buttons: [{ type: "url", label: "Open Task", value: "{{task_url}}" }],
    }
  ),
  def(
    "certificate_ready",
    "general",
    "Certificate ready",
    "Hi {{recipient_name}}, the {{certificate_name}} for {{student_name}} is ready. You can download it using the link below.",
    {
      buttons: [{ type: "url", label: "Download Certificate", value: "{{certificate_url}}" }],
    }
  ),
  def(
    "class_cancelled",
    "announcement",
    "Class cancelled",
    "Notice: the {{subject_name}} class scheduled for {{class_date}} at {{class_time}} has been CANCELLED. A reschedule will be communicated shortly. — Team {{branch_name}}"
  ),
];

export const BUILTIN_TEMPLATES_BY_KEY: Record<string, BuiltinTemplate> =
  BUILTIN_TEMPLATES.reduce(
    (acc, t) => {
      acc[t.key] = t;
      return acc;
    },
    {} as Record<string, BuiltinTemplate>
  );

/** Convert a DB template row OR a builtin into the runtime `CommsTemplate`. */
export function asCommsTemplate(b: BuiltinTemplate, version = 1): CommsTemplate {
  return {
    id: `builtin:${b.key}:${b.language}:${version}`,
    templateKey: b.key,
    version,
    language: b.language,
    category: b.category,
    title: b.title,
    body: b.body,
    variables: b.variables,
    buttons: b.buttons ?? [],
    media: b.media,
    providerName: b.providerName,
    isActive: true,
  };
}

// ── Rendering pipeline ──────────────────────────────────────────────────────
export interface RenderedMessage {
  templateKey: string;
  language: string;
  providerName: string;
  body: string;
  buttons: TemplateButton[];
  media?: TemplateMedia;
  variables: Record<string, string>;
  missing: string[];
}

/**
 * Render a final outgoing message from a template + variable bag. Performs:
 *   - placeholder substitution (body + button values + media url)
 *   - validation (which required vars are still missing)
 *   - normalised `variables` map fed straight to AiSensy payload.
 */
export function renderMessage(
  template: Pick<
    CommsTemplate,
    "templateKey" | "language" | "providerName" | "body" | "buttons" | "media" | "variables"
  >,
  vars: Record<string, string | number | undefined | null>
): RenderedMessage {
  const flat: Record<string, string> = {};
  for (const k of Object.keys(vars)) {
    const v = vars[k];
    flat[k] = v === undefined || v === null ? "" : String(v);
  }
  const buttons = (template.buttons ?? []).map((b) => ({
    ...b,
    value: b.value ? renderBody(b.value, vars) : undefined,
  }));
  const media = template.media
    ? { ...template.media, url: template.media.url ? renderBody(template.media.url, vars) : undefined }
    : undefined;

  return {
    templateKey: template.templateKey,
    language: template.language || "en",
    providerName: template.providerName || template.templateKey,
    body: renderBody(template.body, vars),
    buttons,
    media,
    variables: flat,
    missing: missingVariables(template.variables ?? [], vars),
  };
}

/**
 * Branding helper — preface a body with branch + role chrome the way the
 * customer expects in their inbox.
 */
export function withBranding(body: string, opts: { branchName?: string; signature?: string }): string {
  const sig = opts.signature ?? (opts.branchName ? `— Team ${opts.branchName}` : "");
  return sig ? `${body}\n\n${sig}` : body;
}
