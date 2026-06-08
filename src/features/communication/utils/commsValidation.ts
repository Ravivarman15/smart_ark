// ──────────────────────────────────────────────────────────────────────────────
// Communication validation — PURE, no React / no Supabase.
//
// The single gate every outbound message passes through BEFORE it is written to
// the queue. Nothing should ever report "sent"/"queued" for a message that would
// fail at the provider. Used by aisensyService.enqueue/enqueueBulk and unit-
// tested directly.
// ──────────────────────────────────────────────────────────────────────────────

import type { RenderedMessage } from "./whatsappTemplates";
import type { CommsChannel, RecipientKind } from "../types/communication.types";

/**
 * Normalise an Indian/E.164 phone to `+<digits>` (AiSensy requires the + prefix).
 * Mirrors src/lib/aisensyApi.normalisePhone but kept dependency-free so this
 * module never pulls the Supabase client into a unit test.
 */
export const normalizePhone = (phone: string): string => {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  let withCC: string;
  if (digits.length === 10) withCC = "91" + digits;
  else if (digits.startsWith("0") && digits.length === 11) withCC = "91" + digits.slice(1);
  else withCC = digits;
  return withCC ? "+" + withCC : "";
};

/** A phone is valid if, once normalised, it is a plausible E.164 number. */
export const isValidPhone = (phone?: string | null): boolean => {
  if (!phone) return false;
  const norm = normalizePhone(phone);
  const digits = norm.replace(/[^0-9]/g, "");
  // E.164 allows up to 15 digits; require a country code + subscriber number.
  return digits.length >= 11 && digits.length <= 15;
};

// ── Enqueue validation ────────────────────────────────────────────────────────
export interface EnqueueValidationInput {
  channel?: CommsChannel;
  rendered: Pick<RenderedMessage, "body" | "missing">;
  recipient: { kind?: RecipientKind; name?: string; phone?: string };
}

export interface ValidationResult {
  ok: boolean;
  /** Machine code for the first failing rule. */
  code?: "no_phone" | "bad_phone" | "missing_vars" | "empty_body";
  /** Human, actionable reason — surfaced to the operator. */
  reason?: string;
}

/**
 * Validate a single message before it is queued.
 *   - whatsapp/sms require a valid recipient phone (in_app does not)
 *   - every required template variable must be resolved (no broken placeholders)
 *   - the rendered body must be non-empty
 */
export const validateEnqueue = (input: EnqueueValidationInput): ValidationResult => {
  const channel = input.channel ?? "whatsapp";
  const needsPhone = channel === "whatsapp" || channel === "sms";

  if (needsPhone) {
    if (!input.recipient.phone) {
      return { ok: false, code: "no_phone", reason: `${input.recipient.name ?? "Recipient"}: no phone number on file` };
    }
    if (!isValidPhone(input.recipient.phone)) {
      return { ok: false, code: "bad_phone", reason: `${input.recipient.name ?? "Recipient"}: invalid phone "${input.recipient.phone}"` };
    }
  }

  if (input.rendered.missing && input.rendered.missing.length > 0) {
    return {
      ok: false,
      code: "missing_vars",
      reason: `${input.recipient.name ?? "Recipient"}: unresolved template variable(s): ${input.rendered.missing.join(", ")}`,
    };
  }

  if (!input.rendered.body || input.rendered.body.trim() === "") {
    return { ok: false, code: "empty_body", reason: `${input.recipient.name ?? "Recipient"}: empty message body` };
  }

  return { ok: true };
};

// ── De-duplication ────────────────────────────────────────────────────────────
/**
 * Stable key identifying "the same message to the same person for the same
 * reason" — so a re-run (fee reminder / birthday / absent alert) does not double
 * send. Phone is normalised so format differences don't defeat the key.
 */
export const dedupeKey = (parts: {
  templateKey: string;
  phone?: string;
  contextType?: string;
  contextId?: string;
}): string =>
  [
    parts.templateKey,
    normalizePhone(parts.phone ?? ""),
    parts.contextType ?? "",
    parts.contextId ?? "",
  ].join("|");

/** Drop later duplicates within a batch, keeping the first occurrence. */
export const dropDuplicates = <T>(items: T[], keyOf: (item: T) => string): { unique: T[]; dropped: number } => {
  const seen = new Set<string>();
  const unique: T[] = [];
  let dropped = 0;
  for (const item of items) {
    const k = keyOf(item);
    if (seen.has(k)) {
      dropped += 1;
      continue;
    }
    seen.add(k);
    unique.push(item);
  }
  return { unique, dropped };
};
