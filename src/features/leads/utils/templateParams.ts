// ──────────────────────────────────────────────────────────────────────────────
// Central AiSensy / Meta Utility Template parameter ordering.
//
// Meta utility templates take POSITIONAL params ({{1}}, {{2}}, …). The queue
// drainer (send-aisensy) must post `templateParams` in the exact order the Meta
// template declares them — previously it sent the whole rendered body as a single
// {{1}} param, which breaks any multi-variable template.
//
// `buildTemplateParams(templateName, payload)` maps the message_queue payload
// (the resolved variable map, keyed by name) to the ordered positional array for
// each known template. Unknown / single-param templates fall back to the legacy
// single rendered-body param so existing templates keep working.
//
// ⚠️  KEEP IN LOCKSTEP with the mirrored copy in
//     supabase/functions/send-aisensy/index.ts (Deno cannot import from src/).
// ──────────────────────────────────────────────────────────────────────────────

export type TemplateParamPayload = Record<string, unknown>;

/** First non-empty value among the candidate keys (handles key aliases). */
const val = (p: TemplateParamPayload, ...keys: string[]): string => {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};

/** Ordered positional param builders, one per Meta template. */
const SPECS: Record<string, (p: TemplateParamPayload) => string[]> = {
  // {{1}} student_name, {{2}} course_name
  lead_welcome: (p) => [val(p, "student_name"), val(p, "course_name", "course")],
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name, {{4}} mobile_number
  lead_assigned_counselor: (p) => [
    val(p, "counselor_name"),
    val(p, "student_name"),
    val(p, "course_name", "course"),
    val(p, "mobile_number", "mobile", "phone"),
  ],
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  lead_followup_reminder: (p) => [
    val(p, "counselor_name"),
    val(p, "student_name"),
    val(p, "course_name", "course"),
  ],
  // {{1}} counselor_name, {{2}} student_name, {{3}} course_name
  sla_breach_alert: (p) => [
    val(p, "counselor_name"),
    val(p, "student_name"),
    val(p, "course_name", "course"),
  ],
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time, {{5}} faculty_name
  lead_demo_scheduled_v2: (p) => [
    val(p, "student_name"),
    val(p, "course_name", "course"),
    val(p, "demo_date"),
    val(p, "demo_time"),
    val(p, "faculty_name", "faculty"),
  ],
  // {{1}} parent_name, {{2}} student_name, {{3}} course_name  (order is FINAL)
  lead_admission_completed_v2: (p) => [
    val(p, "parent_name"),
    val(p, "student_name"),
    val(p, "course_name", "course"),
  ],
  // {{1}} student_name, {{2}} course_name, {{3}} demo_date, {{4}} demo_time
  lead_demo_reminder_v2: (p) => [
    val(p, "student_name"),
    val(p, "course_name", "course"),
    val(p, "demo_date"),
    val(p, "demo_time"),
  ],
  // Enterprise Fee Receipt utility template.
  // {{1}} parent_name, {{2}} student_name, {{3}} class, {{4}} receipt_no,
  // {{5}} amount_paid, {{6}} pending_balance
  fee_receipt: (p) => [
    val(p, "parent_name"),
    val(p, "student_name"),
    val(p, "class", "batch_name"),
    val(p, "receipt_no"),
    val(p, "amount_paid", "amount"),
    val(p, "pending_balance", "amount_pending"),
  ],
  // ── Staff credentials utility template ─────────────────────────────────────
  // Enqueued on staff account creation / welcome resend / password reset
  // (staffCredentials.service) and by the gated Send Staff Credentials page.
  // {{1}} staff_name, {{2}} role, {{3}} login_email, {{4}} password,
  // {{5}} login_url
  //
  // The credential send page composes with a login-PROVEN `username` rather
  // than the profile email, hence the alias on {{3}}: whichever field the call
  // site holds, the parameter it lands in is the same.
  staff_credentials: (p) => [
    val(p, "staff_name"),
    val(p, "role", "designation"),
    val(p, "login_email", "username", "email"),
    val(p, "password"),
    val(p, "login_url"),
  ],
  // ── Parent Portal credentials utility template ─────────────────────────────
  // Enqueued by parentCredentials.service on provisioning / reset / resend.
  // {{1}} parent_name, {{2}} student_name, {{3}} login_email, {{4}} password,
  // {{5}} login_url
  //
  // `username` is accepted as an alias for {{3}} because the older credential
  // templates (staff_credentials / student_credentials) name that field
  // `username`; a queue row written by either shape must still line up.
  parent_credentials: (p) => [
    val(p, "parent_name"),
    val(p, "student_name"),
    val(p, "login_email", "username"),
    val(p, "password"),
    val(p, "login_url"),
  ],
  // ── Enterprise Attendance utility templates ────────────────────────────────
  // Sent SYNCHRONOUSLY on Submit Attendance (attendanceWhatsapp.service), never
  // queued. The service builds the params here and posts them straight to the
  // send-aisensy `direct` endpoint.
  // {{1}} parent_name, {{2}} student_name, {{3}} class, {{4}} section, {{5}} attendance_date
  attendance_absent: (p) => [
    val(p, "parent_name"),
    val(p, "student_name"),
    val(p, "class", "class_name", "batch_name"),
    val(p, "section"),
    val(p, "attendance_date", "date"),
  ],
  // {{1}} parent_name, {{2}} student_name, {{3}} attendance_date
  attendance_corrected: (p) => [
    val(p, "parent_name"),
    val(p, "student_name"),
    val(p, "attendance_date", "date"),
  ],
};

/** Templates that use ordered positional params (vs the single-body fallback). */
export const POSITIONAL_TEMPLATES = Object.keys(SPECS);

/**
 * Build the ordered `templateParams` array AiSensy expects for a template.
 * Falls back to the single fully-rendered body (`__body`) for templates without
 * a positional spec (e.g. sla_breach_alert, lead_unassigned_alert).
 */
export function buildTemplateParams(
  templateName: string,
  payload: TemplateParamPayload = {},
): string[] {
  const spec = SPECS[templateName];
  if (spec) return spec(payload);
  const body = payload["__body"];
  return body !== undefined && body !== null ? [String(body)] : [];
}
