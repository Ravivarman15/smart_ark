# Phases E, G, I, J — the wizard, the review workspace, marking, analytics

Companion to `ONLINE_TESTS.md` (A/B), `ONLINE_TESTS_PHASE_C.md` (public link),
`ONLINE_TESTS_PHASE_D.md` (targeting) and `ONLINE_TESTS_PHASE_F.md` (imports).

---

# Phase I — the dead end, closed

The Phase A audit found that the grader flags subjective answers
`pending_review`, sets `awaiting_evaluation` on the attempt, and deliberately
leaves `is_pass` NULL — because a percentage missing six marks cannot decide a
pass. **Nothing had ever read either flag.** An attempt containing one essay
stayed provisional forever and no screen offered a way to finish it.

Refusing to invent a mark was right. Providing nowhere to enter the real one was
the half that was missing.

## Settling re-sums; it never re-grades

The tidy-looking implementation is to call `gradeAndPersist()` after a mark
lands. It is wrong, and quietly: `gradeAttempt()` recomputes **every** answer
from the answer key, so it overwrites the mark a human just entered with the
zero the machine assigns to an essay it cannot read. The teacher's decision
would survive exactly until the next essay on the same paper was marked.

`settleAttempt()` therefore re-sums from the **stored per-answer marks**, which
is the only representation holding both kinds of decision at once. Auto-graded
answers are not touched.

`is_pass` stays NULL while anything is unmarked and settles the moment the last
mark arrives — not by a scheduled job that might never run.

## Marking did not reopen the score-tampering hole

The obvious way to let a teacher write a mark is an UPDATE policy scoped to
staff. That hands every signed-in teacher a browser `PATCH` on any answer in the
organization, including the auto-graded ones — the hole Phase B closed, reopened
for the convenience of one screen.

So `20261017` **adds no policy at all**. It adds three provenance columns and
two indexes, and it *asserts* the tables are still SELECT-only, so a later
migration that quietly adds a write policy fails in the migration rather than
being discovered by a student.

The mark is written by `online-test` under the service role, after
`requireStaff()` has verified the caller. It is clamped to `[0, max_marks]`:
above the maximum silently breaks every percentage that divides by it, and below
zero imports the auto-grader's negative-marking rule into a human judgement
where it does not belong.

## The queue is oldest-first

A student waiting three days should not be overtaken by one who submitted this
morning — which is what any newest-first or grouped-by-exam ordering quietly
does. "Skip for now" keeps the answer in the queue; a skip that removed it would
lose the answer.

## Verified live, then torn down

A real attempt driven through the deployed public endpoint — one auto-graded
question and one essay — in the `testing` tenant:

| | |
|---|---|
| **Before marking** | `score=4.00  is_pass=NULL  awaiting=true  pending=6.00` |
| Signed-in teacher marks the answer from a browser | **PASS — 0 rows** |
| Signed-in teacher rewrites the attempt total | **PASS — 0 rows** |
| **After marking (service role)** | `score=9.00  is_pass=true  awaiting=false  pending=0.00` |
| Auto-graded answer after settling | **PASS — still 4** |

Mutation-tested: allowing a re-mark of an auto-graded answer, failing unmarked
papers, removing the clamp, and adding a staff write policy each fail the gates.

---

# Phase G — review, with the student's view beside it

`QuestionReviewWorkspace` is a three-pane screen: the question list with a
status dot, the editor, and **the student's view updating as you type**.

A "Preview" button would open a modal, the teacher would glance at question one,
close it, and never look again. The mistakes that matter — a blank option, a
stem that lost its second half, the wrong option ticked — are visible in exactly
one place: the question rendered the way a student meets it.

The preview is deliberately the **same shape the real engine renders**: no
answer key, no explanation, no tick. A preview showing more than the student
sees is not a preview of anything. Desktop / tablet / mobile widths, because a
question that fits on a laptop and wraps badly on a phone is a question half the
class answers badly.

Clicking a correct option on a single-correct question **clears the others**.
Toggling without clearing is how a paper ends up with two correct options and
grades every student zero — the failure `hasUsableAnswer()` catches, made
impossible to create in the first place.

Publishing is blocked on `answer_unknown` and `parse_failed`, never on
`needs_review`. Forbidding a low-confidence question would train people to click
past the warning that actually matters.

---

# Phase E — the wizard

Four steps: **Add questions → Review → Who gets it → Publish.**

It sequences work that already exists — the Phase F sources, the Phase G
workspace, the Phase D selector — and builds nothing of its own. A wizard that
reimplements a step is a second place for that step to be wrong.

A step is reachable only once what it depends on is done, and a **backward jump
is always allowed**: revisiting a decision must never cost the work after it. A
stepper that lets you jump to "Publish" from step one has to answer "publish
what?", and the honest answer is a validation error — which teaches people the
numbers are decorative.

A mapped spreadsheet goes through the **existing** `mcqImportService.analyze()`.
Rows it rejects are reported with their count, not silently dropped.

## What the last step says out loud

**Saving from the wizard is not wired up.** The paper and exam rows are still
created by Create MCQ Paper / Create MCQ Exam, which already do it correctly.
Rather than ship a Publish button that appears to work, the final step says so,
warns that leaving loses the draft, and links to the screens that do persist.

This is the one place in this work where a UI exists ahead of its backing, and
it is labelled in the product, not only here.

---

# Phase J — the analytics that were missing

`mcqExamAnalytics.service.ts` already covered averages, accuracy, toppers,
leaderboard, section performance and per-question difficulty. It could not
answer **"how many did not sit it"**, because nothing there knows who was
assigned.

`utils/testAnalytics.ts` adds that layer as pure functions over rows the caller
already has. Nothing is fabricated: a statistic with no data behind it returns
**null, never 0** — "nobody has sat this yet" and "everybody scored nothing" are
opposite facts and must not render identically.

**The number that is always wrong if you guess** is the average over submitted
attempts. A test where eight strong students turned up and thirty did not shows
a splendid mean and hides the actual result. So:

- participation is reported first and separately;
- `scoreSpread` returns `basis` — how many papers the average is actually over;
- papers awaiting a teacher are **excluded** from the average and from the
  distribution. Filing an unmarked essay in the 0–20% band libels the student;
- participants are counted by **student**, not by attempt row, or a
  multi-attempt test overstates turnout;
- a public link returns `assigned: null`, so participation reads "not
  applicable" rather than inventing a rate against a roster that does not apply.

Per-question accuracy is over **attempted** answers, with skips reported beside
it. A question thirty students skipped and two answered correctly is 100%
accurate and almost certainly a disaster.

Cohort comparison carries `basis` on every row: a batch with one finished paper
is not top of the class, and a league table built on n=1 is worse than none.

---

## Registration

Two new submodules, each in all four registries plus explicit `App.tsx` routes
(`renderSharedRoutes` covers coordinator and teacher only):

| Submodule | Page |
|---|---|
| `exam.online_tests` | dashboard **and** the create wizard |
| `exam.evaluate` | Mark Written Answers |

The wizard shares `exam.online_tests` on purpose — a separate submodule would
let an admin grant the list and withhold the button on it.

`docs/generated/documentation-inventory.json` regenerated so both resolve as
SHIPPED.

## Verification

| | |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | **518** (baseline 532) |
| `eslint .` | **318** (15 errors, 303 warnings) — baseline |
| `vitest run` | **2,833 passed**, +42 this phase |
| `vite build` | PASS, 44s |
| `tenant-write-audit.mjs` | 36 scanned, **0 violations** |
| `registryAudit` + `routeMounts` | PASS |
| ARK baseline | 335 / 1,488 / 21 / 138 — **unchanged** |
| Migration `20261017` | applied, run twice for idempotency |
| Edge function `online-test` | redeployed |

### Three failures that are not from this work

`docsCoverage` (×2) and `assistant` (×1) fail against the **uncommitted**
`src/features/docs/content/modules.ts`. Proven by stashing that one file: all
104 tests in those suites then pass. Unchanged from the Phase F report — see
`ONLINE_TESTS_PHASE_F.md` for what each needs.

## Not built

- **Persisting from the wizard** — labelled in the product, above.
- Analytics UI: `testAnalytics.ts` is tested and ready; the dashboard that
  renders it is not built. The existing monitor page is unchanged.
- Rank/percentile already exists in `mcqExamAnalytics`; nothing was added.
