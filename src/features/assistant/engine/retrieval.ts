// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENTATION RETRIEVAL
//
// Built on the corpus the Documentation Center already publishes. There is no
// second index, no copy of the articles, and no separately-maintained "AI
// knowledge base" — an article edited in `src/features/docs/content` changes
// what the assistant says on the next build, with no sync step to forget.
//
// ┌── WHY NOT REUSE searchDocs() OUTRIGHT ─────────────────────────────────┐
// │ `searchDocs` requires EVERY term to appear, which is right for a search │
// │ box: typing three words and getting loose matches feels broken.         │
// │                                                                         │
// │ A question is not a query. "How can parents check their child's         │
// │ attendance?" contains 'how', 'can', 'their' and 'child's' — under       │
// │ every-term matching it returns nothing, which is the single worst       │
// │ outcome here because the article exists and is excellent.               │
// │                                                                         │
// │ So retrieval keeps the same weighted-field idea and the same corpus,    │
// │ but scores partial overlap and drops question words. `searchDocs` is    │
// │ still used verbatim where it fits — see `exactSearchFallback`.          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// No embeddings. 29 public articles is not a vector-database problem, and the
// brief forbids building infrastructure that duplicates an existing capability.
// If the corpus reaches a few hundred, revisit — the interface would not change.
// ──────────────────────────────────────────────────────────────────────────────

import type { DocArticle } from "@/features/docs/types";
import { searchDocs } from "@/features/docs/content";
import { PUBLIC_CORPUS, isPublicArticle } from "./corpus";
import {
  VISITOR_ROLE_TO_DOC,
  type Confidence,
  type RetrievalResult,
  type RetrievedArticle,
  type VisitorRole,
} from "./types";

// ── Tokenisation ────────────────────────────────────────────────────────────

/**
 * Words carrying no retrieval signal.
 *
 * Kept deliberately short. Over-stemming is how "what can teachers do" loses
 * 'teachers' and matches everything; these are only words that appear in
 * roughly every question.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "could", "did", "do",
  "does", "for", "from", "get", "give", "has", "have", "how", "i", "if", "in",
  "into", "is", "it", "its", "me", "my", "of", "on", "or", "our", "please",
  "should", "show", "so", "some", "tell", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "up", "us", "use",
  "want", "was", "we", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your", "about", "explain", "work", "works", "using",
]);

/**
 * Light singularisation, applied to BOTH sides so it cannot cause a mismatch.
 *
 * Not a stemmer. "fees" → "fee" and "parents" → "parent" is the entire win;
 * anything more aggressive starts mangling 'class' → 'clas' and costs more
 * matches than it gains.
 */
const normalise = (word: string): string => {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") || word.endsWith("hes") || word.endsWith("xes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
};

export const tokenise = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map(normalise);

// ── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Field weights.
 *
 * Titles and keywords dominate because they are curated: an author choosing
 * `keywords: ["parent", "portal", "child", "attendance"]` is stating what the
 * article is FOR, which is better evidence than the same word appearing once in
 * a step body.
 */
const FIELDS = (a: DocArticle): { name: string; text: string; weight: number }[] => [
  { name: "title", text: a.title, weight: 12 },
  { name: "keywords", text: a.keywords.join(" "), weight: 9 },
  { name: "description", text: a.description, weight: 6 },
  { name: "category", text: a.category.replace(/-/g, " "), weight: 4 },
  { name: "steps", text: (a.steps ?? []).map((s) => s.title).join(" "), weight: 4 },
  { name: "faq", text: (a.faq ?? []).map((f) => f.q).join(" "), weight: 4 },
  { name: "intro", text: a.intro.join(" "), weight: 2 },
  { name: "body", text: (a.steps ?? []).map((s) => s.body).join(" "), weight: 1 },
  { name: "answers", text: (a.faq ?? []).map((f) => f.a).join(" "), weight: 1 },
];

/**
 * Phrases a visitor uses that the documentation does not.
 *
 * This is the one place where the assistant knows a word the corpus does not,
 * and it is strictly a SYNONYM MAP — it never introduces a concept. "Parent
 * portal" is what customers call `role-parent`; mapping the phrase is honest,
 * inventing a feature would not be.
 *
 * Every target term is asserted by a test to appear in the real corpus, so this
 * map cannot drift into describing something that no longer exists.
 */
const SYNONYMS: Record<string, string[]> = {
  portal: ["parent", "portal"],
  guardian: ["parent"],
  mum: ["parent"],
  dad: ["parent"],
  father: ["parent"],
  mother: ["parent"],
  kid: ["student", "child"],
  child: ["student", "parent"],
  pupil: ["student"],
  admin: ["management", "admin"],
  administrator: ["management", "admin"],
  principal: ["management"],
  headmaster: ["management"],
  owner: ["management"],
  faculty: ["teacher", "staff"],
  tutor: ["teacher"],
  instructor: ["teacher"],
  lecturer: ["teacher"],
  employee: ["staff"],
  salary: ["payroll"],
  wage: ["payroll"],
  payslip: ["payroll"],
  payment: ["fee"],
  money: ["fee"],
  cost: ["fee"],
  bill: ["fee", "invoice"],
  invoice: ["fee", "billing"],
  due: ["fee"],
  receipt: ["fee"],
  present: ["attendance"],
  absent: ["attendance"],
  register: ["attendance"],
  roll: ["attendance"],
  mark: ["attendance", "exam"],
  grade: ["exam", "result"],
  score: ["exam", "result"],
  test: ["exam"],
  marksheet: ["exam", "result"],
  message: ["communication", "whatsapp"],
  sms: ["communication"],
  notification: ["communication"],
  reminder: ["communication"],
  alert: ["communication"],
  enquiry: ["lead", "enquiry"],
  inquiry: ["lead", "enquiry"],
  admission: ["lead", "enquiry"],
  onboarding: ["setup", "organization"],
  start: ["setup", "welcome"],
  begin: ["setup", "welcome"],
  // "Timetable" is the word the documentation uses; "schedule" appears in the
  // corpus only inside an FAQ stating that reports CANNOT be scheduled. Mapping
  // toward it would aim retrieval at a negation — caught by the synonym gate.
  timetable: ["timetable", "class", "allocation"],
  schedule: ["timetable", "class", "allocation"],
  branding: ["document", "brand"],
  logo: ["document", "brand"],
  signin: ["login"],
  signup: ["setup", "organization"],
};

const expand = (terms: string[]): string[] => {
  const out = new Set(terms);
  for (const t of terms) for (const s of SYNONYMS[t] ?? []) out.add(normalise(s));
  return [...out];
};

/**
 * Role affinity multiplier.
 *
 * A bonus, never a filter. Someone who said "I'm a parent" and then asked about
 * payroll should still get the payroll guide — they may be a parent who is also
 * a bursar, and refusing to answer would be absurd. The multiplier reorders
 * ties; it does not decide what exists.
 */
const ROLE_BOOST = 1.35;

/**
 * Language that means "something is wrong", as opposed to "how does this work".
 *
 * Troubleshooting articles quote the failure they solve, so their titles are
 * dense with product nouns — "Fees Management shows nothing for them" scores
 * higher on 'fee' than the actual fee guide does. Left alone, retrieval answers
 * "how does fee management work?" with the fix for a bug the visitor does not
 * have, which reads as though the product is broken.
 *
 * So a troubleshooting article is DEMOTED unless the question is itself about a
 * problem. It is a prior on intent, not a filter: someone who says "fees are
 * not showing" still gets it, first.
 */
const PROBLEM_LANGUAGE =
  /\b(error|fail(s|ed|ing)?|not work|isn'?t work|doesn'?t work|broken|missing|cannot|can'?t|unable|wrong|issue|problem|stuck|blank|empty|shows? nothing|no fees?|not show|won'?t|refus|denied|rejected|troubleshoot|fix)\b/;

const TROUBLESHOOTING_DEMOTION = 0.45;

/**
 * The other half of the prior. Someone describing a symptom wants the fix, not
 * the feature tour — but "receipts" matches the fee guide's title outright, so
 * without a counterweight the demotion case is corrected and this one is not.
 */
const TROUBLESHOOTING_BOOST = 1.7;

/**
 * Words that name an ACTIVITY rather than a subject.
 *
 * "Fee management" is a question about fees; "management" is doing the work of
 * the word "of". But it is also the name of a role, with its own guide, whose
 * title and keywords it matches exactly — so scoring it at full weight answers
 * a fee question with the Management role guide.
 *
 * The fix is the standard one: a term this common carries less evidence. It is
 * downweighted only when the query contains something more specific, so "what
 * can management do?" — where it is the entire subject — is untouched.
 */
const QUALIFIERS = new Set([
  "management", "system", "module", "feature", "process", "tool", "section",
  "part", "option", "setting", "page", "screen", "portal", "software",
]);

const QUALIFIER_DAMPING = 0.35;

const scoreArticle = (
  article: DocArticle,
  terms: string[],
  role: VisitorRole | null,
  problemIntent: boolean,
): RetrievedArticle | null => {
  let score = 0;
  const matchedOn: string[] = [];
  const matchedTerms = new Set<string>();

  // Only damp when something more specific is present to carry the query.
  const hasSpecific = terms.some((t) => !QUALIFIERS.has(t));
  const termWeight = (t: string): number =>
    hasSpecific && QUALIFIERS.has(t) ? QUALIFIER_DAMPING : 1;

  for (const field of FIELDS(article)) {
    const words = new Set(tokenise(field.text));
    let fieldScore = 0;
    let fieldHits = 0;
    for (const t of terms) {
      if (words.has(t)) {
        fieldScore += termWeight(t);
        fieldHits += 1;
        matchedTerms.add(t);
      }
    }
    if (fieldHits > 0) {
      score += fieldScore * field.weight;
      matchedOn.push(field.name);
    }
  }

  if (score === 0) return null;

  // Coverage matters more than raw frequency: an article matching three of the
  // four meaningful words beats one that repeats a single word nine times.
  const coverage = matchedTerms.size / Math.max(terms.length, 1);
  score *= 0.5 + coverage;

  if (role) {
    const wanted = VISITOR_ROLE_TO_DOC[role];
    if (article.roles.some((r) => wanted.includes(r))) score *= ROLE_BOOST;
  }

  if (article.category === "troubleshooting") {
    score *= problemIntent ? TROUBLESHOOTING_BOOST : TROUBLESHOOTING_DEMOTION;
  }

  return { article, score, relevance: 0, matchedOn };
};

// ── Role detection ──────────────────────────────────────────────────────────

const ROLE_CLAIMS: { role: VisitorRole; patterns: RegExp[] }[] = [
  { role: "parent", patterns: [/\b(i'?m|i am|as)\s+(a\s+|the\s+)?(parent|guardian|mother|father|mum|dad)\b/] },
  { role: "teacher", patterns: [/\b(i'?m|i am|as)\s+(a\s+|the\s+)?(teacher|tutor|faculty|instructor|lecturer)\b/] },
  { role: "coordinator", patterns: [/\b(i'?m|i am|as)\s+(a\s+|the\s+)?(coordinator|co-ordinator)\b/] },
  { role: "student", patterns: [/\b(i'?m|i am|as)\s+(a\s+|the\s+)?(student|pupil)\b/] },
  {
    role: "management",
    patterns: [
      /\b(i'?m|i am|as)\s+(a\s+|an\s+|the\s+)?(admin|administrator|management|manager|principal|headmaster|owner|director)\b/,
      /\b(i|we)\s+(run|own|manage)\s+(a|an|the|my|our)\s+(school|institution|academy|college|centre|center|tuition)/,
    ],
  },
];

/** Read a role the visitor stated. Returns null rather than guessing. */
export const detectRole = (text: string): VisitorRole | null => {
  const t = text.toLowerCase();
  for (const { role, patterns } of ROLE_CLAIMS) {
    if (patterns.some((p) => p.test(t))) return role;
  }
  return null;
};

// ── Confidence ──────────────────────────────────────────────────────────────

/**
 * Absolute floor a top hit must clear to be treated as an answer at all.
 *
 * Tuned against the real corpus in the test suite: below this, matches are
 * incidental word overlap ("what is the meaning of life" hits 'is' nowhere but
 * can still brush a body paragraph), and answering from them produces
 * confident nonsense — the exact failure Phase 8 exists to prevent.
 */
const MIN_SCORE = 12;

/**
 * A vague SINGLE concept — "fees?" — that several real articles could answer.
 *
 * One term, not two. At two the tier misfires on real questions: "fee
 * management" reduces to ['fee','management'], matches the fee guide and the
 * management role guide about equally, and asking "which did you mean?" when
 * somebody asked a perfectly clear question is worse than answering it. A
 * single bare noun is the only case where the ambiguity is genuinely the
 * visitor's rather than the engine's.
 */
const CLARIFY_MAX_TERMS = 1;

const decideConfidence = (
  hits: RetrievedArticle[],
  terms: string[],
): Confidence => {
  if (hits.length === 0 || hits[0].score < MIN_SCORE) return "none";

  const top = hits[0];
  const second = hits[1];

  // A short, broad question with several plausible answers. Guessing here is
  // how an assistant answers the wrong question fluently.
  if (
    terms.length <= CLARIFY_MAX_TERMS &&
    second &&
    second.score / top.score > 0.7 &&
    hits.filter((h) => h.score / top.score > 0.7).length >= 3
  ) {
    return "clarify";
  }

  if (!second) return "high";
  return second.score / top.score < 0.62 ? "high" : "medium";
};

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * `searchDocs` used as-is, for the case it is genuinely better at: a visitor
 * typing a precise multi-word phrase that appears verbatim. Reusing it rather
 * than reimplementing exact matching keeps one behaviour in one place.
 */
const exactSearchFallback = (question: string): RetrievedArticle[] =>
  searchDocs(question, "all")
    .filter((h) => isPublicArticle(h.article))
    .map((h) => ({
      article: h.article,
      score: h.score,
      relevance: 0,
      matchedOn: ["exact"],
    }));

export const MAX_HITS = 4;

export const retrieve = (
  question: string,
  statedRole: VisitorRole | null = null,
): RetrievalResult => {
  const role = statedRole ?? detectRole(question);
  const terms = expand(tokenise(question));
  const problemIntent = PROBLEM_LANGUAGE.test(question.toLowerCase());

  let hits: RetrievedArticle[] = [];
  if (terms.length > 0) {
    hits = PUBLIC_CORPUS.map((a) => scoreArticle(a, terms, role, problemIntent))
      .filter((h): h is RetrievedArticle => h !== null)
      .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));
  }

  // Only when scoring found nothing usable — never merged in, because two
  // scoring systems in one ranked list produce an order neither one intended.
  if (hits.length === 0 || hits[0].score < MIN_SCORE) {
    const exact = exactSearchFallback(question);
    if (exact.length > 0) hits = exact;
  }

  const confidence = decideConfidence(hits, terms);
  const top = hits[0]?.score ?? 1;
  const ranked = hits.slice(0, MAX_HITS).map((h) => ({
    ...h,
    relevance: Math.round((h.score / top) * 100) / 100,
  }));

  return {
    hits: confidence === "none" ? [] : ranked,
    confidence,
    clarifyOptions:
      confidence === "clarify"
        ? ranked.slice(0, 4).map((h) => ({
            label: h.article.title,
            slug: h.article.slug,
            question: `How does ${h.article.title.toLowerCase()} work?`,
          }))
        : [],
    role,
    // `none` keeps its near-misses out of `hits` but still offers them as
    // suggestions — see nearestSuggestions.
  };
};

/**
 * Closest articles when confidence is "none".
 *
 * Phase 8: say plainly that there is no verified guide, then optionally offer
 * the nearest real ones. These are explicitly NOT presented as the answer, so
 * they are returned separately and rendered under different copy.
 */
export const nearestSuggestions = (question: string, limit = 3) => {
  const terms = expand(tokenise(question));
  if (terms.length === 0) return [];
  const problemIntent = PROBLEM_LANGUAGE.test(question.toLowerCase());
  return PUBLIC_CORPUS.map((a) => scoreArticle(a, terms, null, problemIntent))
    .filter((h): h is RetrievedArticle => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.article);
};
