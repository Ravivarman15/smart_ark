// ═════════════════════════════════════════════════════════════════════════════
// SPREADSHEET COLUMN MAPPING — "your column → our field"
//
// ┌── WHAT WAS WRONG WITH REQUIRING A FIXED HEADER ────────────────────────┐
// │ The bulk importer recognised a fixed set of header names and silently  │
// │ ignored everything else. A teacher whose file says "Q" instead of      │
// │ "question_text", or "Ans" instead of "correct", got a report saying    │
// │ every row was invalid — with no hint that the DATA was fine and only   │
// │ the header was unfamiliar. The usual next step is to retype 200 rows.  │
// │                                                                        │
// │ So the aliases become a STARTING GUESS rather than a requirement, and  │
// │ anything unrecognised becomes a question the person can answer in one  │
// │ dropdown instead of an error they have to reverse-engineer.            │
// └────────────────────────────────────────────────────────────────────────┘
//
// Pure functions. `applyMapping` re-emits the sheet as CSV with canonical
// headers, so the existing, already-tested `mcqImportService.analyze()` keeps
// doing all the row validation — duplicate detection against the live bank,
// answer-key validity, per-row error reporting. This module only decides which
// column means what.
// ═════════════════════════════════════════════════════════════════════════════

/** A field the importer understands. `null` in a mapping means "ignore". */
export type CanonicalField =
  | "question_text"
  | "question_type"
  | "subject"
  | "chapter"
  | "topic"
  | "difficulty"
  | "marks"
  | "negative_marks"
  | "option_a"
  | "option_b"
  | "option_c"
  | "option_d"
  | "option_e"
  | "correct"
  | "tolerance"
  | "explanation";

export interface FieldDef {
  id: CanonicalField;
  label: string;
  /** Without these the row cannot become a question at all. */
  required?: boolean;
  hint?: string;
}

export const CANONICAL_FIELDS: FieldDef[] = [
  { id: "question_text", label: "Question", required: true },
  { id: "correct", label: "Correct answer", required: true, hint: "A letter like B, or A,C for multiple. A number for numerical questions." },
  { id: "option_a", label: "Option A" },
  { id: "option_b", label: "Option B" },
  { id: "option_c", label: "Option C" },
  { id: "option_d", label: "Option D" },
  { id: "option_e", label: "Option E" },
  { id: "question_type", label: "Question type", hint: "Defaults to single-correct when the column is absent." },
  { id: "marks", label: "Marks" },
  { id: "negative_marks", label: "Negative marks" },
  { id: "difficulty", label: "Difficulty" },
  { id: "subject", label: "Subject" },
  { id: "chapter", label: "Chapter" },
  { id: "topic", label: "Topic" },
  { id: "explanation", label: "Explanation" },
  { id: "tolerance", label: "Tolerance", hint: "Numerical questions only — how far off still counts as correct." },
];

const REQUIRED: CanonicalField[] = CANONICAL_FIELDS.filter((f) => f.required).map(
  (f) => f.id,
);

/**
 * Header text → field, for the automatic first guess.
 *
 * Deliberately generous, and generosity is safe HERE in a way it would not be
 * in the importer: every guess is shown to a person before a single row is
 * read, so a wrong one costs a dropdown rather than a corrupted question bank.
 */
const ALIASES: Record<string, CanonicalField> = {
  question: "question_text", questiontext: "question_text", q: "question_text",
  qtext: "question_text", text: "question_text", problem: "question_text",
  statement: "question_text", questions: "question_text",

  type: "question_type", questiontype: "question_type", qtype: "question_type",
  kind: "question_type",

  correct: "correct", answer: "correct", correctanswer: "correct",
  ans: "correct", key: "correct", answerkey: "correct", correctoption: "correct",
  rightanswer: "correct", solution: "correct",

  optiona: "option_a", a: "option_a", opta: "option_a", choice1: "option_a", choicea: "option_a",
  optionb: "option_b", b: "option_b", optb: "option_b", choice2: "option_b", choiceb: "option_b",
  optionc: "option_c", c: "option_c", optc: "option_c", choice3: "option_c", choicec: "option_c",
  optiond: "option_d", d: "option_d", optd: "option_d", choice4: "option_d", choiced: "option_d",
  optione: "option_e", e: "option_e", opte: "option_e", choice5: "option_e", choicee: "option_e",

  marks: "marks", mark: "marks", score: "marks", points: "marks", weightage: "marks",
  negativemarks: "negative_marks", negative: "negative_marks", penalty: "negative_marks",

  difficulty: "difficulty", level: "difficulty", complexity: "difficulty",
  subject: "subject", chapter: "chapter", unit: "chapter", lesson: "chapter",
  topic: "topic", concept: "topic",
  explanation: "explanation", reason: "explanation", solutiontext: "explanation",
  tolerance: "tolerance", margin: "tolerance",
};

/** Strip everything that varies between two spellings of the same header. */
export const normaliseHeader = (h: string): string =>
  h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A mapping from source column INDEX to canonical field (or null to ignore). */
export type ColumnMapping = (CanonicalField | null)[];

/**
 * The automatic first guess.
 *
 * A field is claimed by the FIRST column that matches it. A sheet with two
 * columns both called "Answer" would otherwise silently take the last one, and
 * whichever it picked would be a coin toss the user never saw.
 */
export const autoMap = (headers: string[]): ColumnMapping => {
  const taken = new Set<CanonicalField>();
  return headers.map((h) => {
    const field = ALIASES[normaliseHeader(h)];
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
};

export interface MappingProblem {
  kind: "missing_required" | "duplicate" | "no_options";
  field?: CanonicalField;
  message: string;
}

/**
 * Is this mapping usable?
 *
 * Checks the MAPPING, not the data — row-level validation stays in
 * `mcqImportService.analyze()`, which already does it well. Two different jobs:
 * this one answers "have you told us which column is which?", that one answers
 * "is row 47 a valid question?".
 */
export const validateMapping = (mapping: ColumnMapping): MappingProblem[] => {
  const problems: MappingProblem[] = [];
  const counts = new Map<CanonicalField, number>();
  for (const f of mapping) {
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  for (const field of REQUIRED) {
    if (!counts.has(field)) {
      const label = CANONICAL_FIELDS.find((f) => f.id === field)?.label ?? field;
      problems.push({
        kind: "missing_required",
        field,
        message: `Nothing is mapped to “${label}”. Pick the column that holds it.`,
      });
    }
  }

  for (const [field, n] of counts) {
    if (n > 1) {
      const label = CANONICAL_FIELDS.find((f) => f.id === field)?.label ?? field;
      problems.push({
        kind: "duplicate",
        field,
        message: `${n} columns are mapped to “${label}”. Only one can be.`,
      });
    }
  }

  // A choice question with no options cannot be answered, and "correct: B" with
  // no B is the shape that produces a bank full of unanswerable questions.
  const hasAnyOption = (["option_a", "option_b", "option_c", "option_d", "option_e"] as const).some(
    (o) => counts.has(o),
  );
  if (!hasAnyOption) {
    problems.push({
      kind: "no_options",
      message:
        "No option columns are mapped. Unless every question is numerical or a typed answer, map at least Option A and Option B.",
    });
  }

  return problems;
};

/**
 * The order columns are EMITTED in, which is deliberately not the order
 * `CANONICAL_FIELDS` lists them.
 *
 * That list is ordered for the mapping SCREEN — the two required fields first,
 * so a person sees what they must answer before what they may. The emitted CSV
 * is read by machines and by anyone debugging an import, and there the natural
 * order is the one a question actually has: text, its options, then the answer.
 * Keeping them apart means neither has to compromise for the other.
 */
const EMIT_ORDER: CanonicalField[] = [
  "question_text",
  "question_type",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct",
  "tolerance",
  "marks",
  "negative_marks",
  "difficulty",
  "subject",
  "chapter",
  "topic",
  "explanation",
];

/** CSV-escape one cell. */
const cell = (v: string): string =>
  /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * Re-emit the sheet as canonical CSV.
 *
 * Deliberately funnels back into the EXISTING importer rather than building a
 * second row-validation path. `analyze()` already handles duplicate detection
 * against the live bank, answer-key validity, type aliases and per-row error
 * reporting; a parallel implementation would be a second set of rules about
 * what makes a question valid.
 */
export const applyMapping = (
  rows: string[][],
  mapping: ColumnMapping,
): string => {
  const used = EMIT_ORDER.filter((id) => mapping.includes(id));
  const out: string[] = [used.join(",")];

  for (const row of rows) {
    const values = used.map((field) => {
      const idx = mapping.indexOf(field);
      return cell((row[idx] ?? "").trim());
    });
    // A row with nothing in the question column is a blank line, a footer, or
    // the gap someone left between sections. Emitting it would produce an
    // "invalid row" for something that was never a question.
    const qIdx = used.indexOf("question_text");
    if (qIdx === -1 || !values[qIdx] || values[qIdx] === '""') continue;
    out.push(values.join(","));
  }

  return out.join("\n");
};

/** First N data rows, for the "does this look right?" preview. */
export const previewRows = (
  rows: string[][],
  mapping: ColumnMapping,
  limit = 5,
): { field: CanonicalField; value: string }[][] =>
  rows.slice(0, limit).map((row) =>
    mapping
      .map((field, i) => (field ? { field, value: (row[i] ?? "").trim() } : null))
      .filter(Boolean) as { field: CanonicalField; value: string }[],
  );
