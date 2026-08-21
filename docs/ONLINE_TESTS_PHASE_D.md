# Phase D — who gets the test, and where they find it

Assignment targeting, the `Exam → Online Tests` submodule, and the Parent Portal
section. Companion to `ONLINE_TESTS.md` (Phase A/B) and
`ONLINE_TESTS_PHASE_C.md` (the public link).

**No migration.** `mcq_exam_assignments.scope_type` is unconstrained TEXT, so
`student` and `all` are new values in an existing column rather than a schema
change. The two new scopes reached production without touching the database.

---

## One set of rules, two enforcers

`utils/assignmentTargeting.ts` is a pure module that answers "which students
does this selection reach?". The staff screen uses it for a live count; the
server asks the same question in `_shared/testEngine.ts` on every attempt.

They cannot share code — one is TypeScript in a browser bundle, the other runs
in Deno — so `assignmentTargeting.test.ts` pins the rules **in both
directions**. Change the rule on one side without the other and the build fails
rather than the wrong students being admitted.

| Selection | Audience |
|---|---|
| no assignment rows | the whole organization |
| `all` | the whole organization, said explicitly |
| `standard` | every student of that standard |
| `batch` | every student of that batch |
| `student` | exactly that student |
| `subject` | **nobody** — it is not a target |

Scopes are a **union**. Selecting Class 10 and also naming a student from Class
12 assigns to both; the intersection reading would silently assign to nobody.

### A bug the tests caught, and it would have hit live data

The first version treated "no scope narrows the audience" as everyone — which
made an exam whose only rows are `subject` reach **every student in the
institution**. Before this module existed such an exam reached *nobody*, so that
was not a fix; it was a silent, maximally-wrong behaviour change on live data.

Corrected: everyone means an explicit `all`, or literally no rows. Rows existing
means somebody tried to choose an audience, and if none of them name one the
selection is incomplete — which the UI now says in words. The server already
agreed, so no change was needed there.

## The count is the feature

The old assignment UI was a list of scope-type / scope-id dropdown pairs. It
could express the same selection, but it could not answer the question that
matters before publishing — **how many students is this?** — so a test assigned
to an empty class looked identical to one assigned to two hundred people.

The new selector shows that number live, and says three things a bare count
cannot:

- **"No students match this selection yet"** in words, because a `0` reads like
  a loading state and this is the failure most worth noticing.
- **Deactivated students named, not dropped** — a teacher looking at a class
  list of thirty needs to know why the number says twenty-eight.
- **"Already covered by a class you selected"** — the commonest confusion is
  selecting Class 10, then also searching for three of its students, and
  wondering why the count did not move.

## Per student, not per batch

A test can now be assigned to one named child, so two siblings in the same batch
no longer necessarily see the same list. Two consequences, both required:

- `useStudentMcqExams` is keyed on the **student id**. Keyed on the batch, one
  sibling would be served the other's cached list — and a test assigned to just
  one of them would leak.
- `resolveRoster` reads the whole active roster and filters it with the shared
  rules, rather than building a batch-id query per scope. `all` and `student`
  cannot be expressed as a batch filter at all, and an unassigned exam means
  everyone, which a batch query returns as zero. RLS scopes the read to the
  caller's own organization, so "the whole roster" is never another tenant's.

## The submodule

`Exam → Online Tests` now exists, registered in all four places this repository
requires: `catalog.ts`, `actionCatalog.ts`, `menu.config.ts` and
`sharedRoutes.tsx` — plus explicit `<Route>` entries in `App.tsx`, because
`renderSharedRoutes` covers coordinator and teacher only and an admin would
otherwise 404 on a page every RBAC check called allowed.

It was **added, not a rename** of the four MCQ entries. Submodule ids are what a
tenant's role grants are stored against, so renaming them would have silently
revoked every grant an administrator had already made, on deploy. The existing
Create/Manage MCQ Paper and Exam entries keep working and keep their grants;
this page is simply where the flow now starts.

Two new actions: `exam.online_tests.view` and `exam.online_tests.share`. Sharing
is gated on `exam.mcq.exam_publish` in the UI rather than on `edit` — handing
out a link anyone on the internet can open is a publishing decision, and a
teacher who may edit a draft is not automatically someone who may put it in
front of the public. The server checks again regardless.

## Parent Portal

A dedicated **Online Tests** page, separate from Exams & Results on purpose:
that page is a *record* of what happened, this one is a thing to **do**, with a
deadline. Burying a test that closes at 6pm inside a results archive is how it
gets missed.

Tabs are Available / Upcoming / Completed. The list comes from the active
child's own resolution, and `is_parent_of()` in RLS means a parent never sees
another family's rows. That filtering is still only presentation — the decision
that admits the child is `isEligible()` on the server, re-run every time Start
is pressed.

The result screen says plainly when marks are still with a teacher. A parent
shown a low score on a paper whose essays nobody has marked will draw the wrong
conclusion about their child.

## Verified on the live database

A fixture in the **`testing`** tenant (never ARK): two students, one exam
assigned to **one of them by name**, plus a public link.

| Check | Result |
|---|---|
| public link on a targeted test — guest tries to start | **PASS** — 403 *"This test has not been assigned to you"* |
| Kid A (named in the assignment) | **PASS** — ELIGIBLE (named) |
| Kid B (not named) | **PASS** — REFUSED |
| fixture removed | 0 leftovers |

The first row is the one that matters most: **a valid public link does not
bypass assignment targeting.** The link gets a visitor to the door; the
assignment decides whether they are admitted.

The second and third replay `isEligible()` from `_shared/testEngine.ts` in SQL
against the real rows. The authenticated staff/parent start path was **not**
exercised end-to-end over HTTP — that needs a minted user JWT — so it is marked
**INCONCLUSIVE** below rather than claimed as passing.

## Verification

| | |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | **518** (baseline 532) |
| `eslint .` | **318** (15 errors, 303 warnings) — baseline |
| `vitest run` | **130 files, 2,760 passed** (+28) |
| `vite build` | PASS |
| `tenant-write-audit.mjs` | 36 scanned, **0 violations** |
| `registryAudit` + `routeMounts` gates | PASS |
| ARK baseline | 335 exams / 1,488 results / 21 questions / 138 students — **unchanged** |

The +1 on tsc (517 → 518) is one more `TS2769` in `mcqExam.service.ts` from
adding columns to an existing `.select()`. It is the same pre-existing family as
the other 23 errors in that file: the generated Supabase types do not model the
`mcq_*` tables at all.

**Note on totals:** `exams` went 338 → 339 and `mcq_exam_assignments` 0 → 1
during this work. Neither is mine — they are an exam titled "MCQ" created in
`abc-academi` at 06:43 UTC on 2026-08-21 with a Class 10 assignment, by someone
using the app while this was being built. Every fixture created here was removed
and verified at zero.

## Not verified / not built

- **INCONCLUSIVE:** the authenticated (staff-proctored and parent) start path
  over HTTP. The rules and the data were verified in SQL; the deployed
  function's authenticated branch was not driven with a real user token.
- Phases E–J: the create wizard, paste entry, CSV/Excel column mapping, question
  review with live preview, the subjective marking screen, and analytics
  dashboards.
