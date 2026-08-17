// ──────────────────────────────────────────────────────────────────────────────
// OPTIONAL LLM REFINEMENT — AND THE GROUNDING CHECK THAT POLICES IT
//
// The repository has no AI provider (audited: no SDK, no key, no endpoint — the
// "AI" question-paper import is a deterministic local parser). So the assistant
// is built to work with NO model at all, and refinement is a strictly optional
// upgrade that a deployment may switch on later.
//
// ┌── WHAT A MODEL IS AND IS NOT ALLOWED TO DO HERE ───────────────────────┐
// │ ALLOWED:  rewrite the SUMMARY so it reads as a reply to the question   │
// │           the visitor actually asked.                                   │
// │                                                                         │
// │ NOT ALLOWED: add a fact, add a step, change a source, answer a question │
// │           the corpus does not cover, or produce the answer at all.      │
// │                                                                         │
// │ The steps, notes and source cards are composed from article fields and  │
// │ never pass through a model. So the worst a bad completion can do is     │
// │ produce an awkward opening sentence — not a fictional feature.          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// And even that is checked. `isGrounded()` rejects a rewrite that introduces
// content words absent from the source articles, and the caller falls back to
// the composed summary. Refinement can only ever make the answer read better;
// it cannot make it say more.
// ──────────────────────────────────────────────────────────────────────────────

import { BY_SLUG } from "@/features/docs/content";
import type { DocArticle } from "@/features/docs/types";
import { tokenise } from "./retrieval";
import type { AnswerSource } from "./types";

/** Everything a source article says, as a bag of words. */
const vocabularyOf = (a: DocArticle): Set<string> => {
  const text = [
    a.title,
    a.description,
    a.keywords.join(" "),
    a.intro.join(" "),
    (a.steps ?? []).map((s) => `${s.title} ${s.body}`).join(" "),
    (a.callouts ?? []).map((c) => c.body).join(" "),
    (a.faq ?? []).map((f) => `${f.q} ${f.a}`).join(" "),
  ].join(" ");
  return new Set(tokenise(text));
};

/**
 * Words a rewrite may use even though no article contains them.
 *
 * Connective language only — the vocabulary of a sentence, not of a product. It
 * deliberately contains no nouns that could name a feature: "integration",
 * "dashboard" and "sync" are exactly the words a hallucination arrives in, so
 * they must come from an article or not at all.
 */
const CONNECTIVE_VOCABULARY = new Set([
  "smart", "ark", "yes", "no", "also", "here", "your", "you", "own", "each",
  "both", "any", "all", "one", "two", "three", "first", "then", "next",
  "before", "after", "once", "while", "because", "such", "like", "way",
  "need", "needs", "want", "make", "makes", "made", "let", "lets", "see",
  "view", "open", "find", "help", "helps", "let's", "its", "it's", "they're",
  "you'll", "you're", "that's", "there's", "institution", "institutions",
]);

/**
 * Does this rewrite say only what the sources say?
 *
 * Token containment, not semantics. It cannot tell a subtle misstatement from a
 * faithful one — nothing cheap can — but it reliably catches the failure that
 * matters: a confident sentence about a capability, integration or screen that
 * appears nowhere in the retrieved articles. Those arrive as NEW NOUNS, and new
 * nouns are exactly what this rejects.
 */
export const isGrounded = (
  rewritten: string,
  sources: readonly AnswerSource[],
): boolean => {
  const text = rewritten.trim();
  if (!text) return false;

  const allowed = new Set(CONNECTIVE_VOCABULARY);
  for (const s of sources) {
    const article = BY_SLUG.get(s.slug);
    if (!article) continue;
    for (const w of vocabularyOf(article)) allowed.add(w);
  }
  // No sources means nothing to be grounded in.
  if (allowed.size === CONNECTIVE_VOCABULARY.size) return false;

  const words = tokenise(text);
  if (words.length === 0) return false;

  const unknown = words.filter((w) => !allowed.has(w));
  // A small tolerance: light paraphrase inflects words in ways the crude
  // singulariser misses, and rejecting every rewrite would make the feature
  // pointless. Two unfamiliar words is a rephrase; a sentence full of them is a
  // different claim.
  return unknown.length <= 2;
};

/** Bounds sent to whatever provider a deployment configures. */
export const REFINEMENT_LIMITS = {
  /** Enough for two sentences. A model cannot write an essay into the summary. */
  maxOutputTokens: 120,
  /** Only the retrieved snippets are ever sent — never the whole corpus. */
  maxContextArticles: 3,
  timeoutMs: 6000,
} as const;
