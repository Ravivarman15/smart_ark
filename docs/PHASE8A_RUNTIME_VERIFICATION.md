# Phase 8A — Real Runtime Verification

Companion to `PHASE8_PRODUCTION_VALIDATION.md`.

Everything here was produced by a **real GoTrue-issued access token obtained by
password sign-in**, sent through PostgREST exactly as the browser sends it. No
JWT claim was injected, no role was set by hand, no RLS was bypassed.

**The Phase 8 harness — which set `request.jwt.claims` and `set role` — is
superseded and its results are withdrawn.** It was inconclusive and is not cited
anywhere below.

## Sessions

| Session | How obtained | Org claim in the token |
|---|---|---|
| **ABC** | signup → email confirmed → profile + `organization_users` → password grant | `12028704-…`, injected by the access-token hook |
| **ARK** | **not obtained** — see "ARK direction" | — |

The ABC probe is `phase8a.probe@thearktuition.com`, role `management`,
`is_active = true`, member of ABC only. It lives in the **test tenant** and has
no access to ARK.

---

## Part 5 — runtime isolation matrix (ABC session)

Every row carries a **positive control**: the session demonstrably sees its own
rows in that table, so a zero in the cross-tenant column means isolation rather
than blindness.

| Surface | ABC own | ABC → ARK | Total visible | Verdict |
|---|---|---|---|---|
| students | 2 | 0 | 2 | **PASS** |
| profiles | 2 | 0 | 2 | **PASS** |
| organization_users | 2 | 0 | 2 | **PASS** |
| student_attendance | 2 | 0 | 2 | **PASS** |
| teacher_attendance | 1 | 0 | 1 | **PASS** |
| exams | 3 | 0 | 3 | **PASS** |
| exam_results | 1 | 0 | 1 | **PASS** |
| student_fees | 2 | 0 | 2 | **PASS** |
| fee_installments | 2 | 0 | 2 | **PASS** |
| payroll_items | 3 | 0 | 3 | **PASS** |
| message_queue | 3 | 0 | 3 | **PASS** |
| leads | 2 | 0 | 2 | **PASS** |
| student_documents | 2 | 0 | 2 | **PASS** |
| organization_branches | 1 | 0 | 1 | **PASS** |

**14 / 14 PASS.** "Total visible" equals "own" on every row — the session sees
nothing beyond its own tenant, in any table.

## Part 6 — write isolation (ABC session, ARK targets)

| Attempt | HTTP | Rows affected | Verdict |
|---|---|---|---|
| INSERT student into ARK | 403 | 0 | **BLOCKED** |
| UPDATE ARK student_fees | 200 | 0 | **BLOCKED** |
| DELETE ARK teacher_attendance | 200 | 0 | **BLOCKED** |
| UPDATE ARK organization_branches | 200 | 0 | **BLOCKED** |
| UPDATE ARK attendance_settings | 200 | 0 | **BLOCKED** |

The `200 / rows=0` responses are RLS filtering the target set to empty — the
PostgREST silent-success shape. `Prefer: return=representation` is what makes
"nothing happened" observable; without it these look like success.

## Part 7 — tenant spoof (ARK organization_id supplied in the body)

| Table | HTTP | Landed in | Verdict |
|---|---|---|---|
| students | 400 | refused | **SAFE** |
| leads | 403 | refused | **SAFE** |
| organization_branches | 403 | refused | **SAFE** |

No row landed in ARK. The client cannot choose its tenant.

## Part 9 — public lead routing (anonymous, no session)

| Slug | HTTP | Landed in |
|---|---|---|
| `ark` | 200 | **ARK** |
| `abc-academi` | 200 | **ABC** |
| `not-real` | 500 Unknown organization | nothing |
| `not-real` + ARK organization_id in payload | 500 Unknown organization | nothing — **no fallback to ARK** |

## Parts 12 & 13 — geo resolver (ABC session, real geo mode)

ABC was temporarily switched to `geo` with **one unmistakably synthetic** test
location at `0, 0` — Null Island, open ocean, impossible to mistake for a
school. **No coordinate was invented for ABC's real premises.** ABC was reverted
to `normal` afterwards.

| Scenario | Result |
|---|---|
| Inside radius (11.1 m within 200 m) | `verified`, location_id = ABC's own location |
| Outside radius (1,111.9 m) | `outside_radius`, location_id null |
| **ABC at ARK's exact coordinates** | `outside_radius`, distance **8,945,639 m**, nearest = **ABC's own** location |
| Low accuracy (500 m against a 20 m gate) | `low_accuracy` |
| Location disabled | `no_locations` |
| Location with no address | HTTP 400 — **BLOCKED** |
| Location with no radius | HTTP 400 — **BLOCKED** |
| Geo mode with no armed location | HTTP 400 — trigger refused |

The third row is the location-spoof proof. Standing on ARK's Junior Campus
coordinate, ABC's resolver returns **ABC's own** location 8,945 km away. ARK's
two locations are not in ABC's candidate set at all — the browser cannot ask to
be checked in at ARK Main Campus, because it never names a location.

---

## Two real bugs found by running it

Neither was visible to static review. The policy, the service and the form were
each individually correct.

### 1. No tenant could create a check-in location

`organization_branches.organization_id` had **no DEFAULT**, unlike all 206 other
tenant tables. The client deliberately omits that column so a browser cannot
choose its tenant — so the value arrived NULL and failed the RLS WITH CHECK:

```
42501: new row violates row-level security policy for table "organization_branches"
```

Fixed by migration **8C** (`SET DEFAULT current_org_id()` — metadata only, no row
read or rewritten).

### 2. The check-in settings page could never save

PostgREST is configured to reject a filterless UPDATE:

```
21000: UPDATE requires a WHERE clause
```

`saveSettings` had no filter, deliberately, to avoid handing the client an
organization id. Fixed with `.not("organization_id", "is", null)` — always true
for the caller's own row, names no organization, and leaves the tenant decision
with RLS.

---

## ARK direction — NOT runtime verified

`ARK → ABC` is **0/14**. I have no ARK credential, and minting one would create
an account able to read 134 real students' records.

At your direction the harness is **`scripts/phase8a-ark-isolation.mjs`**, for you
to run against your own ARK session:

```
1. Sign in to Smart ARK as an ARK admin.
2. DevTools → Application → Local Storage → sb-vxyshcucwdbpxrhddaeh-auth-token
   Copy the access_token value.
3. node scripts/phase8a-ark-isolation.mjs "<token>"
```

It reads **counts only** — never row contents — and its four write attempts all
target **ABC-owned rows**, so:

```
ARK rows created : 0    ARK rows modified : 0    ARK rows deleted : 0
```

It refuses to run if the token does not carry ARK's organization id, so a token
copied from the wrong tab fails loudly instead of producing a matrix of zeroes.

---

## Part 16 — ABC test data inventory (NOT deleted)

Organization `12028704-0344-4900-af41-2f71b2372627` (`abc-academi`):

| | Count | Note |
|---|---|---|
| profiles | 2 | includes the Phase 8A probe |
| students | 2 | `PHASE8A-TEST Student` |
| leads | 3 | includes the two public-form leads |
| exams | 3 | |
| student_fees | 2 | |
| student_attendance | 2 | |
| message_queue | 3 | |
| organization_branches | 2 | `Main Branch` (provisioned) + the Null Island test location, now disarmed |

Every test row carries the literal marker **`PHASE8A-TEST`**. Nothing was
deleted. Operator cleanup, to run only when the evidence is no longer needed:

```sql
-- ABC TEST TENANT ONLY. Check the slug before running.
DELETE FROM public.leads    WHERE student_name LIKE 'PHASE8A-TEST%'
  AND organization_id = (SELECT id FROM organizations WHERE slug = 'abc-academi');
DELETE FROM public.students WHERE name         LIKE 'PHASE8A-TEST%'
  AND organization_id = (SELECT id FROM organizations WHERE slug = 'abc-academi');
-- Child rows (fees, attendance, results) cascade or must be removed first.

-- Revoke the probe account:
DELETE FROM public.organization_users WHERE user_id =
  (SELECT id FROM auth.users WHERE email = 'phase8a.probe@thearktuition.com');
DELETE FROM public.profiles WHERE user_id =
  (SELECT id FROM auth.users WHERE email = 'phase8a.probe@thearktuition.com');
DELETE FROM auth.users WHERE email = 'phase8a.probe@thearktuition.com';
```

---

## Tenant state after Phase 8A

| | ARK | ABC |
|---|---|---|
| checkin_mode | `geo` | `normal` |
| enforced | `false` | `false` |
| default radius | 200 m | 150 m |
| armed check-in locations | **2** | **0** |

**ARK is exactly as Phase 8 left it.** ABC was reverted after the geo tests.

## Gates

| Gate | Before | After |
|---|---|---|
| `vitest run` | 1470 | **1470 passed, 0 failed** |
| `eslint .` | 15 err / 290 warn | **15 / 290** — unchanged |
| `npm run build` | passes | **passes, 39.9 s** |
| ARK row counts | baseline | **identical** |

`vitest.config.ts` gained `testTimeout: 30_000`. The security gates walk and read
every source file, so their runtime scales with repository size; several sat just
under the 5 s default and began timing out as files were added. **No assertion
was changed** — each still passes in ~2–3 s on its own.

## Migrations added by Phase 8A

| File | Purpose |
|---|---|
| `20260915_phase8b_checkin_address_required.sql` | address + radius required on a verified location; `NOT VALID` so ARK's 8A-seeded rows are grandfathered |
| `20260916_phase8c_branches_org_default.sql` | `organization_branches.organization_id` DEFAULT — the bug above |

Both applied, idempotent, registered in `scripts/deploy-migrations.mjs`.
