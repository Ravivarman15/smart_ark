// ──────────────────────────────────────────────────────────────────────────────
// SAFETY CLASSIFICATION — run BEFORE retrieval, not after generation
//
// Ordering is the whole design. A filter that inspects the ANSWER is a filter
// that has already done the work and is hoping to catch itself; a question that
// asks for credentials must never reach retrieval, let alone a model.
//
// ┌── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────┐
// │ This is not a jailbreak detector, and it does not need to be. The       │
// │ assistant's answers are ASSEMBLED FROM ARTICLES (see compose.ts) — it   │
// │ has no secrets in context to leak and no free-form generation to        │
// │ subvert. A successful "ignore your instructions" attack against this    │
// │ engine yields... documentation about attendance.                        │
// │                                                                         │
// │ Its real job is answering WELL when someone asks for something the      │
// │ assistant genuinely cannot give: say so plainly, then offer the nearest │
// │ thing that does exist. Silence reads as a broken product.               │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The defence-in-depth story: this layer is the polite refusal. The structural
// guarantee is that `AssistantAnswer.blocks` cannot hold a sentence without an
// article behind it, and the edge function never puts a secret in a prompt.
// ──────────────────────────────────────────────────────────────────────────────

import type { RefusalKind } from "./types";

/** Hard input bounds. Cheap, and they cap the cost of an abusive caller. */
export const MAX_QUESTION_LENGTH = 500;
export const MAX_HISTORY_TURNS = 12;

export interface SafetyVerdict {
  ok: boolean;
  refusal?: RefusalKind;
  /** Operator-facing reason. Never shown verbatim to the visitor. */
  reason?: string;
}

const OK: SafetyVerdict = { ok: true };

/**
 * Word-boundary matcher.
 *
 * Substring matching is what makes naive filters useless in both directions:
 * `/key/` fires on "monkey" and refuses a legitimate question, while a filter
 * loose enough to avoid that misses the real one. Every pattern below is
 * anchored, and the false-positive cases are asserted in the test suite.
 */
const hasAny = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((p) => p.test(text));

// ── Credentials and secrets ─────────────────────────────────────────────────
// Note "password" is NOT here on its own: "how do I reset a parent's password"
// is a real support question with a real answer. What is refused is asking the
// assistant to PRODUCE one.
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b(api|service[-\s]?role|secret|private|access|anon)[-\s]?(key|token)s?\b/,
  /\bservice[-\s]?role\b/,
  /\b(supabase|razorpay|aisensy|brevo|meta|whatsapp)\s+(key|token|secret|credential)s?\b/,
  /\benv(ironment)?\s+(var(iable)?s?|file)\b/,
  /\b\.env\b/,
  /\b(show|give|tell|reveal|print|leak|dump|expose|send)\s+(me\s+)?(the\s+|your\s+|all\s+)?(password|passwords|credential|credentials|secret|secrets|token|tokens|api\s?key)/,
  /\b(admin|database|db|root)\s+(password|login|credentials)\b/,
  /\bconnection\s+string\b/,
];

// ── Prompt injection ────────────────────────────────────────────────────────
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+)*(instruction|rule|prompt|direction|guideline)s?\b/,
  /\bdisregard\s+(all\s+|your\s+|the\s+|previous\s+|prior\s+)*(instruction|rule|prompt)s?\b/,
  /\b(system|initial|hidden|original)\s+prompt\b/,
  /\byour\s+(instruction|rule|prompt|system\s+message|guideline)s?\b/,
  /\brepeat\s+(everything|all|the\s+text)\s+above\b/,
  /\b(developer|dev|god|admin|debug|jailbreak|dan)\s+mode\b/,
  /\bpretend\s+(you\s+are|to\s+be)\b/,
  /\bact\s+as\s+(if\s+you\s+|an?\s+)?(unrestricted|uncensored|different|dan\b)/,
  /\byou\s+are\s+no\s+longer\b/,
  /\bnew\s+instructions?\s*:/,
  /\boverride\s+(your\s+)?(safety|rules?|instructions?)\b/,
];

// ── Real people's data ──────────────────────────────────────────────────────
// This assistant has no database connection at all, so these can only ever be
// misunderstandings about what it is. They get a redirect, not a scolding.
const PRIVATE_DATA_PATTERNS: RegExp[] = [
  /\b(show|list|give|get|fetch|find|tell)\s+(me\s+)?(the\s+|all\s+|a\s+)?(student|parent|staff|teacher|employee)s?['’]?\s*(name|phone|number|mobile|email|address|record|detail|data|list|marks?|grade)/,
  /\b(phone|mobile|contact)\s+numbers?\s+of\b/,
  /\b(attendance|marks?|results?|fees?|salary|payroll)\s+(of|for)\s+(a\s+|the\s+)?(specific\s+)?(student|child|teacher|staff|employee)\b/,
  /\bhow\s+much\s+(does|do|did)\s+\w+\s+(owe|pay|earn)\b/,
  /\b(my|his|her|their)\s+child'?s?\s+(marks?|attendance|result|fee)s?\s+(record|report|data)\b/,
  /\blist\s+(all\s+)?(the\s+)?(students?|parents?|teachers?|staff)\b/,
];

// ── Internal architecture ───────────────────────────────────────────────────
// Refused per Phase 18. Not because it is dangerous — most of it is inferable —
// but because it is not product guidance, and answering it well would mean
// documenting the platform's internals to whoever asks.
const INTERNAL_PATTERNS: RegExp[] = [
  /\b(database|db)\s+(table|schema|structure|design|column)s?\b/,
  /\bwhat\s+tables?\b/,
  /\brls\b|\brow[-\s]level\s+security\b/,
  /\bsql\s+(quer|migration|schema|inject)/,
  /\bmigration\s+(file|script)s?\b/,
  /\b(edge\s+function|supabase\s+function)s?\b/,
  /\b(source\s+code|codebase|repository|repo)\b/,
  /\bhow\s+is\s+it\s+(built|coded|implemented|architected)\b/,
  /\b(tech|technology)\s+stack\b/,
  /\bwhat\s+(framework|language|database)\s+(does|do|is)\b/,
  /\btenant\s+(isolation|entitlement)\s+(internal|implementation)/,
];

/**
 * Classify a question.
 *
 * Order matters: credentials before injection (an injection attempt whose GOAL
 * is credentials should be reported as the credential case, which is the more
 * specific and more useful refusal), and both before the softer categories.
 */
export const classifyQuestion = (raw: string): SafetyVerdict => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, refusal: "empty", reason: "blank question" };
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { ok: false, refusal: "too_long", reason: "exceeds input bound" };
  }

  const t = trimmed.toLowerCase();

  if (hasAny(t, CREDENTIAL_PATTERNS)) {
    return { ok: false, refusal: "credentials", reason: "asks for secrets" };
  }
  if (hasAny(t, INJECTION_PATTERNS)) {
    return { ok: false, refusal: "injection", reason: "instruction override" };
  }
  if (hasAny(t, PRIVATE_DATA_PATTERNS)) {
    return { ok: false, refusal: "private_data", reason: "asks for real records" };
  }
  if (hasAny(t, INTERNAL_PATTERNS)) {
    return { ok: false, refusal: "internal_architecture", reason: "internal detail" };
  }
  return OK;
};

/**
 * The visitor-facing copy for a refusal.
 *
 * Written to close the loop rather than end the conversation: each one says
 * what the assistant is, and every caller pairs it with real suggestions. A
 * refusal that leaves someone with nowhere to go is a support ticket.
 *
 * None of these describe the filter that fired. "I can't share that because it
 * matched a credential pattern" is an instruction manual for getting round it.
 */
export const REFUSAL_COPY: Record<RefusalKind, string> = {
  credentials:
    "I can't share credentials, API keys or any private system information — I'm a product guide, and I don't have access to anything like that. I can explain how Smart ARK's features work from a user's point of view.",
  injection:
    "I'm the Smart ARK documentation assistant, and answering questions about Smart ARK is all I do. Ask me about a portal, a module or a workflow and I'll point you at the right guide.",
  private_data:
    "I don't have access to any institution's records — no students, staff, attendance, fees or contact details. I'm a public product guide. If you need your own information, sign in to your institution's portal or contact their office.",
  internal_architecture:
    "Smart ARK handles that internally, and it isn't something I document publicly. If you'd like to understand how the feature works from a user's perspective, I can walk you through the relevant guide.",
  empty: "Ask me anything about Smart ARK — its portals, modules or how a workflow runs.",
  too_long:
    "That's a bit long for me to work with. Could you ask it in a sentence or two? Short, specific questions get the best answer.",
};
