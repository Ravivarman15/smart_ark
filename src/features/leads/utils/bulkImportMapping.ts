// Pure helpers for the Bulk Lead Import engine — column auto-detection, mobile
// normalisation/validation, and course fuzzy-matching against lead_courses.
// No I/O so it is fully unit-tested and safe to run inside a Web Worker.

import type { CanonicalField, ColumnMapping } from "../types/bulkImport.types";

// ── Column aliases ──────────────────────────────────────────────────────────
// Header text is normalised (lowercased, non-alphanumerics → single space) then
// compared to these aliases by exact-match first, then substring containment.
const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  student_name: ["student name", "student", "name", "candidate", "full name", "fullname", "child name"],
  parent_name:  ["parent name", "parent", "father name", "mother name", "guardian", "guardian name", "father", "mother"],
  mobile:       ["mobile", "mobile number", "mobile no", "phone", "phone number", "phone no", "whatsapp", "whatsapp number", "contact", "contact number", "contact no", "number"],
  class:        ["class", "grade", "standard", "std", "class grade", "studying in"],
  school:       ["school", "school name", "institution", "current school", "previous school"],
  board:        ["board", "syllabus", "curriculum"],
  course:       ["course", "interested course", "course of interest", "program", "programme", "stream", "subject"],
  source:       ["source", "lead source", "channel", "utm source", "enquiry source"],
};

const CANONICAL_FIELDS = Object.keys(FIELD_ALIASES) as CanonicalField[];

/** Lowercase, trim, collapse any run of non-alphanumerics to a single space. */
export function normalizeHeader(h: string | null | undefined): string {
  return (h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Auto-detect which uploaded column feeds each canonical field. Exact alias
 * matches win; otherwise the first header that contains (or is contained by) an
 * alias is used. Each source header is claimed by at most one field.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  const taken = new Set<string>();
  const mapping: ColumnMapping = {};

  const claim = (field: CanonicalField, predicate: (n: string, alias: string) => boolean) => {
    if (mapping[field]) return;
    for (const alias of FIELD_ALIASES[field]) {
      const hit = norm.find((h) => !taken.has(h.raw) && h.n.length > 0 && predicate(h.n, alias));
      if (hit) {
        mapping[field] = hit.raw;
        taken.add(hit.raw);
        return;
      }
    }
  };

  // Pass 1 — exact alias equality (most reliable).
  for (const field of CANONICAL_FIELDS) claim(field, (n, alias) => n === alias);
  // Pass 2 — containment either direction (handles "Student Mobile No.", etc.).
  for (const field of CANONICAL_FIELDS) claim(field, (n, alias) => n.includes(alias) || alias.includes(n));

  return mapping;
}

/**
 * Normalise an Indian mobile to 10 digits. Strips spaces/punctuation, a leading
 * +91 / 91 / 0, and validates a 10-digit number starting 6–9. Returns null when
 * the value can't be a valid mobile.
 */
export function normalizeMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return d;
}

/**
 * Fuzzy-match a raw course string to a known lead_courses name. "NEET Crash
 * Course" → "NEET". Returns the canonical course name when a known course token
 * appears in (or equals) the value; otherwise the trimmed original (so the
 * course is still recorded even if it doesn't map to a routing rule).
 */
export function matchCourse(
  raw: string | null | undefined,
  courses: string[],
): string | undefined {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  const lower = value.toLowerCase();
  // Longest course name first so "Foundation NEET" prefers the more specific.
  const sorted = [...courses].sort((a, b) => b.length - a.length);
  for (const course of sorted) {
    const c = course.toLowerCase();
    if (!c) continue;
    if (lower === c || lower.includes(c) || c.includes(lower)) return course;
  }
  return value;
}
