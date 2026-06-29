// ──────────────────────────────────────────────────────────────────────────────
// IMPORT DATA CLEANING
//
// Institution exports are messy: phones with country codes / spaces / dashes,
// names in ALL CAPS or with doubled spaces, stray whitespace, mixed date
// formats. These pure helpers normalise a raw cell value before it is stored —
// they never reject a value, only tidy it. Cleaning runs at parse time so the
// committed student record is already clean and the duplicate engine compares
// like-with-like.
// ──────────────────────────────────────────────────────────────────────────────

/** Collapse runs of whitespace and trim. "  a   b " → "a b". */
export const cleanText = (v: string): string => v.replace(/\s+/g, " ").trim();

/**
 * Phone → digits only (keeps a leading country code if present).
 * "+91 98765-43210" → "919876543210", "098765 43210" → "09876543210".
 * Returns "" for a value with no digits.
 */
export const cleanPhone = (v: string): string => v.replace(/\D/g, "");

/**
 * Title-case a name, collapsing whitespace. "john  DOE" → "John Doe".
 * Particles after a hyphen / apostrophe are capitalised too ("o'brien" →
 * "O'Brien", "jean-paul" → "Jean-Paul"). Leaves digits/initials intact.
 */
export const cleanName = (v: string): string =>
  cleanText(v)
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/** Lower-cased, trimmed email. "  Foo@Bar.COM " → "foo@bar.com". */
export const cleanEmail = (v: string): string => cleanText(v).toLowerCase();

/**
 * Normalise a date to YYYY-MM-DD. Accepts ISO and day-first d/m/y (Indian
 * export convention), auto-swapping when the day field is clearly > 12. Anything
 * unparseable is returned trimmed but untouched (validation flags it later).
 */
export function cleanDate(value: string): string {
  const v = value.trim();
  if (!v) return v;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parts = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    let day = Number(parts[1]);
    let month = Number(parts[2]);
    let year = Number(parts[3]);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return v;
}

/** How each student field should be cleaned. Unlisted fields → cleanText. */
type Cleaner = (v: string) => string;
const FIELD_CLEANERS: Record<string, Cleaner> = {
  name: cleanName,
  parentName: cleanName,
  motherName: cleanName,
  guardianName: cleanName,
  studentContact: cleanPhone,
  parentContact: cleanPhone,
  parentContact2: cleanPhone,
  motherContact: cleanPhone,
  guardianContact: cleanPhone,
  studentEmail: cleanEmail,
  parentEmail: cleanEmail,
  motherEmail: cleanEmail,
  dateOfBirth: cleanDate,
  dateOfJoining: cleanDate,
  courseExpiryDate: cleanDate,
};

/** Clean a raw cell for a given student field. */
export const cleanFieldValue = (field: string, value: string): string =>
  (FIELD_CLEANERS[field] ?? cleanText)(value);
