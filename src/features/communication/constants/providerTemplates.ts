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
    status: "READY_FOR_SUBMISSION",
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
    status: "READY_FOR_SUBMISSION",
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
    status: "READY_FOR_SUBMISSION",
    note: "Credential value is supplied at trigger time and never persisted — see Phase C2.",
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
    status: "READY_FOR_SUBMISSION",
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
    status: "READY_FOR_SUBMISSION",
    note:
      "fee_paid executes through feeReceiptDelivery.service — a LEGACY WORKING FLOW that is " +
      "deliberately not migrated. This entry exists so the campaign can be approved ahead of " +
      "any future migration; activating it does NOT change the fee receipt execution path.",
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
export function resolveCampaign(templateKey: string): {
  campaign: string;
  isMultiTenant: boolean;
  status: ProviderTemplateStatus;
} | null {
  const t = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  if (!t) return null;
  const active = t.status === SENDABLE_STATUS;
  return {
    campaign: active ? t.campaign : t.legacyCampaign,
    isMultiTenant: active,
    status: t.status,
  };
}

/** True when this template still sends one tenant's branding to every tenant. */
export function isBrandingLeaked(templateKey: string): boolean {
  const t = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  return !!t && t.status !== SENDABLE_STATUS;
}
