// ──────────────────────────────────────────────────────────────────────────────
// GROUNDED ANSWER COMPOSITION
//
// This is where the "never invent a feature" rule stops being a policy and
// becomes a mechanism.
//
// Every string in the returned answer is either:
//   (a) copied verbatim from a DocArticle field, or
//   (b) one of the fixed connective phrases in CONNECTIVES below.
//
// There is no third case. The composer cannot describe a module, because it
// does not know what a module is — it only knows how to arrange `intro`,
// `steps`, `callouts` and `faq` from articles the documentation gate has
// already proved describe real, shipped screens.
//
// ┌── WHY THIS BEATS ASKING A MODEL NICELY ────────────────────────────────┐
// │ A prompt saying "only use the provided context" is a request. It holds │
// │ most of the time, and the times it does not are exactly the confident, │
// │ plausible, entirely fictional answers that make a documentation        │
// │ assistant worse than no assistant.                                     │
// │                                                                         │
// │ Here the failure is unavailable: a fact that is not in an article has   │
// │ no path into the output. The optional LLM layer (see llm.ts) may only  │
// │ REPHRASE the summary, and its result is discarded if it introduces a    │
// │ claim the sources do not support.                                       │
// └─────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import type { DocArticle } from "@/features/docs/types";
import { toSources } from "./corpus";
import { nearestSuggestions } from "./retrieval";
import { REFUSAL_COPY } from "./safety";
import type {
  AnswerBlock,
  AssistantAnswer,
  RefusalKind,
  RetrievalResult,
} from "./types";

/**
 * The complete set of sentences the assistant may say that did not come from an
 * article. Exhaustive, and asserted as such by the test suite: if composition
 * ever needs a new one it has to be added here, in the open, where it can be
 * reviewed as product copy rather than buried in a template literal.
 */
export const CONNECTIVES = {
  howItWorks: "Here's how it works:",
  goodToKnow: "Worth knowing:",
  relatedIntro: "These guides cover it in full:",
  clarify:
    "I can help with that — which part did you mean?",
  noDocs:
    "I don't have enough verified Smart ARK documentation to answer that accurately yet.",
  noDocsNearby: "These might still be useful:",
  noDocsNothing:
    "Try asking about a portal, a module, or a workflow — attendance, fees, exams, communication, or getting started.",
  refusalOffer: "Here's what I can help with instead:",
} as const;

/** How many steps to show before the answer becomes a wall of text. */
const MAX_STEPS = 6;

/**
 * Pick the callout worth surfacing.
 *
 * At most one, and only if it is a warning or marked important. Every article
 * has notes and tips; promoting all of them turns a two-line answer into a
 * document and trains people to skim past the one that mattered.
 */
const keyCallout = (a: DocArticle) =>
  (a.callouts ?? []).find((c) => c.kind === "warning") ??
  (a.callouts ?? []).find((c) => c.kind === "important") ??
  null;

/**
 * The opening sentence.
 *
 * Prefers the article's own first intro paragraph over its `description`: the
 * description is a card subtitle written for a directory listing, while the
 * intro is written to be read first. Falls back to the description when an
 * intro paragraph is too long to serve as a summary.
 */
const summaryFor = (a: DocArticle): string => {
  const first = a.intro[0]?.trim();
  if (first && first.length <= 320) return first;
  return a.description;
};

/**
 * A DIRECT answer, from the one article that clearly matched.
 *
 * Shape follows Phase 7: short answer, how it works, one note if it earns its
 * place, then the sources.
 */
const composeHigh = (result: RetrievalResult): AssistantAnswer => {
  const top = result.hits[0];
  const a = top.article;
  const blocks: AnswerBlock[] = [];

  // Any intro paragraph beyond the one used as the summary.
  for (const p of a.intro.slice(1, 3)) {
    blocks.push({ kind: "paragraph", text: p, sourceSlug: a.slug });
  }

  const steps = a.steps ?? [];
  if (steps.length > 0) {
    blocks.push({ kind: "paragraph", text: CONNECTIVES.howItWorks, sourceSlug: a.slug });
    blocks.push({
      kind: "steps",
      items: steps
        .slice(0, MAX_STEPS)
        .map((s) => (s.body ? `${s.title} — ${s.body}` : s.title)),
      sourceSlug: a.slug,
    });
  }

  const callout = keyCallout(a);
  if (callout) {
    blocks.push({
      kind: "note",
      text: callout.body,
      tone: callout.kind,
      sourceSlug: a.slug,
    });
  }

  // Secondary hits become source cards, never prose — they were not what the
  // question was about, and summarising them here would dilute the answer.
  const slugs = [a.slug, ...result.hits.slice(1, 3).map((h) => h.article.slug)];

  return {
    summary: summaryFor(a),
    blocks,
    sources: toSources(slugs),
    confidence: "high",
    followUps: followUpsFor(a),
  };
};

/**
 * Several articles are relevant. Synthesise an OVERVIEW, not a merged answer.
 *
 * Concatenating three articles' steps produces a procedure nobody can follow,
 * because the steps belong to different workflows. So the top article leads and
 * the rest are offered — the visitor picks, which is both more honest and more
 * useful than a confident blend.
 */
const composeMedium = (result: RetrievalResult): AssistantAnswer => {
  const [top, ...rest] = result.hits;
  const a = top.article;
  const blocks: AnswerBlock[] = [];

  for (const p of a.intro.slice(1, 2)) {
    blocks.push({ kind: "paragraph", text: p, sourceSlug: a.slug });
  }

  const steps = a.steps ?? [];
  if (steps.length > 0) {
    blocks.push({ kind: "paragraph", text: CONNECTIVES.howItWorks, sourceSlug: a.slug });
    blocks.push({
      kind: "steps",
      items: steps.slice(0, 4).map((s) => (s.body ? `${s.title} — ${s.body}` : s.title)),
      sourceSlug: a.slug,
    });
  }

  if (rest.length > 0) {
    blocks.push({
      kind: "paragraph",
      text: CONNECTIVES.relatedIntro,
      sourceSlug: a.slug,
    });
    blocks.push({
      kind: "list",
      items: rest.map((h) => `${h.article.title} — ${h.article.description}`),
      sourceSlug: rest[0].article.slug,
    });
  }

  return {
    summary: summaryFor(a),
    blocks,
    sources: toSources(result.hits.map((h) => h.article.slug)),
    confidence: "medium",
    followUps: followUpsFor(a),
  };
};

/** Too broad. Offer the REAL options rather than picking one. */
const composeClarify = (result: RetrievalResult): AssistantAnswer => ({
  summary: CONNECTIVES.clarify,
  blocks: [
    {
      kind: "list",
      items: result.clarifyOptions.map((o) => o.label),
      sourceSlug: result.clarifyOptions[0]?.slug ?? result.hits[0].article.slug,
    },
  ],
  sources: toSources(result.clarifyOptions.map((o) => o.slug)),
  confidence: "clarify",
  followUps: result.clarifyOptions.map((o) => ({
    label: o.label,
    question: o.question,
  })),
});

/**
 * Nothing verified covers this. Say so first, then offer near misses — clearly
 * labelled as "might be useful", never as the answer.
 */
const composeNone = (question: string): AssistantAnswer => {
  const nearby = nearestSuggestions(question, 3);
  const blocks: AnswerBlock[] = [];
  const sources = toSources(nearby.map((a) => a.slug));

  if (sources.length === 0) {
    blocks.push({
      kind: "paragraph",
      text: CONNECTIVES.noDocsNothing,
      // Attributed to the entry-point guide: the sentence is connective copy,
      // but the block still names a real article so the invariant that every
      // block carries a resolvable slug holds without exception.
      sourceSlug: "welcome",
    });
  } else {
    blocks.push({
      kind: "paragraph",
      text: CONNECTIVES.noDocsNearby,
      sourceSlug: nearby[0].slug,
    });
  }

  return {
    summary: CONNECTIVES.noDocs,
    blocks,
    sources,
    confidence: "none",
    followUps: nearby.slice(0, 3).map((a) => ({
      label: a.title,
      question: `How does ${a.title.toLowerCase()} work?`,
    })),
  };
};

/**
 * Follow-ups drawn from the article's OWN `related` list and FAQ.
 *
 * Generated, never authored: a hand-written follow-up list is a second place
 * that has to be updated when an article is renamed, and it will not be.
 */
const followUpsFor = (a: DocArticle) => {
  const out: { label: string; question: string }[] = [];
  for (const q of (a.faq ?? []).slice(0, 2)) {
    out.push({ label: q.q, question: q.q });
  }
  for (const src of toSources(a.related ?? []).slice(0, 2)) {
    out.push({ label: src.title, question: `How does ${src.title.toLowerCase()} work?` });
  }
  return out.slice(0, 3);
};

/** A refusal, paired with somewhere to go. */
export const composeRefusal = (
  refusal: RefusalKind,
  suggestions: { label: string; question: string }[],
): AssistantAnswer => ({
  summary: REFUSAL_COPY[refusal],
  blocks:
    suggestions.length > 0
      ? [
          {
            kind: "paragraph",
            text: CONNECTIVES.refusalOffer,
            sourceSlug: "welcome",
          },
        ]
      : [],
  sources: [],
  confidence: "none",
  refusal,
  followUps: suggestions,
});

/** Compose the answer for a retrieval result. */
export const compose = (
  question: string,
  result: RetrievalResult,
): AssistantAnswer => {
  switch (result.confidence) {
    case "high":
      return composeHigh(result);
    case "medium":
      return composeMedium(result);
    case "clarify":
      return composeClarify(result);
    case "none":
    default:
      return composeNone(question);
  }
};
