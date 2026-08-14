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
    // REJECTED BY META, then rewritten. The original body was
    //   Dear {{1}} … Your {{6}} staff portal account … {{2}}{{3}}{{4}}{{5}} … {{6}}
    // which broke two Meta rules at once: {{6}} appeared TWICE, and the
    // parameters ran 1, 6, 2, 3, 4, 5, 6 — not ascending.
    //
    // Fixed by naming the organization ONLY in the sign-off. Every parameter
    // now appears exactly once, in sequence, and org_name stays in the last
    // position so the append-only ordering rule still holds.
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
    // REJECTED BY META, then rewritten — the same two violations as
    // smartark_staff_credentials: {{6}} used twice, parameters out of order.
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
  //
  // ┌── WHY THE LEAD FUNNEL LOOKED HEALTHY AND WAS NOT ──────────────────────┐
  // │ lead_welcome has delivered 17 messages. lead_assigned_counselor, 14.   │
  // │ Nothing errors, so the funnel reads as working — and for ARK it is.    │
  // │                                                                        │
  // │ But every one of those campaigns takes positional parameters that DO   │
  // │ NOT INCLUDE the organization. lead_welcome posts exactly two:          │
  // │ student_name and course_name. The institution's name is not a          │
  // │ parameter, so it is STATIC TEXT inside the approved Meta body — and    │
  // │ that text is ARK's.                                                    │
  // │                                                                        │
  // │ The local bodies in leadWhatsappTemplates.ts do contain {{org_name}},  │
  // │ which is what makes this so easy to miss: the previews are right, the  │
  // │ audit rows are right, the rendered `__body` stored in message_queue is │
  // │ right. Only the thing WhatsApp actually delivers is wrong.             │
  // │                                                                        │
  // │ The moment a second institution runs an enquiry campaign, every        │
  // │ prospect who fills in their form is thanked by a different company.    │
  // │ abc-academi has sent zero lead messages, so this has not happened yet. │
  // └────────────────────────────────────────────────────────────────────────┘
  //
  // Each body below copies the shape Meta ALREADY APPROVED for
  // smartark_attendance_absent: opens on static text, runs {{1}}…{{n}} in
  // ascending order with each parameter used exactly once, and names the
  // organization only in the sign-off. That shape is the one piece of evidence
  // we have about what this Meta reviewer accepts, so it is not varied.
  //
  // They are also written to STAY in UTILITY. The rejected credential templates
  // proved that Meta recategorises on content, not on the box you tick, so
  // every body here reports a fact about a transaction the recipient already
  // initiated. No "welcome", no "we look forward to", no exclamation marks, no
  // URLs, no emoji — the wording of the current lead_demo_scheduled_v2 ("We
  // look forward to seeing you at …!") is exactly the register that gets a
  // UTILITY template reclassified as MARKETING and then rejected.
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
      "Thank you,\n{{3}}",
    status: "READY_FOR_SUBMISSION",
    note:
      "Replaces the ARK-branded `lead_welcome`, which delivers to every tenant's " +
      "enquirers with ARK's name as static text. Highest-priority of the lead " +
      "family: it is the only one a prospect sees, and it fires on the PUBLIC " +
      "enquiry form, so a wrong institution name goes to someone who has never " +
      "heard of us.",
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
      "Thank you,\n{{5}}",
    status: "READY_FOR_SUBMISSION",
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
      "Thank you,\n{{4}}",
    status: "READY_FOR_SUBMISSION",
  },
  {
    key: "sla_breach_alert",
    eventKey: "lead_sla_breach",
    legacyCampaign: "sla_breach_alert",
    campaign: "smartark_lead_sla_breach",
    category: "UTILITY",
    params: ["counselor_name", "student_name", "course_name", "org_name"],
    // The legacy body shouts "SLA BREACH" on its own line. Kept as plain
    // reporting here: an all-caps alarm word is a recategorisation risk for no
    // gain, and the recipient is a staff member who already knows what the
    // message is for.
    body:
      "Dear {{1}},\n\n" +
      "The enquiry from {{2}} for {{3}} has passed its agreed response time.\n\n" +
      "Please contact them at the earliest and record the outcome against the enquiry.\n\n" +
      "Thank you,\n{{4}}",
    status: "READY_FOR_SUBMISSION",
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
      "Thank you,\n{{6}}",
    status: "READY_FOR_SUBMISSION",
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
      "Thank you,\n{{5}}",
    status: "READY_FOR_SUBMISSION",
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
      "Thank you,\n{{4}}",
    status: "READY_FOR_SUBMISSION",
    note:
      "The legacy body names the organization TWICE — mid-sentence and in the " +
      "sign-off. That is the exact fault Meta rejected both credential templates " +
      "for, so the replacement names it only once, in the sign-off.",
  },
];

export const PROVIDER_TEMPLATES_BY_KEY: Record<string, ProviderTemplate> =
  PROVIDER_TEMPLATES.reduce((acc, t) => {
    acc[t.key] = t;
    return acc;
  }, {} as Record<string, ProviderTemplate>);

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
