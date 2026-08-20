# Per-standard subjects on a combined class

A teacher who takes 2nd STD and 3rd STD in the same period teaches each of them
a **different subject**, usually out of a different batch. The scheduler could
not express that. This makes it the normal case rather than an impossible one.

---

## What was wrong

The Schedule Class form had a row of standard chips and **one** subject
dropdown for the whole class. Two failures, and they compounded:

1. **The subject list was the union across every selected standard.** Pick 2nd
   STD, then 3rd STD, and you were offered 3rd STD's subjects while standing on
   2nd STD. Two standards teaching a subject of the same name showed it twice
   with nothing to tell them apart.
2. **Whichever subject you picked became THE subject of the class** — stamped
   against every standard in the room. The timetable printed
   `2nd STD + 3rd STD · Maths`, which is false for half the children in it, and
   the attendance sheet and every downstream report inherited the same wrong
   subject.

The second is the one that matters. The first was visible and annoying; the
second was silent and wrong.

## The flow now

Adding a standard opens a card **for that standard**, with its own subject and
batch, and the next standard cannot be added until this one is finished.

The gate is not ceremony. It makes "which standard is this subject for?" have an
answer at the moment the question is asked, instead of at submit time when the
operator has forgotten which order they clicked things in. The block also
*names* the standard — "choose a subject for 3rd STD first" — because "complete
the form" makes someone hunt through a list they just built.

Three rules inside it are easy to get backwards:

- **"All batches" is an explicit option, not a blank.** The requirement is that
  the operator has *decided* which children a standard means. An empty select
  cannot express "I considered it and I want all of them", so a sentinel does —
  and it is stripped before the plan reaches the database, where an absent batch
  already means the whole standard.
- **A batch is only required where batches exist.** An institute that has never
  created one would otherwise be unable to schedule anything at all.
- **A standard with no subjects configured is allowed through.** Blocking there
  would trap the operator in a form they can neither finish nor abandon, over a
  Setup problem. The card names the gap instead: *"No subjects for 3rd STD. Add
  them in Setup → Manage Subjects."*

That last rule is also why the "every standard has a subject" check is **not** a
zod refinement. Whether a standard *can* be given a subject depends on what
Setup holds for it, which the schema cannot see; asserting it there would
produce a form that accepts input and then refuses to submit it.

## Chips, not dropdowns

The first cut used a `Select` per field and the subject list was unreachable —
*"there is no drop down for selecting the subject"*. The options were being
computed correctly (the blocker message that only renders when subjects exist
was on screen at the time), so the failure was the popup, not the data: a Radix
`Select` portalling its list over a dialog that is itself scrollable, with the
shadcn viewport pinned to `h-[var(--radix-select-trigger-height)]` — an
eleven-subject list opening as a one-row sliver.

Chips are the right control here regardless of that. Every option is visible
without a second interaction, the tap targets are finger-sized on a phone
rather than 36px popup rows, and it matches how standards are already picked
directly above. Nothing in this card has enough options to justify hiding them:
a standard has a handful of subjects, a handful of batches and two or three
sections.

Because chips are plain buttons, the options are also *assertable*. The rules
were all correct and all unit-tested when this broke — a test of
`subjectsForStandard` cannot fail by being unreachable on screen — so
`StandardPlanBuilder.test.tsx` renders the component and checks the subjects are
in the document and clickable. Removing the per-standard scoping fails three of
its thirteen tests.

Re-tapping a chosen **section** clears it. A section is optional, and without
that there is no way back to "no section" once one has been tapped.

## Why a column and not a row per standard

Splitting the class into one row per standard is the obvious modelling fix and
it is wrong here.

`teachingHours.service.ts` aggregates a teacher's load by summing
`duration_minutes` across their rows, and payroll pays from that sum. Two rows
for one 60-minute period would pay the teacher **for two hours**. The period is
one fact; the per-standard detail hangs off it.

So `class_schedules.standard_plan jsonb` — an ordered array of
`{ standard_id, subject_id, batch_id, section_id }` plus denormalised names.

**Entry 0 is the primary, and the scalar `standard_id` / `subject_id` /
`batch_id` / `section_id` columns keep mirroring it.** RLS, every `standardId`
filter, the reports and the denormalised timetable labels all still read the
scalars and needed no change. The plan is additive detail, never their
replacement. `toRow()` takes the scalars *from* entry 0 rather than from the
form so the two cannot drift — a class whose primary standard said Maths while
its plan said Science would be wrong in whichever one the reader consulted.

### No backfill

Existing rows keep an empty plan. `effectivePlan()` derives one at read time
from the columns they already have.

An UPDATE would rewrite every tenant's historical timetable — ARK's included —
to store what a pure function computes. Those rows genuinely *did* mean one
subject for every standard on them, because that was the model, so repeating it
per standard reports them faithfully rather than inventing detail.

`isSplitSubject()` therefore reads the **stored** plan, never the derived one:
a legacy row has one subject by construction, and treating it as split would
relabel every historical class in the system.

## The label

`classLabel()` is now the single source for "what is this class called", used by
the coordinator's timetable, the teacher's dashboard, the roster dialog and the
attendance dialog. All four previously carried their own copy of the same
expression, so all four printed the same wrong subject.

- One subject in the room → `Std 2 + Std 4 · A · Maths` (unchanged, and correct)
- Different subjects → `2nd STD · Maths  +  3rd STD · Science`

The compact form is shorter and is a lie for a split class, so those are titled
per standard instead.

## The roster

A combined class draws each standard from **its own** batch. The candidate query
took a single `batch_id`, which would filter whichever standard did not match
down to nobody — the picker would report "no active students" for a standard
full of them. `candidates()` now accepts `batchByStandard` and narrows per
standard, in the same single round-trip. A standard left on "all batches" keeps
everyone.

## Degrading without the migration

`insertRows()` retries without `standard_plan` when PostgREST cannot resolve the
column, and `update()` does the same. A named column that does not exist fails
the **whole** statement, so without this a frontend deploy that reached a
database one migration behind could not schedule a class at all. The fallback
degrades to the previous behaviour — one subject for the class — which is worse
than the new one and far better than an outage.

## Removed

`utils/subjectScope.ts` and its 12 tests. Nothing referenced it any more, and
its documented purpose — the union of subjects across every selected standard —
is exactly the behaviour established here as wrong. Left in place it would
invite someone to reuse it.

## Gates

`components/StandardPlanBuilder.test.tsx` — 13 render tests proving the options
reach the DOM, the gate blocks and names what is missing, and each standard gets
its own list.

`utils/standardPlan.test.ts` — 25 tests over the pure rules: which subjects a
standard may be offered, when an entry is finished, which standard is blocking,
what the scalars collapse to, how a legacy row reads back, and what a split
class is called. Plus two in `classStudents.test.ts` pinning per-standard batch
narrowing, and two in `schedule.test.ts` pinning that the plan outranks
`standardIds` when they disagree.

## Migration

`supabase/migrations/20261012_class_standard_plan.sql` — additive, idempotent,
non-destructive. **Applied live 2026-08-20.**

Rehearsed first inside `BEGIN; … ROLLBACK;`, and running the file twice in one
transaction is a no-op, so a re-run is safe.

| Check | Result |
|---|---|
| `standard_plan` | `jsonb`, `NOT NULL`, default `'[]'::jsonb` |
| Array check-constraint | present |
| Rows modified | **0** of 33 (ARK's 30 classes untouched) |
| PostgREST schema cache | `select=standard_plan` → 200; a genuinely missing column → 400 `42703` |

That last row matters: a stale schema cache would have sent every insert down
the `isMissingColumn` fallback path and silently kept writing one subject per
class, with nothing on screen to say so.

Apply with `supabase db query --linked --file`, one file at a time — **never
`db push` on this project**, whose migration history table is out of sync.
