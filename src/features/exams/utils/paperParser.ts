import type {
  BloomLevel, McqDifficulty, McqQuestionType,
} from "../types/mcq.types";

// ═════════════════════════════════════════════════════════════════════════════
// Question-paper parser — deterministic, local, free.
//
// Turns the raw text of a question paper into structured questions. No API, no
// key, no per-paper cost, works offline. Pure functions only — every rule here
// is unit-testable and inspectable, which is also why it is honest about what
// it does NOT know.
//
// THE CONTRACT WITH THE REVIEW SCREEN:
//   `confidence` is not decoration. Every fact the parser could not read from
//   the paper — a missing mark, an absent answer key, an ambiguous type —
//   deducts from it. The review screen shows anything under 75% to a human.
//   So a well-formed paper flows through untouched, and a messy one surfaces
//   exactly the questions a teacher needs to look at. The parser is never
//   allowed to invent an answer and present it as fact.
//
// WHAT IS A HEURISTIC (say so out loud):
//   • Bloom level comes from the question's action verb ("define" → remember,
//     "justify" → evaluate). That IS the standard definition of Bloom's, so
//     it's defensible — but it's a keyword rule, not comprehension.
//   • Difficulty is inferred from marks + Bloom level. It is a starting guess
//     a teacher can override, not a judgement about the question.
//   Both are flagged in confidence when the paper gives no signal at all.
// ═════════════════════════════════════════════════════════════════════════════

export interface ParsedQuestion {
  questionNo: string;
  section: string;
  questionText: string;
  questionType: McqQuestionType;
  marks: number;
  negativeMarks: number;
  chapter: string;
  topic: string;
  difficulty: McqDifficulty;
  bloomLevel: BloomLevel;
  tags: string[];
  options: { text: string; isCorrect: boolean }[];
  numericalAnswer?: number;
  numericalTolerance?: number;
  answerText: string;
  matchPairs: { left: string; right: string }[];
  subQuestions: { label: string; text: string; marks: number }[];
  explanation: string;
  hasFormula: boolean;
  confidence: number;
  sourceText: string;
}

export interface ParsedPaperMeta {
  examName: string;
  subject: string;
  standard: string;
  section: string;
  board: string;
  academicYear: string;
  term: string;
  month: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string;
}

export interface ParsedPaper {
  meta: ParsedPaperMeta;
  questions: ParsedQuestion[];
}

// ── Patterns ────────────────────────────────────────────────────────────────
/** "1." "1)" "Q1." "Q.1" "(1)" — the start of a new question. */
const RE_QUESTION_START = /^\s*(?:Q\s*\.?\s*)?\(?(\d{1,3})\)?\s*[.)\]:-]\s*(.+)$/i;
/** "(a) text" "A. text" "a) text" — an answer option. */
const RE_OPTION = /^\s*\(?([a-eA-E])\)?\s*[.)\]]\s*(.+)$/;
/** "PART A" / "SECTION B" / "PART - III" */
const RE_SECTION = /^\s*(?:PART|SECTION)\s*[-–:]?\s*([A-Z0-9IVX]+)\b/i;
/** "[3]" "(2 marks)" "5 marks" "- 4M" */
const RE_MARKS = /\[\s*(\d+(?:\.\d+)?)\s*\]|\(\s*(\d+(?:\.\d+)?)\s*(?:marks?|mks?|m)\s*\)|(\d+(?:\.\d+)?)\s*marks?\b/i;
/** "Ans: B" / "Answer - photosynthesis" */
const RE_INLINE_ANSWER = /^\s*Ans(?:wer)?\s*[:\-–]\s*(.+)$/i;
/** Where the answer key section begins. */
const RE_ANSWER_KEY_HEADER = /^\s*(?:answer\s*key|answers)\s*[:\-–]?\s*$/i;
/** "1. B" / "1 - B" / "1) photosynthesis" inside an answer key. */
const RE_KEY_LINE = /^\s*\(?(\d{1,3})\)?\s*[.):\-–]\s*(.+)$/;
/** A fill-in-the-blank. */
const RE_BLANK = /_{3,}|\.{4,}/;
/** "A - 3" style match pairs. */
const RE_MATCH_PAIR = /^\s*\(?([a-zA-Z0-9]{1,3})\)?\s*[).\-–:]\s*(.+?)\s*[-–—:]\s*(.+)$/;

// Bloom's taxonomy IS defined by its action verbs — this table is the standard
// mapping, checked longest-first so "critically evaluate" beats "evaluate".
const BLOOM_VERBS: [BloomLevel, string[]][] = [
  ["create", ["design", "construct", "compose", "devise", "formulate", "invent", "develop a", "propose"]],
  ["evaluate", ["evaluate", "justify", "critique", "assess", "argue", "defend", "judge", "recommend", "comment on"]],
  ["analyze", ["analyse", "analyze", "compare", "contrast", "differentiate", "distinguish", "examine", "investigate", "classify"]],
  ["apply", ["calculate", "solve", "compute", "apply", "demonstrate", "illustrate", "use the", "find the value", "determine"]],
  ["understand", ["explain", "describe", "summarise", "summarize", "interpret", "discuss", "why", "give reason"]],
  ["remember", ["define", "list", "name", "state", "recall", "identify", "write the", "what is", "who", "when", "mention"]],
];

const PROGRAMMING_HINTS = ["write a program", "pseudocode", "algorithm", "output of the code", "function that", "sql query"];
const DIAGRAM_HINTS = ["draw", "diagram", "label the", "sketch", "flowchart"];
const CASE_STUDY_HINTS = ["case study", "read the passage", "read the following", "based on the above"];
const ESSAY_HINTS = ["essay", "in detail", "elaborate"];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// ── Paper metadata ──────────────────────────────────────────────────────────
export function parseMeta(text: string): ParsedPaperMeta {
  // Metadata lives in the header — searching the whole paper would match a
  // question that happens to mention "time" or "marks".
  const head = text.split(/\r?\n/).slice(0, 30).join("\n");

  const grab = (re: RegExp): string => head.match(re)?.[1]?.trim() ?? "";

  const durationRaw = grab(/(?:time|duration)\s*(?:allowed)?\s*[:\-–]?\s*([^\n]+)/i);
  let durationMinutes = 0;
  if (durationRaw) {
    const hours = durationRaw.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    const mins = durationRaw.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
    durationMinutes =
      (hours ? Math.round(parseFloat(hours[1]) * 60) : 0) + (mins ? parseInt(mins[1], 10) : 0);
  }

  const totalMarksRaw = grab(
    /(?:maximum|max\.?|total)\s*marks?\s*[:\-–]?\s*(\d+(?:\.\d+)?)/i,
  );

  // Instructions run from the "General Instructions" heading to the first question.
  let instructions = "";
  const insMatch = text.match(
    /general\s+instructions?\s*[:\-–]?\s*([\s\S]{0,800}?)(?=\n\s*(?:Q\s*\.?\s*)?1\s*[.)]|\n\s*(?:PART|SECTION)\b)/i,
  );
  if (insMatch) instructions = clean(insMatch[1]);

  return {
    examName: grab(/^(?:.*?)(?:examination|exam|test|assessment)\s*[:\-–]?\s*([^\n]+)/im)
      || grab(/^\s*([^\n]*(?:examination|exam|test)[^\n]*)$/im),
    subject: grab(/subject\s*[:\-–]\s*([^\n,(]+)/i),
    standard: grab(/(?:class|standard|grade|std)\s*[:\-–]?\s*([IVXLC\d]+\s*[-–]?\s*[A-Z]?)/i),
    section: "",
    board: grab(/\b(CBSE|ICSE|ISC|IB|IGCSE|State Board|NCERT)\b/i),
    academicYear: grab(/(20\d{2}\s*[-–/]\s*(?:20)?\d{2})/),
    term: grab(/\b(?:term|semester)\s*[:\-–]?\s*([IVX\d]+|one|two)/i),
    month: grab(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i),
    durationMinutes,
    totalMarks: totalMarksRaw ? parseFloat(totalMarksRaw) : 0,
    instructions,
  };
}

// ── Answer key ──────────────────────────────────────────────────────────────
/**
 * Many papers put the key at the bottom. Pull it out FIRST so those lines are
 * never mistaken for questions, and return it as questionNo → answer.
 */
export function extractAnswerKey(text: string): {
  body: string;
  key: Map<string, string>;
} {
  const lines = text.split(/\r?\n/);
  const keyStart = lines.findIndex((l) => RE_ANSWER_KEY_HEADER.test(l));
  if (keyStart === -1) return { body: text, key: new Map() };

  const key = new Map<string, string>();
  for (const line of lines.slice(keyStart + 1)) {
    // "1. B  2. C  3. A" — several answers can share one line.
    const inline = [...line.matchAll(/\(?(\d{1,3})\)?\s*[.):\-–]\s*([A-Ea-e]|[^\s,;]+)/g)];
    if (inline.length > 1) {
      inline.forEach((m) => key.set(m[1], clean(m[2])));
      continue;
    }
    const m = line.match(RE_KEY_LINE);
    if (m) key.set(m[1], clean(m[2]));
  }

  return { body: lines.slice(0, keyStart).join("\n"), key };
}

// ── Classification ──────────────────────────────────────────────────────────
export function detectBloom(text: string): { level: BloomLevel; matched: boolean } {
  const lower = text.toLowerCase();
  for (const [level, verbs] of BLOOM_VERBS) {
    if (verbs.some((v) => lower.includes(v))) return { level, matched: true };
  }
  return { level: "understand", matched: false };
}

/** Marks and cognitive load are the only difficulty signals a text file carries. */
export function inferDifficulty(marks: number, bloom: BloomLevel): McqDifficulty {
  const hardBloom = bloom === "analyze" || bloom === "evaluate" || bloom === "create";
  if (marks >= 5 || hardBloom) return "hard";
  if (marks >= 3 || bloom === "apply") return "medium";
  return "easy";
}

interface TypeVerdict {
  type: McqQuestionType;
  /** false ⇒ the paper gave no clear signal and we fell back to a default. */
  confident: boolean;
}

export function detectType(
  body: string,
  optionCount: number,
  marks: number,
): TypeVerdict {
  const lower = body.toLowerCase();

  if (/assertion\b/.test(lower) && /reason\b/.test(lower)) {
    return { type: "assertion_reason", confident: true };
  }
  if (/match\s+the\s+following|match\s+column/i.test(lower)) {
    return { type: "match_following", confident: true };
  }

  if (optionCount >= 2) {
    const isTF =
      optionCount === 2 && /\btrue\b/.test(lower) && /\bfalse\b/.test(lower);
    if (isTF) return { type: "true_false", confident: true };
    // "select all that apply" / "choose the correct options" ⇒ multiple.
    const multi = /select all|choose all|more than one|all that apply/i.test(lower);
    return { type: multi ? "multiple" : "single", confident: true };
  }

  if (/state whether.*true or false|true or false/i.test(lower)) {
    return { type: "true_false", confident: true };
  }
  if (RE_BLANK.test(body) || /fill in the blank/i.test(lower)) {
    return { type: "fill_ups", confident: true };
  }
  if (PROGRAMMING_HINTS.some((h) => lower.includes(h))) {
    return { type: "programming", confident: true };
  }
  if (DIAGRAM_HINTS.some((h) => lower.includes(h))) {
    return { type: "diagram", confident: true };
  }
  if (CASE_STUDY_HINTS.some((h) => lower.includes(h))) {
    return { type: "case_study", confident: true };
  }
  if (ESSAY_HINTS.some((h) => lower.includes(h)) || marks >= 8) {
    return { type: "essay", confident: true };
  }
  if (/calculate|compute|find the value|solve for/i.test(lower)) {
    return { type: "numerical", confident: true };
  }

  // No structural signal: fall back on length. Flagged as unconfident so the
  // teacher is asked, rather than us pretending we knew.
  if (marks >= 5) return { type: "long_answer", confident: false };
  if (marks >= 3) return { type: "short_answer", confident: false };
  return { type: "one_word", confident: false };
}

// ── The parser ──────────────────────────────────────────────────────────────
export function parsePaper(text: string): ParsedPaper {
  const meta = parseMeta(text);
  const { body, key } = extractAnswerKey(text);

  const lines = body.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];

  let section = "";
  let current: { no: string; section: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const parsed = buildQuestion(current.no, current.section, current.lines, key);
    if (parsed) questions.push(parsed);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, " ");
    if (!line.trim()) {
      if (current) current.lines.push("");
      continue;
    }

    const sec = line.match(RE_SECTION);
    if (sec && line.trim().length < 40) {
      flush();
      section = `Part ${sec[1].toUpperCase()}`;
      continue;
    }

    const start = line.match(RE_QUESTION_START);
    // An option line ("(a) ...") also matches a numbered start when it uses
    // digits — so only treat it as a new question if we're not mid-question or
    // the line doesn't look like an option.
    if (start && !RE_OPTION.test(line)) {
      flush();
      current = { no: start[1], section, lines: [start[2]] };
      continue;
    }

    if (current) current.lines.push(line);
  }
  flush();

  return { meta, questions };
}

function buildQuestion(
  no: string,
  section: string,
  rawLines: string[],
  key: Map<string, string>,
): ParsedQuestion | null {
  const sourceText = rawLines.join("\n").trim();
  if (!sourceText) return null;

  const options: { text: string; isCorrect: boolean }[] = [];
  const matchPairs: { left: string; right: string }[] = [];
  const stemLines: string[] = [];
  let inlineAnswer = "";

  for (const line of rawLines) {
    const ans = line.match(RE_INLINE_ANSWER);
    if (ans) { inlineAnswer = clean(ans[1]); continue; }

    const opt = line.match(RE_OPTION);
    if (opt) { options.push({ text: clean(opt[2]), isCorrect: false }); continue; }

    stemLines.push(line);
  }

  const stem = clean(stemLines.join(" "));
  if (!stem) return null;

  // Marks: read from the stem, then strip the marker out of the question text.
  const marksMatch = sourceText.match(RE_MARKS);
  const marksFound = !!marksMatch;
  const marks = marksFound
    ? parseFloat(marksMatch![1] ?? marksMatch![2] ?? marksMatch![3])
    : 1;

  const questionText = clean(stem.replace(RE_MARKS, "")).replace(/\s*[-–]\s*$/, "");

  const verdict = detectType(sourceText, options.length, marks);
  let type = verdict.type;

  if (type === "match_following") {
    for (const line of stemLines) {
      const m = line.match(RE_MATCH_PAIR);
      if (m) matchPairs.push({ left: clean(m[2]), right: clean(m[3]) });
    }
  }

  // ── Answer key resolution ────────────────────────────────────────────────
  const answer = key.get(no) || inlineAnswer;
  let answerText = "";
  let numericalAnswer: number | undefined;
  let answerResolved = false;

  if (answer) {
    if (options.length > 0) {
      // "B" or "A,C" → tick the matching options.
      const letters = answer
        .split(/[,\s/]+/)
        .map((s) => s.trim().replace(/[.)]/g, ""))
        .filter((s) => /^[a-eA-E]$/.test(s));

      if (letters.length > 0) {
        letters.forEach((l) => {
          const idx = l.toUpperCase().charCodeAt(0) - 65;
          if (options[idx]) options[idx].isCorrect = true;
        });
        answerResolved = options.some((o) => o.isCorrect);
        if (letters.length > 1 && type === "single") type = "multiple";
      } else {
        // The key gave the answer's text rather than its letter.
        const hit = options.findIndex(
          (o) => o.text.toLowerCase() === answer.toLowerCase(),
        );
        if (hit >= 0) { options[hit].isCorrect = true; answerResolved = true; }
      }
    } else if (type === "numerical") {
      const n = parseFloat(answer.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) { numericalAnswer = n; answerResolved = true; }
      answerText = answer;
    } else {
      answerText = answer;
      answerResolved = true;
    }
  }

  const { level: bloomLevel, matched: bloomMatched } = detectBloom(questionText);
  const difficulty = inferDifficulty(marks, bloomLevel);

  // ── Confidence: subtract for everything we could NOT read ────────────────
  let confidence = 100;
  const needsKey = ["single", "multiple", "true_false", "assertion_reason", "numerical", "fill_ups", "one_word", "match_following"]
    .includes(type);

  if (!marksFound) confidence -= 25;             // marks were guessed at 1
  if (needsKey && !answerResolved) confidence -= 35; // no answer key = unusable for auto-grading
  if (!verdict.confident) confidence -= 20;      // type was a fallback
  if (options.length === 1) confidence -= 25;    // a lone option means we mis-split
  if (type === "match_following" && matchPairs.length === 0) confidence -= 20;
  if (questionText.length < 15) confidence -= 20;
  if (!bloomMatched) confidence -= 5;            // bloom defaulted; minor
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    questionNo: no,
    section,
    questionText,
    questionType: type,
    marks,
    negativeMarks: 0,
    chapter: "",
    topic: "",
    difficulty,
    bloomLevel,
    tags: [],
    options,
    numericalAnswer,
    numericalTolerance: numericalAnswer !== undefined ? 0 : undefined,
    answerText,
    matchPairs,
    subQuestions: [],
    explanation: "",
    hasFormula: /[=∑√±×÷]|\^\d|\bx\s*\^/.test(sourceText),
    confidence,
    sourceText,
  };
}
