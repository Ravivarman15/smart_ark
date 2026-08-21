# Phase F — where the questions come from

Four routes into one review queue: paste, document, spreadsheet, question bank —
plus writing them by hand. Companion to `ONLINE_TESTS.md` (A/B),
`ONLINE_TESTS_PHASE_C.md` (public link) and `ONLINE_TESTS_PHASE_D.md`
(targeting).

**No migration, and no new parser.** The deterministic document parser
(`paperParser.ts`), the file-to-text extractor (`paperTextExtract.service.ts`)
and the row validator (`mcqImportService.analyze()`) all already existed and are
reused unchanged. What was missing was the way in.

---

## The spreadsheet importer stopped demanding a fixed header

The bulk importer recognised a fixed set of header names and silently ignored
everything else. A teacher whose file said `Q` instead of `question_text`, or
`Ans` instead of `correct`, got a report saying **every row was invalid** — with
no hint that the data was fine and only the header was unfamiliar. The next step
is usually retyping two hundred rows.

The aliases are now a **starting guess**, not a requirement. `autoMap()` matches
generously — `Q`, `Ans`, `Key`, `Choice 1`, `Right Answer` — and anything it
cannot place becomes one dropdown instead of an error to reverse-engineer.

Generosity is safe *here* in a way it would not be inside the importer: every
guess is shown to a person before a single row is read, so a wrong one costs a
click rather than a corrupted question bank.

Two details that matter:

- **A field goes to the FIRST column that claims it.** A sheet with two columns
  called "Answer" would otherwise silently take the last, and which one won
  would be a coin toss nobody saw.
- **Only the first sheet is read**, and the UI says so. Silently concatenating
  every tab is how a workbook with "Notes" and "Instructions" becomes three
  hundred malformed questions.

`applyMapping()` re-emits canonical CSV and hands it to the **existing**
`analyze()`, which already does duplicate detection against the live bank,
answer-key validation and per-row reporting. A second row-validation path would
be a second set of rules about what makes a question valid.

### The preview shows meaning, not shape

A mapping is easy to get subtly wrong — Option C pointed at Option D, the answer
column one to the left — and **every one of those mistakes imports cleanly**. No
row is invalid; the questions are simply wrong, and nobody finds out until
students are marked against them.

So the first rows are rendered **as questions**, laid out the way a student will
see them, with the answer ticked. A grid would only confirm the mapping matches
the file the person is already looking at. The question preview shows what the
mapping *means*.

## A status, not just a percentage

The parser already reported a confidence score and the review screen already
coloured it. But "62%" does not tell a teacher *what to look at*, and it
conflates two situations that are not equally serious:

- "the marks were not printed, so I guessed 1" — a detail to skim
- "I could not find the answer key at all" — unpublishable

`reviewStatus.ts` gives one verdict per question:

| Status | Meaning | Blocks publishing |
|---|---|---|
| `ready` | nothing to check | no |
| `needs_review` | readable, but something was guessed | no |
| `answer_unknown` | auto-graded type with no usable key | **yes** |
| `parse_failed` | not recoverable as a question | **yes** |

**A high confidence score cannot wave a missing answer past.** Confidence is
about the *wording*; a 99%-confident question with no key is still unanswerable,
so `answer_unknown` is its own status with its own blocker.

`hasUsableAnswer()` mirrors what `gradeAnswer()` actually reads per type — which
catches a failure that is otherwise invisible: **two options marked correct on a
single-correct question.** The grader compares sets exactly, so every student
scores zero on it, and it looks like a hard question rather than a broken one.

An empty paper is refused too. A test with no questions is a more obvious
mistake than a broken one, and just as worth refusing.

## What is not claimed

The document parser is **deterministic and local** — no model, no API key, no
per-paper cost — and it never invents an answer key. There is **no OCR in this
stack**: a scanned PDF has no text layer, and the extractor says so rather than
returning empty questions that look like a parsing bug. When a clean read yields
zero questions, the UI names the likely cause instead of reporting "0 found" and
sending someone hunting for a bug that is not there.

## Verification

| | |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | **518** (baseline 532) |
| `eslint .` | **318** (15 errors, 303 warnings) — baseline |
| `vitest run` | **2,791 passed**, 3 failing — see below |
| `vite build` | PASS |
| `tenant-write-audit.mjs` | 36 scanned, **0 violations** |
| new tests | **34**, covering mapping, answer-key validity and publish blocking |

### Three failures that are not from this work

`docsCoverage` (×2) and `assistant` (×1) fail against the **uncommitted**
`src/features/docs/content/modules.ts` — 385 lines of new documentation articles
added in parallel with this work. Proven by stashing that one file: all **104**
tests in those two suites then pass, and it was restored untouched.

What each needs, none of which is a code change:

1. **`exams-overview` documents `exam.report_card`**, which the inventory marks
   ASPIRATIONAL — the submodule id exists in the catalog but nothing mounts a
   route for it. `ReportCardDialog.tsx` is a dialog, not a page. Either remove
   the permission from the article or ship a route for it.
2. **Four screenshots are referenced but not registered**: `exam-dashboard`,
   `smart-mark-entry`, `online-tests-dashboard`, and one more. Registering them
   without capturing the images would make a *different* gate lie — there is a
   provenance check that a published screenshot was really captured and passed
   privacy review — so these need real captures, not registry rows.
3. **The assistant test expects a teacher's search to surface `exams-overview`**
   and the ranking does not put it there yet.

One thing here *was* mine and is fixed: `docs/generated/documentation-inventory.json`
was regenerated (`node scripts/docs-inventory.mjs`) so `exam.online_tests`
resolves as SHIPPED. Without that, the new article's permission reference failed
the gate.

## Still not built

- **Phase E**: the create-test wizard shell. The pieces it would sequence now
  exist; what is missing is the stepper and draft-saving around them.
- **Phase G**: the question review workspace with the live student preview
  beside it. `reviewStatus.ts` is the model it needs; the split-pane screen is
  not built.
- **Phases I, J**: subjective marking (which would finally consume
  `pending_review`) and the analytics dashboards.

`QuestionSourcePicker` and `ColumnMappingStep` are built and type-check but are
**not yet mounted into a page** — they are wired in Phase E, and until then no
route renders them. Marked here rather than described as available.
