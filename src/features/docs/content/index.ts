import type { DocArticle, DocRole, DocCategory } from "../types";
import { GETTING_STARTED } from "./gettingStarted";
import { MODULE_ARTICLES } from "./modules";
import { ROLE_ARTICLES } from "./roles";
import { OPERATIONS_ARTICLES } from "./operations";
import { TROUBLESHOOTING } from "./troubleshooting";

// ──────────────────────────────────────────────────────────────────────────────
// THE ARTICLE INDEX
//
// One flat list. Categories and roles are attributes of an article, not folders
// containing it — which is what lets the same article appear under a category,
// a role filter and a search result without being duplicated three times.
// ──────────────────────────────────────────────────────────────────────────────

export const ARTICLES: DocArticle[] = [
  ...GETTING_STARTED,
  ...ROLE_ARTICLES,
  ...MODULE_ARTICLES,
  ...OPERATIONS_ARTICLES,
  ...TROUBLESHOOTING,
];

export const BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));

export const articlesFor = (role: DocRole | "all"): DocArticle[] =>
  role === "all" ? ARTICLES : ARTICLES.filter((a) => a.roles.includes(role));

export const articlesIn = (category: DocCategory): DocArticle[] =>
  ARTICLES.filter((a) => a.category === category);

/** Categories that actually contain something, in declaration order. */
export const populatedCategories = (role: DocRole | "all"): DocCategory[] => {
  const pool = articlesFor(role);
  const seen: DocCategory[] = [];
  for (const a of pool) if (!seen.includes(a.category)) seen.push(a.category);
  return seen;
};

/**
 * Reading order for previous/next. Derived from the sidebar grouping so the
 * arrows follow what the reader sees, rather than the order the files happen
 * to be imported in.
 */
export const readingOrder = (role: DocRole | "all"): DocArticle[] => {
  const pool = articlesFor(role);
  const out: DocArticle[] = [];
  for (const c of populatedCategories(role)) {
    out.push(...pool.filter((a) => a.category === c));
  }
  return out;
};

export const neighbours = (
  slug: string,
  role: DocRole | "all",
): { prev: DocArticle | null; next: DocArticle | null } => {
  const order = readingOrder(role);
  const i = order.findIndex((a) => a.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: order[i - 1] ?? null, next: order[i + 1] ?? null };
};

// ── Search ──────────────────────────────────────────────────────────────────
//
// A scored scan over a few dozen articles. No index to build, no service to
// run: at this corpus size anything heavier is infrastructure for its own sake,
// and the brief explicitly forbids duplicating an existing capability.

export interface SearchHit {
  article: DocArticle;
  score: number;
  /** The line that matched, for the result snippet. */
  excerpt: string;
}

const haystack = (a: DocArticle): { text: string; weight: number }[] => [
  { text: a.title, weight: 10 },
  { text: a.description, weight: 6 },
  { text: a.keywords.join(" "), weight: 6 },
  { text: (a.steps ?? []).map((s) => s.title).join(" "), weight: 4 },
  { text: (a.faq ?? []).map((f) => f.q).join(" "), weight: 4 },
  { text: a.intro.join(" "), weight: 2 },
  { text: (a.steps ?? []).map((s) => s.body).join(" "), weight: 1 },
  { text: (a.faq ?? []).map((f) => f.a).join(" "), weight: 1 },
  { text: (a.callouts ?? []).map((c) => c.body).join(" "), weight: 1 },
];

export const searchDocs = (
  query: string,
  role: DocRole | "all" = "all",
): SearchHit[] => {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  // Every word must appear somewhere, so "parent fees" does not match an
  // article about fees that never mentions parents.
  const terms = q.split(/\s+/).filter(Boolean);

  const hits: SearchHit[] = [];
  for (const article of articlesFor(role)) {
    const fields = haystack(article);
    const blob = fields.map((f) => f.text).join(" ").toLowerCase();
    if (!terms.every((t) => blob.includes(t))) continue;

    let score = 0;
    for (const f of fields) {
      const lower = f.text.toLowerCase();
      for (const t of terms) if (lower.includes(t)) score += f.weight;
    }
    // Prefer a title that starts with the query — "fee" should rank
    // "Collect fees" above an article that merely mentions fees.
    if (article.title.toLowerCase().startsWith(terms[0])) score += 8;

    const excerptSource =
      article.intro.find((p) => terms.some((t) => p.toLowerCase().includes(t))) ??
      article.description;

    hits.push({ article, score, excerpt: excerptSource });
  }
  return hits.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));
};
