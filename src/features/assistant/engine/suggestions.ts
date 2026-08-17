// ──────────────────────────────────────────────────────────────────────────────
// SUGGESTED QUESTIONS — derived from the registry, never authored
//
// Phase 15 and Phase 25 of the brief are the same requirement seen twice: a
// suggested question is a PROMISE that a good answer exists. Hardcoding
// "How does WhatsApp automation work?" is a promise the corpus has to keep
// forever, and the day that article is renamed the assistant's own opening
// screen sends people into a dead end.
//
// So suggestions are generated from articles that are actually present, and
// every one is round-tripped through retrieval by the test suite: a suggestion
// that does not resolve back to its own article fails the build.
// ──────────────────────────────────────────────────────────────────────────────

import type { DocArticle } from "@/features/docs/types";
import { PUBLIC_CORPUS } from "./corpus";
import { VISITOR_ROLE_TO_DOC, type VisitorRole } from "./types";

export interface Suggestion {
  /** What the visitor sees and taps. */
  label: string;
  /** What is actually asked. Identical here — kept distinct so a future
   *  shorter label cannot silently change the question being asked. */
  question: string;
  /** The article this is expected to resolve to. Used by the gate. */
  expectSlug: string;
}

/**
 * Turn an article title into a question a person would actually type.
 *
 * These are rules of ENGLISH, applied to whatever shape the title happens to
 * have — not a per-article lookup. That distinction is the whole point: a
 * slug-keyed phrase table would be a second registry to maintain, and it would
 * be wrong the first time an article was renamed.
 *
 * The catch-all is "Tell me about X" because it is grammatical for every noun
 * phrase, singular or plural, short or long. The nicer shapes above it apply
 * only where they are provably correct. A suggestion chip reading "How do I use
 * how communication automation works?" is worse than a plain one.
 */
const phrase = (a: DocArticle): string => {
  const raw = a.title.trim();

  if (raw.endsWith("?")) return raw;
  // Troubleshooting titles are already the problem stated in the reader's own
  // words ("Our logo is missing from receipts"). Anything wrapped round them
  // reads worse than the sentence itself.
  if (a.category === "troubleshooting") return raw;

  const welcome = raw.match(/^welcome to (.+)$/i);
  if (welcome) return `What is ${welcome[1]}?`;

  // "How communication automation works" → "How does communication automation work?"
  const works = raw.match(/^how (.+?) works?$/i);
  if (works) return `How does ${works[1]} work?`;

  // "How organizations stay separate" → "How do organizations stay separate?"
  const plural = raw.match(/^how (.+?\s)(stay|remain|work|connect|differ|relate)\b(.*)$/i);
  if (plural) return `How do ${plural[1]}${plural[2]}${plural[3]}?`;

  if (/^(how|what|why|when|where|which|who)\b/i.test(raw)) return `${raw}?`;

  const lower = raw.charAt(0).toLowerCase() + raw.slice(1);

  // Imperative titles are instructions already — "Set up your organization".
  if (/^(set|import|collect|brand|create|add|configure|manage|send|enable|check|run|build|write|track|assign)\b/i.test(raw)) {
    return `How do I ${lower}?`;
  }

  // "Parent portal guide" → "the parent portal", which takes a definite article
  // and reads naturally in the "How does … work?" frame.
  const topic = lower.replace(/\s+guide$/, "");
  if (/\b(portal|form|dashboard|centre|center)$/.test(topic)) {
    return `How does the ${topic} work?`;
  }

  return `Tell me about ${topic}`;
};

const toSuggestion = (a: DocArticle): Suggestion => ({
  label: phrase(a),
  question: phrase(a),
  expectSlug: a.slug,
});

/**
 * Openers shown before the visitor has said anything.
 *
 * Ordered by what a first-time visitor most likely wants, using categories as
 * the proxy: what the product is, then how to start, then the highest-traffic
 * operational areas. Categories that hold nothing contribute nothing, so the
 * list shrinks rather than breaks if the corpus does.
 */
const OPENING_CATEGORY_ORDER = [
  "getting-started",
  "portals",
  "attendance",
  "finance",
  "communication",
  "roles",
  "students",
  "academics",
] as const;

export const openingSuggestions = (limit = 5): Suggestion[] => {
  const out: Suggestion[] = [];
  const used = new Set<string>();

  for (const category of OPENING_CATEGORY_ORDER) {
    if (out.length >= limit) break;
    const article = PUBLIC_CORPUS.find(
      (a) => a.category === category && !used.has(a.slug),
    );
    if (!article) continue;
    used.add(article.slug);
    out.push(toSuggestion(article));
  }

  // Top up from anything left, so a thin corpus still fills the panel.
  for (const a of PUBLIC_CORPUS) {
    if (out.length >= limit) break;
    if (used.has(a.slug)) continue;
    used.add(a.slug);
    out.push(toSuggestion(a));
  }

  return out.slice(0, limit);
};

/** Suggestions weighted to a role the visitor has identified as. */
export const suggestionsForRole = (
  role: VisitorRole,
  limit = 5,
): Suggestion[] => {
  const wanted = VISITOR_ROLE_TO_DOC[role];
  const mine = PUBLIC_CORPUS.filter((a) => a.roles.some((r) => wanted.includes(r)));
  const picked: Suggestion[] = [];
  const used = new Set<string>();

  // The role's own guide first, when one exists.
  const guide = mine.find((a) => a.category === "roles" || a.category === "portals");
  if (guide) {
    used.add(guide.slug);
    picked.push(toSuggestion(guide));
  }
  for (const a of mine) {
    if (picked.length >= limit) break;
    if (used.has(a.slug)) continue;
    used.add(a.slug);
    picked.push(toSuggestion(a));
  }
  return picked.slice(0, limit);
};

/**
 * Fallbacks offered alongside a refusal.
 *
 * Same generation path as everything else — a refusal is still an opportunity
 * to point at something real, and it must not become the one place with a
 * hand-maintained list.
 */
export const refusalSuggestions = (limit = 3): Suggestion[] =>
  openingSuggestions(limit);
