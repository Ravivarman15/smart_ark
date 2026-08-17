// ──────────────────────────────────────────────────────────────────────────────
// ASSISTANT ANALYTICS — aggregate only, reusing the existing pipeline
//
// `marketingService.trackEvent` is already the site's cookieless, first-party,
// consent-free event path. Standing up a second one for the assistant would be
// exactly the duplication the brief forbids, so this is a thin adapter.
//
// ┌── WHAT IS DELIBERATELY NOT SENT ───────────────────────────────────────┐
// │ The visitor's QUESTION. Never, in any event, in any field.             │
// │                                                                         │
// │ It is tempting — "what are people asking?" is the single most useful    │
// │ thing a documentation team could learn. It is also free-text a stranger │
// │ typed into a public box, which means it will eventually contain a phone │
// │ number, a child's name, or a password someone pasted into the wrong     │
// │ window. Storing it makes this feature a personal-data processor and     │
// │ every downstream reader a liability.                                     │
// │                                                                         │
// │ The COVERAGE signal survives without it: `assistant_answer_none` counts │
// │ questions the documentation could not answer, which is the number that  │
// │ actually drives what to write next.                                     │
// └─────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { marketingService } from "@/features/marketing/services/marketing.service";

export type AssistantEvent =
  | "assistant_opened"
  | "assistant_question_submitted"
  | "assistant_documentation_clicked"
  | "assistant_answer_failed"
  | "assistant_no_matching_documentation";

/**
 * Non-identifying dimensions.
 *
 * Typed so a future caller cannot casually add `question` — the field would
 * have to be added here first, in the open, against the comment above.
 */
export interface AssistantEventDetail {
  /** Answer confidence tier. Aggregate quality signal. */
  confidence?: string;
  /** Refusal category, if the assistant declined. Never the text. */
  refused?: string | null;
  /** How many guides were cited. */
  sources?: number;
  /** Which guide was opened — a public documentation slug, not user data. */
  slug?: string;
}

/**
 * Record an assistant event.
 *
 * Fire-and-forget: analytics must never delay an answer or surface an error.
 * The underlying insert already swallows failures.
 */
export const track = (event: AssistantEvent, detail: AssistantEventDetail = {}): void => {
  // The shared pipeline records an event NAME and a path. Rather than widen its
  // schema — a migration, for telemetry — the one dimension worth segmenting on
  // is folded into the name. Everything else in `detail` is intentionally
  // dropped here, which is why the type exists: it documents what callers may
  // pass without implying any of it is stored.
  const suffix =
    event === "assistant_question_submitted" && detail.confidence
      ? `_${detail.confidence}`
      : "";
  void marketingService.trackEvent(`${event}${suffix}`);
};
