# Check-in Geofence — from hardcoded GPS to tenant configuration

## 1. What was there

`src/contexts/AppDataContext.tsx`:

```ts
const CAMPUS_LOCATIONS = [
  { name: "ARK Junior Campus", lat: 13.0059109, lng: 80.1961798 },
  { name: "ARK Senior Campus", lat: 13.0059625, lng: 80.1994691 },
];
const GEO_RADIUS_METERS = 200;

export function isNearCampus(lat, lng) { /* haversine vs the two above */ }
```

Live in three call sites: `DailyControlBoard`, `CoordinatorDashboard`,
`useTeacherWorkspace`.

**Every ABC Academi check-in was recorded `geo_valid = false`** — the staff
member is ~300 km from a Chennai address they have never visited. Not a
branding leak; a functional one, flagged in the Phase 7 audit and deliberately
deferred to here.

### Hardcoded coordinates found

| Coordinates | File | Status |
|---|---|---|
| `13.0059109, 80.1961798` (Junior) | `contexts/AppDataContext.tsx` | **live** — moved to data, source retained (§5) |
| `13.0059625, 80.1994691` (Senior) | `contexts/AppDataContext.tsx` | **live** — same |
| same two | `core/constants/config.ts` | feeds `staff/utils/geo.ts`, which has **no callers** |
| `13.0827, 80.2707` | `campuses` / `organization_branches` rows | pre-existing DB data, **~11.7 km away** — see §3 |

## 2. The finding that shaped the design

**ARK's geofence is ADVISORY, not blocking.**

`DailyControlBoard.handleAdminCheckin` submits the check-in on *every* path:

```ts
if (!navigator.geolocation) { await adminCheckIn(id, false); return; }   // submitted
navigator.geolocation.getCurrentPosition(
  async (pos) => { await adminCheckIn(id, isNearCampus(...).valid); },   // submitted either way
  async ()    => { await adminCheckIn(id, false); },                     // submitted
);
```

So "ARK uses geo check-in" is true and "ARK enforces geo check-in" is false.
Migrating ARK into an enforcing mode would start **rejecting check-ins that
succeed today** — the silent behaviour change this phase forbids.

Hence two independent settings rather than one: `checkin_mode` (`normal` /
`geo`) and `checkin_geo_enforced`. ARK is `geo` + `enforced = false`.

## 3. The 11.7 km trap

`organization_branches` already held an ARK row named "Senior Campus" at
`13.0827, 80.2707` — **11,750 m** from the campus the code actually geofences
against. Defaulting the new `is_checkin_location` flag to `true` would have
turned that row into a live geofence and moved ARK's check-in by nearly twelve
kilometres, on a table nobody would have thought to re-check.

It defaults to **false**. Locations opt in. Asserted by test with the real
distance.

## 4. New architecture

```
Current organization  (current_org_id(), never a client parameter)
        ↓
attendance_settings.checkin_mode          normal │ geo
        ↓                                          ↓
   no geolocation                      organization_branches
   requested at all                    WHERE is_checkin_location
        ↓                                AND is_active
   record staff/date/time                     ↓
                                        nearest by haversine
                                              ↓
                                    distance ≤ per-location radius
                                     (falls back to org default)
                                              ↓
                                   verified │ outside_radius │
                                   low_accuracy │ no_locations
                                              ↓
                                   enforced? reject : record + flag
```

**Reuse, not duplication.** No new locations table and no new settings table:

| Need | Existing table | Added |
|---|---|---|
| Locations | `organization_branches` | `geo_radius_meters`, `maps_url`, `timezone`, `is_checkin_location` |
| Settings | `attendance_settings` (org singleton) | `checkin_mode`, `checkin_geo_enforced`, `checkin_default_radius_meters`, `checkin_min_accuracy_meters` |
| Record | `teacher_attendance` | `location_id`, `distance_meters`, `accuracy_meters`, `verification_mode`, `verification_status` + checkout equivalents |

### Why the server resolves the location

`resolve_checkin_location(_lat, _lng, _accuracy)` takes **coordinates, never a
`location_id` and never an organization**. A browser that names its own
location id can name *any* id, including another tenant's, and the geofence
becomes a suggestion. The candidate set is built from `current_org_id()` inside
the function, so there is no parameter to spoof.

`SECURITY DEFINER` with an explicit `WHERE b.organization_id = org`,
deliberately: the scoping then survives a later loosening of the RLS policy on
`organization_branches`.

### Guards enforced by the database, not the form

- `CHECK`: a check-in location must have valid coordinates.
- `CHECK`: radius between 10 m and 100 km.
- Trigger: `checkin_mode = 'geo'` is refused when the organization has no
  active, coordinate-bearing check-in location — *"Configure at least one
  verified location before enabling location verification."*
- Every new `teacher_attendance` column is **nullable**; no historical row is
  rewritten, backfilled or recalculated.

## 5. ARK compatibility

Migration `20260914_phase8a` seeds ARK's **existing** configuration into ARK's
own rows: the same two coordinates, the same 200 m radius, mode `geo`,
enforcement `off`. Behaviour is reproduced exactly; only the storage moved —
the same pattern as the Phase 7A branding seed.

Verified live:

```
slug          checkin_mode  enforced  default_radius  checkin_locations  total_branches
ark           geo           false     200             2                  3
abc-academi   normal        false     150             0                  1
```

The third ARK branch (the 11.7 km one) is **not** a check-in location.

### ⚠ The source constant is intentionally still there

`AppDataContext.CAMPUS_LOCATIONS` and `isNearCampus()` were **not deleted**.
The three dashboards still call them, so ARK's live check-in path is byte-for-
byte unchanged by this phase.

This is deliberate sequencing, not an oversight: the database now holds the
same coordinates, and a Phase 8B can repoint those three call sites at
`checkinService.resolve()` and delete the constant. Doing both in one change
would have meant altering ARK's production check-in path in the same commit
that introduced the mechanism — with no way to roll back one without the other.

A test pins the seed to the source: if either set of coordinates changes
without the other, the gate fails.

**Remaining hardcoded coordinates:** the two in `AppDataContext.tsx` (live, awaiting
8B) and the two in `core/constants/config.ts` (feeding `staff/utils/geo.ts`,
which has no callers — the Phase 7 gate asserts it stays that way).

## 6. Anti-spoofing posture

GPS is **a location signal, not identity verification**, and nothing here
claims otherwise. A rooted device can report any coordinate.

What is recorded: latitude, longitude, device-reported accuracy, distance,
resolved location, timestamp, verification status. `checkin_min_accuracy_meters`
is opt-in and **flags** rather than rejects — a phone reporting ±2 km is not
evidence of anything, but refusing it outright would strand staff on poor GPS.
A genuine out-of-radius result is never downgraded to `low_accuracy`; being far
away is the stronger fact.

## 7. Performance

One settings read per session (cached, cleared on save) and one indexed query
over the tenant's own locations — a partial index on
`(organization_id) WHERE is_checkin_location AND is_active`. A tenant with five
locations inspects five rows. Distance is computed in SQL over that small set;
no PostGIS dependency, no N+1.
