# Online Tests — audit findings and the security repair

Phase A (architecture audit) and Phase B (security) of the Online Tests work.
Phases C–J are not built.

---

## What the audit found

**An online test engine already existed, and had never been used.** `Exam → MCQ
Exam` is 16 tables, all `organization_id`-scoped with RLS on, covering a
question bank of 15 question types, papers with sets and versions, blueprint
auto-generation, attempts, anti-cheat events, live monitoring, rank/percentile
analytics, and a document-extraction pipeline.

Usage across all three tenants: **21 questions, 2 papers, 1 exam, 0 attempts, 0
answers, 0 assignments.** Nobody has ever sat a test.

Several requirements were already met, and to a higher standard than asked. The
extraction pipeline is a deterministic local parser with per-question confidence
scoring that refuses to invent an answer key, and is explicit about what it
cannot read (scanned PDFs, legacy `.doc`) instead of emitting plausible
nonsense. `pdfjs-dist`, `mammoth` and `xlsx` are already dependencies.

### The four defects that stopped this shipping

Migration `20260524_mcq_exam_engine.sql` predicted three of them in its own
header — *"Production hardening = add a student JWT and tighten the attempt
policies to `auth.uid()`-scoped rows"* — and that hardening never happened.

**1. The answer key was sent to the student's browser.** `startOrResume` loaded
the paper through `mcqPaperService.getQuestions()`, which returns
`options[].isCorrect` and `explanation`, before the first question rendered.

**2. The score was self-reported.** `scoreAttempt()` ran in the browser, which
then `UPDATE`d `mcq_attempts.total_score` with the number it had just computed.
RLS on the attempt tables was a single `FOR ALL` policy testing only
`organization_id` — **no ownership predicate at all**, so any signed-in member
of the organization could write any score to any attempt and read every
student's answers.

**3. `/exam` was an unauthenticated kiosk.** It listed every batch, then every
student, and let the visitor sit the test as whoever they clicked. Identity was
a dropdown. It was inert *by accident*: `current_org_id()` is NULL for anon
because `fallback_org_id()` resolves only when exactly one organization exists,
and there are three. A single-tenant deployment would have served the whole
roster — and, through the `anon read mcq_questions` policy, the answer keys.

**4. `pending_review` was written and then orphaned.** The grader correctly
flags subjective answers rather than scoring them 0, and nothing has ever read
the flag. An attempt with one essay stays `awaiting_evaluation` forever and
`is_pass` stays NULL.

### The tenant trap was pre-armed

All eight exam tables carry `organization_id NOT NULL DEFAULT current_org_id()`.
That default is NULL under the service role, so any Edge Function write to them
fails the NOT NULL constraint — the same failure as the 40-insert incident.
Every new write path stamps the organization explicitly.

---

## What Phase B changed

### One grader, in one file

Grading had to move behind a server. The obvious next step — reimplement it in
plpgsql, or copy it into the Edge Function — produces **two graders, and two
graders drift**. The drift does not announce itself; it surfaces as a handful of
students marked wrong on a question they answered correctly, weeks later.

So `supabase/functions/_shared/grading.ts` is the only implementation, and it
has **no imports at all** — that is what lets the browser bundle, the Deno
runtime and vitest load the identical module. `src/features/exams/utils/
mcqScoring.ts` re-exports it under the existing `scoreAnswer` / `scoreAttempt`
names, so every call site and all 11 existing scoring tests kept working
unchanged.

### The client stopped being able to write a mark

`20261014_online_test_security.sql` drops every client write policy from
`mcq_attempts`, `mcq_answers` and `mcq_attempt_events` and recreates them as
SELECT only: staff read their organization's attempts, a parent reads their own
children's via `is_parent_of()`, anon reads nothing. The anti-cheat trail is
staff-only — a parent reading it would be reading an accusation nobody has
reviewed.

The browser's `startOrResume`, `autosave` and `submit` were **deleted, not left
to fail**, and that distinction is the point. An RLS-filtered `UPDATE` does not
raise: PostgREST answers 204 with `error: null`. Left in place, `submit` would
have reported success, shown the student a score, and written nothing.

### The server side

`supabase/functions/online-test` is now the only writer. It never takes an
organization, a student or a mark from the request body: the caller is verified
against GoTrue by `resolveCaller()`, the organization comes from membership, and
the paper and score are computed server-side.

`publicQuestion()` builds a fresh object rather than spreading the row minus a
few fields — a spread works until someone adds a column, whereas a fresh object
makes a *new* answer-key field absent by default rather than leaked by default.

One case needed care. A matching question is unanswerable without both columns,
so the right-hand one has to travel; sent in pair order, the two arrays *are*
the answer key. The server sorts it by `(value + question id)`, which is stable
across a refresh and unrelated to the pairing.

### Idempotency and the clock

Submission grades with `.eq("status", "in_progress")`, so a double-click, a
retry after a dropped response, and the timer racing the button all match zero
rows the second time. An already-submitted attempt is answered with its
**result**, not an error — telling a student their submission failed invites
them to submit again.

A partial unique index stops two tabs opening two attempts. That race is between
two processes, and no amount of care in one can see what the other is doing;
the loser's answers would have autosaved into an attempt nobody ever submits.

The deadline is recomputed from `started_at` on every call and enforced on
**autosave**, not only on submit — a tab still saving past its time is exactly
the case a client-side timer misses.

### A gate that was accusing correct code

`tenant-write-audit.mjs` reported the (correctly stamped) answers upsert as a
violation. It read the *whole* argument list of `insert`/`upsert`, so
`upsert(rows, { onConflict })` could never be resolved back to its declaration,
and it only recognised `stampOrg()` when it wrapped an object literal, not a
chained expression. Both are fixed, and the fix is strictly narrower — mutation
tested: an unstamped write is still caught.

This mattered beyond the immediate error. When a gate accuses correct code, the
fix people reach for is an allowlist entry, and that is how a gate stops meaning
anything.

---

## Verified

Live, against the production database, in a rolled-back transaction
impersonating a real non-ARK staff session:

| Check | Result |
|---|---|
| staff can read their org's attempts | PASS |
| staff **cannot** rewrite a score | PASS (0 rows) |
| the stored score is unchanged | PASS (10, not 100) |
| a client **cannot** open an attempt | PASS — refused |
| a client **cannot** delete an attempt | PASS (0 rows) |
| abc-academi sees 0 of ARK's 21 bank questions | PASS |

Against the deployed function, as anon: `start`, `save`, `submit`, `result` and
`force_submit` all return **401**.

Policy counts after the migration: **0** anon policies on the answer-key tables,
**0** client write policies on the attempt tables.

ARK: **335 exams and 1,488 exam_results, unchanged.** The migration writes no
rows and does not reference `exams` or `exam_results`.

| | |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | **517** (baseline 532) |
| `eslint .` | **318** (15 errors, 303 warnings) — baseline |
| `vitest run` | **128 files, 2,699 passed** (+29) |
| `vite build` | ✓ 50s |

The 29 new tests are mutation-tested: leaking `isCorrect` from
`publicQuestion()`, removing the idempotency guard, and widening a read policy
back to `FOR ALL` each fail them.

---

## Not built

Phases C–J. Specifically: the public share link and its token, student-level and
"all students" assignment targeting, the creation wizard, paste-questions entry,
CSV column mapping, the live student preview, Parent Portal integration, the
subjective-marking screen that would finally consume `pending_review`, and the
`exam.online_tests` submodule registration.

There is **no Student Portal**. `student_auth_accounts` exists with 0 rows, no
`is_student()` helper, no RLS referencing it and no frontend; `ROLES` is
`teacher | admin | coordinator | management`. Assigned tests will reach students
through the Parent Portal and per-student tokenised links.

## Known limits

- The kiosk is now staff-authenticated, so a student cannot open `/exam`
  themselves. Until Phase C ships the tokenised link, an invigilator must be
  signed in on the device.
- `is_setup_admin()` still compares `profiles.id` to `auth.uid()` — a
  pre-existing identity bug, untouched here.
