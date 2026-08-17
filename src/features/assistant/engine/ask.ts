// ──────────────────────────────────────────────────────────────────────────────
// THE ENGINE ENTRY POINT
//
//   question → safety → retrieval → composition → answer
//
// One pure function, no I/O, no React, no Supabase. That is what lets the same
// code run in the browser (instant, free, offline-capable) and inside the edge
// function (when an LLM is configured to rephrase the summary) with no risk of
// the two disagreeing about what Smart ARK does.
//
// It is deliberately synchronous. An assistant that answers documentation
// questions in under a millisecond feels like a product feature; the same
// answer behind a spinner and a network round-trip feels like a chatbot.
// ──────────────────────────────────────────────────────────────────────────────

import { compose, composeRefusal } from "./compose";
import { retrieve } from "./retrieval";
import { classifyQuestion } from "./safety";
import { refusalSuggestions } from "./suggestions";
import type { AssistantAnswer, VisitorRole } from "./types";

export interface AskOptions {
  /** A role the visitor selected in the UI, which outranks anything inferred. */
  role?: VisitorRole | null;
}

export const ask = (question: string, opts: AskOptions = {}): AssistantAnswer => {
  const verdict = classifyQuestion(question);
  if (!verdict.ok && verdict.refusal) {
    return composeRefusal(
      verdict.refusal,
      refusalSuggestions(3).map((s) => ({ label: s.label, question: s.question })),
    );
  }

  const result = retrieve(question, opts.role ?? null);
  return compose(question, result);
};
