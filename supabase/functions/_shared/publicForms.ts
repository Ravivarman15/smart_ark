// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC FORM REGISTRY — one pipeline, many form types.
//
// ┌── WHY ONE REGISTRY ────────────────────────────────────────────────────┐
// │ Four forms (demo, contact, career, general) do not need four intake    │
// │ endpoints, four notification paths and four sets of templates. They    │
// │ need one event — PUBLIC_FORM_SUBMITTED — carrying a `form_type` and a  │
// │ structured payload, with the renderer selecting wording from this      │
// │ table. Adding a fifth form is a row here, not a code path.             │
// └────────────────────────────────────────────────────────────────────────┘
//
// Deliberately free of I/O and of any provider import, so both the edge
// function and the browser-side test suite can read the same definitions.
// ──────────────────────────────────────────────────────────────────────────────

export type FormType = "demo" | "contact" | "career" | "general_enquiry";

export const FORM_TYPES: FormType[] = ["demo", "contact", "career", "general_enquiry"];

export interface FormTypeDef {
  formType: FormType;
  /** Human wording used in subjects and bodies. Never a tenant's name. */
  label: string;
  /** Where the submission itself is stored. Both tables already existed. */
  table: "platform_demo_requests" | "platform_enquiries";
  /** `platform_enquiries.kind` for the shared table; null for demo. */
  kind: string | null;
  /**
   * Fields this form ACTUALLY collects. The renderer emits nothing else, which
   * is what stops a contact-form alert claiming a demo date the visitor was
   * never asked for.
   */
  fields: string[];
  /** Wording for the visitor's own confirmation. */
  confirmation: string;
  /** WhatsApp campaign for the admin alert. */
  adminCampaign: string;
  /** WhatsApp campaign for the visitor confirmation. */
  submitterCampaign: string;
}

/**
 * The canonical field set.
 *
 * `demo` collects scheduling preferences; the others do not. This is read from
 * the actual form components in src/features/marketing/pages/ContentPages.tsx,
 * not assumed — a variable listed here that the form does not collect would
 * render as an empty parameter, which Meta rejects.
 */
export const FORM_TYPE_DEFS: Record<FormType, FormTypeDef> = {
  demo: {
    formType: "demo",
    label: "Demo request",
    table: "platform_demo_requests",
    kind: null,
    fields: [
      "name", "email", "phone", "organization_name", "institution_type",
      "student_count", "preferred_date", "preferred_time", "message",
    ],
    confirmation:
      "We have received your demo request. Our team will review your details and " +
      "confirm a slot with you.",
    adminCampaign: "smartark_platform_lead_alert",
    submitterCampaign: "smartark_public_form_ack",
  },
  contact: {
    formType: "contact",
    label: "Contact enquiry",
    table: "platform_enquiries",
    kind: "contact",
    fields: ["name", "email", "phone", "subject", "message"],
    confirmation:
      "We have received your enquiry. Our team will review it and get back to you.",
    adminCampaign: "smartark_platform_lead_alert",
    submitterCampaign: "smartark_public_form_ack",
  },
  career: {
    formType: "career",
    label: "Career application",
    table: "platform_enquiries",
    kind: "careers",
    fields: ["name", "email", "phone", "subject", "message"],
    confirmation:
      "We have received your application. If your background fits something we are " +
      "working on, we will be in touch.",
    adminCampaign: "smartark_platform_lead_alert",
    submitterCampaign: "smartark_public_form_ack",
  },
  general_enquiry: {
    formType: "general_enquiry",
    label: "General enquiry",
    table: "platform_enquiries",
    kind: "general",
    fields: ["name", "email", "phone", "subject", "message"],
    confirmation:
      "We have received your enquiry. Our team will review it and get back to you.",
    adminCampaign: "smartark_platform_lead_alert",
    submitterCampaign: "smartark_public_form_ack",
  },
};

/** Human labels for the fields, used in the admin email. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  organization_name: "Organization / Institution",
  institution_type: "Institution type",
  student_count: "Student count",
  preferred_date: "Preferred date",
  preferred_time: "Preferred time",
  subject: "Subject",
  message: "Message",
  source: "Source",
};

// ── Validation ──────────────────────────────────────────────────────────────
//
// Every limit below exists because the endpoint is UNAUTHENTICATED. A public
// form is the one door in the building with no lock, so what comes through it
// is bounded before it reaches a database, an email body or a provider.

/** Hard ceiling on the whole JSON payload. */
export const MAX_PAYLOAD_BYTES = 16 * 1024;

export const FIELD_LIMITS: Record<string, number> = {
  name: 120,
  email: 254,          // RFC 5321 maximum
  phone: 24,
  organization_name: 160,
  institution_type: 60,
  student_count: 40,
  preferred_date: 10,  // yyyy-mm-dd
  preferred_time: 5,   // HH:MM
  subject: 200,
  message: 4000,
};

/**
 * Email validation.
 *
 * The control-character clause is not decoration: `\r` or `\n` inside an
 * address is how a header-injection attack adds a Bcc, and this string reaches
 * an email API. Rejecting them here is cheaper and more certain than escaping
 * them later.
 */
export function isValidEmail(raw: string): boolean {
  const v = String(raw ?? "").trim();
  if (!v || v.length > FIELD_LIMITS.email) return false;
  if (/[\r\n\t\0]/.test(v)) return false;
  return /^[^\s@<>();,]+@[^\s@<>();,]+\.[A-Za-z]{2,}$/.test(v);
}

/**
 * Normalise a mobile to the digits a provider will accept, or null.
 *
 * Returns null rather than a best guess for anything that is not plausibly a
 * mobile number: an unsendable number burns a provider call and lands in the
 * ledger as a failure that reads like an outage.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // 10-digit Indian mobile → prefix the country code.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  // Anything else plausible as an international number passes through.
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/**
 * Strip anything that could change the MEANING of a rendered message.
 *
 * Applied to every free-text field before it is stored or rendered:
 *   · control characters — header injection into the email API
 *   · angle brackets — HTML injection into the email body
 *   · braces — WhatsApp parameter injection; a visitor typing `{{2}}` into the
 *     message field must not be able to reach the provider's substitution.
 */
export function sanitizeText(raw: unknown, limit: number): string {
  return String(raw ?? "")
    .split("").map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("")
    .replace(/[<>]/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/** Missing values are omitted or shown as this — never "undefined" or "null". */
export const NOT_PROVIDED = "Not provided";

/**
 * Present a value for a human.
 *
 * The three strings this exists to prevent — "undefined", "null" and
 * "[object Object]" — are all things that reach a customer's inbox when a
 * renderer interpolates a raw value, and all three make the sender look
 * broken.
 */
export function present(v: unknown): string {
  if (v === null || v === undefined) return NOT_PROVIDED;
  if (typeof v === "object") return NOT_PROVIDED;
  const s = String(v).trim();
  return s === "" || s === "undefined" || s === "null" ? NOT_PROVIDED : s;
}

/** The fields a form actually collected, in registry order, non-empty only. */
export function collectedFields(
  formType: FormType,
  data: Record<string, unknown>,
): Array<{ key: string; label: string; value: string }> {
  const def = FORM_TYPE_DEFS[formType];
  const out: Array<{ key: string; label: string; value: string }> = [];
  for (const key of def.fields) {
    const raw = data[key];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    out.push({ key, label: FIELD_LABELS[key] ?? key, value: present(raw) });
  }
  return out;
}
