# Phase C — the shareable test link

A published test can now be opened by someone with no account, at
`/test/<token>`, and it shows **their institution's** name and logo.

Companion to `ONLINE_TESTS.md`, which covers the Phase A audit and the Phase B
security repair.

---

## The token, and one deliberate departure from convention

`organization_invitations` stores a `token_hash`, and that is right for an
invitation: a bearer credential shown once to one person, where a database leak
must not yield working invitations.

A test link is the opposite kind of secret. It is *meant* to be handed to a
hundred students, pasted into WhatsApp groups, and reopened by a teacher next
week. Hashing makes it show-once, so a teacher who loses it must regenerate —
invalidating the link every student is already holding, mid-test.

So the token is stored as issued, and its secrecy is asked to do only what it
can: make the test unguessable. 32 bytes of CSPRNG entropy, base64url, readable
only by staff of its own organization, revocable, expirable, and granting
nothing beyond one published test.

For the same reason, **`issue_link` reuses the existing token by default.** A
share panel that regenerated on open — or whenever a PIN or expiry changed —
would break a live exam. Rotating is a separate action behind a confirmation
that says exactly who gets cut off.

## Why resolution is a function, not an RLS policy

The obvious implementation is an anon SELECT policy on `mcq_exams` with
`public_token = <token>`. That is precisely the shape 20261014 had to remove:
RLS is evaluated per row *after* the query is admitted, so an anon policy makes
the whole table reachable and leaves only a `WHERE` clause between a visitor and
every tenant's exam configuration. And `current_org_id()` is NULL for anon, so
the usual tenant predicate cannot even be written.

`resolve_public_test()` is `SECURITY DEFINER`, service-role only, and returns at
most one row of **metadata** — never a paper, never a question, never a key. An
unknown, revoked, expired or non-public token all return nothing, and the
endpoint gives one message for all four: telling a stranger a token *used* to
work confirms they guessed a real one.

## Two functions, one engine

`public-test` needs `verify_jwt = false`. Setting that on `online-test` would
strip the platform's signature check from the staff and parent paths too, so the
anonymous surface is a separate function — as `public-form` and
`public-onboarding` already are. It also means the anonymous function **cannot
mint the credential it accepts**: `issue_link` lives behind a verified staff
session in `online-test`.

What is *not* duplicated is the engine. `_shared/testEngine.ts` holds
eligibility, the frozen question order, autosave, the deadline, grading,
idempotency and result visibility; the two entry points differ **only** in how
they identify the taker. A mark that depended on which link a student arrived
through would not be a mark. `ExamRunner` takes the same shape as a `transport`
prop, so the public page reuses the identical screen rather than growing a
second one that drifts in its timer, palette and submit guard.

## Access modes

`mcq_exams.access_mode` is TEXT with a CHECK, not an enum: adding a value to a
Postgres enum cannot run inside a transaction with other DDL, which would make
every future mode a migration that cannot be rehearsed the way this one was.

| Mode | Who may open an attempt |
|---|---|
| `assigned` *(default)* | an assigned student, through any authenticated channel |
| `parent_portal` | an assigned student, and only via their parent's login |
| `invigilated` | an assigned student, and only on a staff-proctored device |
| `public_link` | anyone holding the link, plus the PIN if one is set |

The default is what every existing exam already did, so **no row changed
meaning**.

## A public taker is a guest, and stays one

The tempting feature — match the typed email to a student and attach the attempt
to their record — was **deliberately not built.** Nothing on a public link
verifies that email, so anyone holding it could type a classmate's address and
have a deliberately bad attempt recorded against them: visible to their parents,
counted in their averages. That is impersonation with a helpful name.

A test that needs identified students already has the right tool: assign it.
Then the taker arrives with a session and their identity is a fact rather than a
claim.

Guests are still counted. `participant_key` is `guest:<sha256>` of the declared
identity, salted per exam so the same person is not linkable across tests, and a
partial unique index enforces one attempt in progress per participant. The
earlier student-only index was **kept rather than replaced** — dropping a live
constraint to swap it is a window in which neither holds.

`mcq_attempts.student_id` became nullable to allow this. The alternatives were
worse: a separate `guest_attempts` table would fork the attempt lifecycle and
with it grading, autosave, idempotency and analytics; a throwaway `students` row
per guest would pollute the roster, class lists, attendance and every headcount
in the product.

## Verified end to end, on the live database

A fixture in the **`testing`** tenant (never ARK), driven through the deployed
functions over HTTP, then removed:

| Check | Result |
|---|---|
| `info` returns the tenant's own branding | PASS — "testing", its own logo |
| answer-key scan of the `start` payload | PASS — 0 occurrences of `isCorrect`, `answerText`, `numericalAnswer`, `explanation`, `matchPairs` |
| submit with `totalScore: 100` forged in the body | PASS — server computed **4 / 10** |
| essay flagged, not failed | PASS — `pendingMarks: 6`, `isPass: null` |
| submit twice | PASS — `alreadySubmitted`, identical result |
| `testing`'s token + `abc-academi`'s attempt (result / save / submit / event) | PASS — **403 on all four** |
| attempt limit | PASS — same visitor 409, a different visitor allowed |
| revoked link | PASS — 404, indistinguishable from a bad token |
| anon `issue_link` | PASS — 401 |
| unknown / short / random 43-char tokens | PASS — 404 |
| fixture removed | 0 leftovers; ARK 335 / 1,488 / 21 / 2 unchanged |

## A bug found in our own gates

`onlineTestSecurity.test.ts` stripped comments with `/(^|[^:])\/\/.*$/` per
line. **In JavaScript `.` does not match `\r`** — it is a line terminator,
unlike in most other regex flavours. Files written during this work use CRLF, so
`.*` stopped before the `\r`, `$` never matched, and **not one line comment was
ever removed.**

The direction of that failure is what matters: it makes *positive* assertions
lie. `toContain("...")` passes when the phrase appears only in a comment, so a
gate can stay green after the code it guarded has been deleted, as long as the
comment describing it survives.

Fixed in `testing/sourceGate.ts`, which normalises line endings first and is now
the single reader for these gates. One assertion deliberately reads the file
**unstripped**: `.replace(/\//g, "_")` contains the characters `//` inside a
regex literal, and no line-based stripper can tell that from a comment.

**Latent, not fixed:** the repository's other source-reading gates use the same
pattern. They are safe today only because their target files are LF. Editing one
of those targets on Windows would silently disarm its gate.

## Verification

| | |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | **517** (baseline 532) |
| `eslint .` | **318** (15 errors, 303 warnings) — baseline |
| `vitest run` | **129 files, 2,732 passed** (+33) |
| `vite build` | PASS, 39s |
| `tenant-write-audit.mjs` | 36 scanned, **0 violations** |
| ARK baseline | 335 exams / 1,488 results / 21 questions / 2 papers — **unchanged** |

Mutation-tested: removing the cross-tenant attempt check, giving `public-test` a
token generator, dropping revocation from the resolver, and leaking `isCorrect`
from the shared engine each fail the gates.

## Migrations and deployments

- `20261016_online_test_public_access.sql` — **applied live**, run twice to
  prove idempotency. Additive; writes no rows.
- Edge functions `online-test` (rewritten, thin) and `public-test` (new) —
  **deployed**.
- Frontend deploy still pending: `/test/:token`, the share panel and the
  transport-aware runner take effect only then.

## Still not built

Phases D–J: assignment targeting (student-level and "all"), the create wizard,
paste entry and CSV/Excel column mapping, question review with live preview, the
subjective marking screen that would finally consume `pending_review`, analytics
dashboards, and `exam.online_tests` submodule registration.
