// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ASSISTANT — SHARED TYPES
//
// The assistant is a DOCUMENTATION assistant, not an ERP assistant. Every type
// here is shaped by one rule:
//
//   an answer may only contain text that came out of a real article
//
// That is why `AssistantAnswer` has no free-form "content" field the caller can
// fill in. It carries `blocks`, each of which names the article it was built
// from, and `sources`, which are resolved through the registry. A sentence with
// no article behind it has nowhere to live in this shape — which is what makes
// "never invent a feature" a property of the data model rather than a note in a
// prompt somebody can talk their way around.
// ──────────────────────────────────────────────────────────────────────────────

import type { DocArticle, DocRole } from "@/features/docs/types";

/**
 * Who the visitor said they are.
 *
 * `platform` is deliberately ABSENT. It exists in `DocRole` because the
 * Documentation Center serves signed-in platform operators, but this assistant
 * is public: there is no way for an anonymous visitor to claim it, and no
 * question can route to it. See `PUBLIC_ROLES`.
 */
export type VisitorRole = "management" | "coordinator" | "teacher" | "parent" | "student";

/** The roles a public visitor may be resolved to, and their doc-role mapping. */
export const VISITOR_ROLE_TO_DOC: Record<VisitorRole, DocRole[]> = {
  // An institution's administrator reads both the admin and management guides;
  // the product splits those, prospective customers do not.
  management: ["management", "admin"],
  coordinator: ["coordinator"],
  teacher: ["teacher"],
  parent: ["parent"],
  // Students have no role guide of their own. Rather than inventing one, a
  // student is served the parent-facing material, which covers the same
  // surfaces (attendance, results, fees) from the same side of the wall.
  student: ["parent"],
};

/** How sure retrieval is, which decides the SHAPE of the answer. */
export type Confidence =
  /** One article clearly dominates. Answer from it, in depth. */
  | "high"
  /** Several are relevant. Give an overview and offer each. */
  | "medium"
  /** Too broad to answer well — ask which of the real options they mean. */
  | "clarify"
  /** Nothing relevant. Say so; never improvise. */
  | "none";

/** Why the assistant refused, when it did. */
export type RefusalKind =
  | "credentials"
  | "injection"
  | "private_data"
  | "internal_architecture"
  | "empty"
  | "too_long";

export interface RetrievedArticle {
  article: DocArticle;
  /** Raw retrieval score. Comparable only within one result set. */
  score: number;
  /** Score as a share of the top hit — what confidence tiers are read from. */
  relevance: number;
  /** Which fields matched, for explainability and for the tests. */
  matchedOn: string[];
}

export interface RetrievalResult {
  hits: RetrievedArticle[];
  confidence: Confidence;
  /** Set when `confidence === "clarify"` — the real options to offer. */
  clarifyOptions: { label: string; slug: string; question: string }[];
  /** The role retrieval decided to favour, if any. */
  role: VisitorRole | null;
}

/**
 * One piece of an answer.
 *
 * `sourceSlug` is not decoration. Composition never emits a block without one,
 * and a test asserts it — so every rendered sentence is traceable to an article
 * that the documentation gate already proved describes something real.
 */
export interface AnswerBlock {
  kind: "paragraph" | "steps" | "note" | "list";
  /** For `steps` / `list`. */
  items?: string[];
  /** For `paragraph` / `note`. */
  text?: string;
  /** For `note` — mirrors DocCallout.kind. */
  tone?: "tip" | "important" | "warning" | "note";
  sourceSlug: string;
}

/** A documentation reference, resolved — never a hand-written URL. */
export interface AnswerSource {
  title: string;
  slug: string;
  description: string;
  category: string;
  /** Built by `docsUrl()`. The only place a /docs path is constructed. */
  url: string;
}

export interface AssistantAnswer {
  /** One or two sentences. Always built from a real article's own prose. */
  summary: string;
  blocks: AnswerBlock[];
  sources: AnswerSource[];
  confidence: Confidence;
  /** Present when the assistant declined; `blocks` is then explanatory only. */
  refusal?: RefusalKind;
  /** Offered when confidence is "clarify" or "none". */
  followUps: { label: string; question: string }[];
  /** True when an LLM rephrased the summary. Never changes the sources. */
  refined?: boolean;
}
