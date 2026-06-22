// ──────────────────────────────────────────────────────────────────────────────
// WhatsApp phone normalisation for the Lead CRM automation funnel.
//
// AiSensy's Campaign API expects a bare MSISDN with the country code and NO "+"
// prefix (e.g. `917305801869`). This is the SINGLE place that turns whatever a
// staff member typed (`+91…`, `0…`, spaced, hyphenated, `(91) …`) into that
// canonical form — or rejects it with an actionable reason so the caller can
// record a visible `status='skipped'` row instead of silently dropping the
// WhatsApp alert (the exact gap that made `lead_assigned_counselor` look like it
// "won't send").  Pure: no React, no Supabase.
// ──────────────────────────────────────────────────────────────────────────────

export interface EnsuredPhone {
  /** Canonical `91XXXXXXXXXX` (digits, country code, no "+"), or null when unusable. */
  phone: string | null;
  /** Human, actionable reason when `phone` is null; null when ok. */
  reason: string | null;
}

/**
 * Normalise a WhatsApp number for AiSensy, or reject it.
 *   - `9876543210`        → `919876543210`  (bare 10-digit Indian mobile)
 *   - `09876543210`       → `919876543210`  (leading STD 0)
 *   - `+91 98765 43210`   → `919876543210`  (E.164 with separators)
 *   - `919876543210`      → `919876543210`  (already canonical)
 * Rejects: NULL, empty, or fewer than 10 digits.
 */
export const ensureWhatsappPhone = (raw?: string | null): EnsuredPhone => {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return { phone: null, reason: "Phone number missing" };

  let withCC: string;
  if (digits.length === 10) {
    withCC = "91" + digits; // bare 10-digit Indian mobile
  } else if (digits.startsWith("0") && digits.length === 11) {
    withCC = "91" + digits.slice(1); // 0XXXXXXXXXX
  } else if (digits.length >= 11 && digits.length <= 15) {
    withCC = digits; // already has a country code (91XXXXXXXXXX or other E.164)
  } else {
    // Fewer than 10 digits (or an implausibly long string) → not usable.
    return { phone: null, reason: `Invalid phone number "${raw}"` };
  }

  return { phone: withCC, reason: null };
};

/** Convenience boolean — true when `raw` yields a usable WhatsApp number. */
export const isWhatsappPhone = (raw?: string | null): boolean =>
  ensureWhatsappPhone(raw).phone !== null;
