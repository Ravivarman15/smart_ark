// ──────────────────────────────────────────────────────────────────────────────
// Communication preference — pure decision helper.
//
// A student/parent's `communication_preference` (WHATSAPP | EMAIL | SMS | BOTH |
// NONE) governs which channels the Communication module may use. This module is
// the single source of truth for that decision so every send path (campaigns,
// automation, reminders) can respect it consistently and LOG a skip reason.
//
// Pure + unit-tested — no I/O. Unknown / empty preference = allow all (the
// preference is optional and must never silently block legacy students).
// ──────────────────────────────────────────────────────────────────────────────

export type Channel = "whatsapp" | "email" | "sms";

export type CommunicationPreference = "WHATSAPP" | "EMAIL" | "SMS" | "BOTH" | "NONE";

/** Channels permitted by a preference. Unknown/empty → all channels allowed. */
export function channelsForPreference(pref?: string | null): Channel[] {
  switch ((pref ?? "").toUpperCase()) {
    case "WHATSAPP":
      return ["whatsapp"];
    case "EMAIL":
      return ["email"];
    case "SMS":
      return ["sms"];
    case "BOTH":
      return ["whatsapp", "email"];
    case "NONE":
      return [];
    default:
      return ["whatsapp", "email", "sms"]; // not set — no restriction
  }
}

export interface ChannelDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether a given channel may be used for a recipient, with a
 * human-readable reason when it is blocked (for the skip log / audit).
 */
export function decideChannel(channel: Channel, pref?: string | null): ChannelDecision {
  const allowedChannels = channelsForPreference(pref);
  if (allowedChannels.length === 0) {
    return { allowed: false, reason: `Communication preference is NONE — ${channel} skipped` };
  }
  if (!allowedChannels.includes(channel)) {
    return {
      allowed: false,
      reason: `Preference is ${(pref ?? "").toUpperCase()} — ${channel} not permitted`,
    };
  }
  return { allowed: true };
}

export interface PrefAware {
  communicationPreference?: string | null;
}

export interface PartitionResult<T> {
  send: T[];
  skipped: { item: T; reason: string }[];
}

/**
 * Split recipients into those that may receive `channel` and those skipped by
 * their preference (with a reason). Reusable by any send path.
 */
export function partitionByPreference<T extends PrefAware>(
  recipients: T[],
  channel: Channel
): PartitionResult<T> {
  const send: T[] = [];
  const skipped: { item: T; reason: string }[] = [];
  for (const r of recipients) {
    const d = decideChannel(channel, r.communicationPreference);
    if (d.allowed) send.push(r);
    else skipped.push({ item: r, reason: d.reason ?? "blocked by preference" });
  }
  return { send, skipped };
}
