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
import { campaignVerdict } from "../constants/providerCampaigns";

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
  /**
   * The AiSensy campaign this row will post to, already resolved through the
   * provider lifecycle. Optional so non-WhatsApp callers need not supply it.
   */
  campaign?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  /** Machine code for the first failing rule. */
  code?: "no_phone" | "bad_phone" | "missing_vars" | "empty_body" | "dead_campaign";
  /** Human, actionable reason — surfaced to the operator. */
  reason?: string;
}

/**
 * Validate a single message before it is queued.
 *   - whatsapp/sms require a valid recipient phone (in_app does not)
 *   - the campaign must not be one the provider has already refused
 *   - every required template variable must be resolved (no broken placeholders)
 *   - the rendered body must be non-empty
 */
export const validateEnqueue = (input: EnqueueValidationInput): ValidationResult => {
  const channel = input.channel ?? "whatsapp";
  const needsPhone = channel === "whatsapp" || channel === "sms";

  // ── The campaign has to exist ───────────────────────────────────────────
  //
  // ┌── WHY THIS BELONGS IN THE PRE-QUEUE GATE ──────────────────────────┐
  // │ This module's contract is "nothing should ever report queued for a │
  // │ message that would fail at the provider". A campaign AiSensy has   │
  // │ already answered "Campaign does not exist" for fails at the        │
  // │ provider every single time, so it belongs here with the bad phone  │
  // │ numbers and the empty bodies.                                      │
  // │                                                                    │
  // │ Without it, `staff_credentials` produced a row that read `queued`  │
  // │ in the UI, sat until the drainer picked it up, burned a provider   │
  // │ call, and settled at `failed` with the provider's terse 400 in a   │
  // │ column nobody opens. Six times. Refusing up front turns that into  │
  // │ one visible, explained skip at the moment a human is looking at    │
  // │ the screen — and does not pretend the credential went out.         │
  // └────────────────────────────────────────────────────────────────────┘
  if (needsPhone && input.campaign) {
    const verdict = campaignVerdict(input.campaign);
    if (!verdict.sendable) {
      return {
        ok: false,
        code: "dead_campaign",
        reason: `${input.recipient.name ?? "Recipient"}: ${verdict.blockedReason}`,
      };
    }
  }

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
