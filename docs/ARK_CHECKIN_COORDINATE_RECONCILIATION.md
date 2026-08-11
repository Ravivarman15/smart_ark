# ARK check-in coordinates — reconciliation required

## ⚠️ OPERATOR VERIFICATION REQUIRED

**ARK management must confirm the real-world location before anything here is
unified. Nothing in this document has been acted on, and no coordinate has been
changed, chosen or reconciled.**

---

## The discrepancy

Three coordinates claim to be ARK's campus. They disagree by up to **11.75 km**.

| # | Coordinates | Where it lives | Status |
|---|---|---|---|
| **A** | `13.0059109, 80.1961798` | `AppDataContext.CAMPUS_LOCATIONS` — "ARK Junior Campus" | **LIVE** — what check-in actually geofences against today |
| **B** | `13.0059625, 80.1994691` | `AppDataContext.CAMPUS_LOCATIONS` — "ARK Senior Campus" | **LIVE** — same |
| **C** | `13.0827, 80.2707` | `campuses` row + `organization_branches` row, both named "Senior Campus" | **DORMANT** — stored, never used by any geofence |

Measured with the same Haversine the resolver uses, executed in Postgres:

```
A → B      356.4 m      the two live campuses, plausibly two nearby buildings
A → C   11,750.4 m      ~11.75 km
B → C   11,715.9 m      ~11.72 km
```

`13.0827, 80.2707` is central Chennai. `13.0059, 80.196` is roughly Mugappair —
consistent with the address printed on every ARK receipt, *No 2/31, Mugappair
West, Chennai*. That is **suggestive, not conclusive**, and is not a basis for
changing anything.

## Which modules use which

| Module | Uses | Effect |
|---|---|---|
| `pages/admin/DailyControlBoard` | **A + B** | admin check-in / check-out |
| `pages/coordinator/CoordinatorDashboard` | **A + B** | coordinator check-in / check-out |
| `pages/teacher/dashboard/useTeacherWorkspace` | **A + B** | teacher check-in |
| `features/staff/utils/geo.ts` (via `core/constants/config.ts`) | A + B | **dead code — no callers**, asserted by the Phase 7 gate |
| `organization_branches` "Senior Campus" | **C** | dormant; `is_checkin_location = false`, so it is not a geofence |
| Phase 8A seeded rows | **A + B** | copied verbatim from the source constants |
| `campuses` "Senior Campus" | **C** | dormant; nothing geofences against `campuses` |

## What Phase 8A did, and deliberately did not do

**Did:** copied A and B *verbatim* into `organization_branches` as check-in
locations, with ARK's live 200 m radius, mode `geo`, enforcement `off`. The
configuration moved from source into data with **no value altered**.

**Did not:** touch C. The pre-existing "Senior Campus" branch row keeps
`is_checkin_location = false`.

That default is the whole safeguard. Had the flag defaulted to `true`, row C
would have become a live geofence and ARK's check-in would have moved ~11.7 km —
silently, on a table nobody would have thought to re-check. A test asserts the
distance so the reasoning cannot be lost.

**Also did not:** delete `CAMPUS_LOCATIONS`. The three dashboards still call
`isNearCampus()`, so ARK's live check-in path is byte-for-byte unchanged.

## What would change if they were unified

| Scenario | Consequence |
|---|---|
| Point everything at **A + B** | No behavioural change. Staff who verify today keep verifying. Row C becomes documentation. **Lowest risk.** |
| Point everything at **C** | Every ARK check-in at the real campus falls ~11.7 km outside a 200 m radius. With enforcement off: every check-in flagged `outside_radius`. With enforcement on: **nobody can check in.** |
| Leave as-is | Two sets of coordinates persist. The dormant one is inert, but it is a trap for the next person who reads the table and assumes it is authoritative. |

## What ARK management must confirm

1. Is the real campus at **A/B (Mugappair)** or **C (central Chennai)**?
2. Are Junior and Senior genuinely two buildings ~356 m apart, or one site?
3. Is 200 m the right radius for each, or should they differ?
4. **The postal address of each** — required by the Phase 8B constraint, and the
   only way a human can audit that a pin sits on the right building. ARK's two
   seeded rows currently have **no address**, because the source constants never
   had one; they are grandfathered by a `NOT VALID` constraint.
5. Should ARK move from advisory to **enforced** geo? It is advisory today, and
   Phase 8 changed nothing about that.

## After confirmation

If **A + B** are confirmed — the low-risk path:

```sql
-- 1. Supply the addresses the constraint is waiting for.
UPDATE public.organization_branches SET address = '<real address>'
 WHERE organization_id = (SELECT id FROM organizations WHERE slug = 'ark')
   AND name = 'ARK Junior Campus';
-- (repeat for ARK Senior Campus)

-- 2. Now that no row violates it, promote the constraint from NOT VALID.
ALTER TABLE public.organization_branches
  VALIDATE CONSTRAINT organization_branches_checkin_needs_address;
ALTER TABLE public.organization_branches
  VALIDATE CONSTRAINT organization_branches_checkin_needs_radius;

-- 3. Optionally retire the dormant row from view.
--    DO NOT DELETE IT — other records may reference the branch.
UPDATE public.organization_branches SET is_active = false
 WHERE id = '<the 13.0827/80.2707 row>';
```

Then, and only then, Phase 8B-frontend can repoint the three dashboards at
`checkinService.resolve()` and delete `CAMPUS_LOCATIONS`.

If **C** is confirmed instead, the seeded rows must be corrected *before* the
dashboards are repointed — otherwise the switchover moves the geofence 11.7 km
in a single deploy.

**Do not run any of the above until question 1 is answered by someone who knows
where the building is.**
