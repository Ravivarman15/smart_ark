// ──────────────────────────────────────────────────────────────────────────────
// THE PUBLIC CORPUS + THE URL BUILDER
//
// Two jobs, together because they are the same guarantee from two sides:
// what the assistant is allowed to talk about, and how it links to it.
//
// ┌── WHY THE CORPUS IS NARROWER THAN THE DOCUMENTATION CENTER ────────────┐
// │ /docs is public, and correctly so — a prospective customer needs to    │
// │ read the guides. But /docs is BROWSED by someone who chose to open a   │
// │ platform-operations page. The assistant PUSHES content at whoever      │
// │ asks, and "how do I suspend a tenant" is not a question a school's     │
// │ parent should get a walkthrough for.                                    │
// │                                                                         │
// │ So the assistant serves a subset: everything except provider-operations │
// │ material. The articles remain readable at their own URLs; they are      │
// │ simply not what an anonymous question resolves to.                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The corpus is DERIVED, never listed. A new platform article is excluded the
// day it is written, with nobody remembering to add it here.
// ──────────────────────────────────────────────────────────────────────────────

import { ARTICLES, BY_SLUG } from "@/features/docs/content";
import type { DocArticle, DocRole } from "@/features/docs/types";
import type { AnswerSource } from "./types";

/**
 * Roles a public visitor can be served.
 *
 * `platform` is the whole exclusion: an article written FOR the provider is not
 * product guidance for a customer, whatever its category says.
 */
export const PUBLIC_ROLES: DocRole[] = [
  "admin",
  "management",
  "coordinator",
  "teacher",
  "parent",
];

/**
 * Is this article safe for an anonymous visitor to be handed?
 *
 * Two independent conditions, both required. `category === "platform"` catches
 * the operations guides; the role check catches anything written solely for
 * platform staff that happens to sit in another category. Either alone would
 * leak the other case.
 */
export const isPublicArticle = (a: DocArticle): boolean => {
  if (a.category === "platform") return false;
  return a.roles.some((r) => PUBLIC_ROLES.includes(r));
};

/** The corpus the assistant retrieves over. Everything else does not exist to it. */
export const PUBLIC_CORPUS: DocArticle[] = ARTICLES.filter(isPublicArticle);

export const PUBLIC_SLUGS: ReadonlySet<string> = new Set(
  PUBLIC_CORPUS.map((a) => a.slug),
);

// ── The URL builder ─────────────────────────────────────────────────────────

/**
 * The ONE place a documentation URL is constructed.
 *
 * Phase 13 of the brief calls this a hard requirement, and it is: the moment a
 * `/docs/${slug}` template string appears in a component, the assistant has its
 * own opinion about routing, and it will be wrong the first time the docs route
 * moves. A test asserts no other file in this feature builds one.
 *
 * Returns a ROOT-RELATIVE path. Absolute URLs would bake the deployment host
 * into answers, which breaks on preview deployments and custom domains alike.
 */
export const docsUrl = (slug: string): string => `/docs/${slug}`;

/**
 * Resolve a slug into a renderable source card.
 *
 * Returns `null` for anything not in the public corpus — an unknown slug, a
 * typo, or a platform article. Callers drop nulls, so a bad reference degrades
 * into one fewer card rather than a dead link. `DocsLink` already takes this
 * position for contextual help; the assistant matches it.
 */
export const toSource = (slug: string): AnswerSource | null => {
  const a = BY_SLUG.get(slug);
  if (!a || !isPublicArticle(a)) return null;
  return {
    title: a.title,
    slug: a.slug,
    description: a.description,
    category: a.category,
    url: docsUrl(a.slug),
  };
};

/** Resolve many, dropping whatever does not resolve. Order preserved. */
export const toSources = (slugs: readonly string[]): AnswerSource[] => {
  const out: AnswerSource[] = [];
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) continue;
    const src = toSource(s);
    if (src) {
      out.push(src);
      seen.add(s);
    }
  }
  return out;
};
