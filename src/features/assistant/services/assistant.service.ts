// ──────────────────────────────────────────────────────────────────────────────
// ASSISTANT SERVICE — local-first, network-optional
//
// The answer is computed IN THE BROWSER, synchronously, from the documentation
// bundled with the app. That is not a fallback path; it is the product:
//
//   • instant — no round trip, no spinner, no cold start
//   • free — a public assistant that costs per question is a denial-of-wallet
//     target, and Phase 19 exists because of it
//   • private — a visitor's question never leaves their machine unless a
//     deployment has explicitly switched refinement on
//   • honest — it cannot invent a feature, because it cannot generate prose
//
// The network is used for ONE thing: asking a configured model to rephrase the
// summary so it reads as a reply to the question rather than an article's
// opening line. If that call is not configured, is rate limited, times out, or
// comes back ungrounded, the local answer is what the visitor already has.
// Nothing is blocked on it.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { ask, type AskOptions } from "../engine/ask";
import { isGrounded } from "../engine/refine";
import type { AssistantAnswer, VisitorRole } from "../engine/types";

/** How long to wait for refinement before showing the local answer as final. */
const REFINE_TIMEOUT_MS = 6000;

export interface AskRequest {
  question: string;
  role?: VisitorRole | null;
  /** Recent turns, for pronoun resolution ("and for teachers?"). Bounded. */
  history?: { question: string }[];
}

/**
 * Answer locally. Synchronous, always available, never fails.
 *
 * Exported separately so the UI can render an answer immediately and refine it
 * afterwards, rather than holding the whole interaction behind a promise.
 */
export const answerLocally = (
  question: string,
  opts: AskOptions = {},
): AssistantAnswer => ask(question, opts);

/**
 * Ask a configured model to rephrase the summary.
 *
 * Returns the ORIGINAL answer unchanged on every failure mode, including the
 * one that matters most: a rewrite that says something the sources do not.
 * There is no path here that produces an answer the local engine would not have
 * produced — refinement can only change how the first sentence reads.
 */
export const refineAnswer = async (
  question: string,
  answer: AssistantAnswer,
): Promise<AssistantAnswer> => {
  // Refusals and "no documentation" replies are deliberate, carefully-worded
  // product copy. There is nothing for a model to improve and every reason not
  // to let one soften a refusal.
  if (answer.refusal || answer.confidence === "none" || answer.sources.length === 0) {
    return answer;
  }

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), REFINE_TIMEOUT_MS),
  );

  try {
    const call = supabase.functions
      .invoke("assistant", {
        body: {
          question,
          summary: answer.summary,
          // Only the retrieved articles' slugs — the function re-reads their
          // text from its own copy of the corpus rather than trusting a client
          // to supply the "documentation" it should answer from.
          slugs: answer.sources.map((s) => s.slug),
        },
      })
      .then((r) => (r.error ? null : (r.data as { summary?: string } | null)));

    const result = await Promise.race([call, timeout]);
    const rewritten = result?.summary?.trim();
    if (!rewritten) return answer;

    // The grounding check runs on the CLIENT as well as in the function.
    // Duplicated deliberately: this is the assertion that a compromised or
    // misconfigured backend still cannot put an unsupported claim on screen.
    if (!isGrounded(rewritten, answer.sources)) return answer;

    return { ...answer, summary: rewritten, refined: true };
  } catch {
    // Network down, function absent, CORS, anything: the visitor already has a
    // complete and correct answer. Never surface this.
    return answer;
  }
};
