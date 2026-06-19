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
  // {{1}} student_name, {{2}} course_name
  demo_scheduled: (p) => [val(p, "student_name"), val(p, "course_name", "course")],
  // {{1}} student_name, {{2}} course_name
  admission_completed: (p) => [val(p, "student_name"), val(p, "course_name", "course")],
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
