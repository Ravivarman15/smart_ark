# Student Profile Foundation Upgrade

Extends the **core Student profile model** with shared fields every module can reuse — without
redesigning any module or the Student 360° Report layout. Purely additive and backward-compatible.

## New fields (camelCase ↔ column)

| Field | Column | Notes |
|---|---|---|
| section | `section` | text |
| transportRequired | `transport_required` | bool, default false |
| transportRouteId | `transport_route_id` | uuid |
| hostelRequired | `hostel_required` | bool, default false |
| hostelRoomId | `hostel_room_id` | uuid |
| medicalConditions | `medical_conditions` | text |
| allergies | `allergies` | text |
| bloodGroup | `blood_group` | text (added IF NOT EXISTS) |
| emergencyContactName/Number/Relation | `emergency_contact_*` | text |
| communicationPreference | `communication_preference` | WHATSAPP·EMAIL·SMS·BOTH·NONE (CHECK, NULL ok) |
| parentPreferredLanguage | `parent_preferred_language` | text |
| studentStatus | `student_status` | ACTIVE·INACTIVE·LEFT·TRANSFERRED·ALUMNI (CHECK, NULL ok) |

## Migration

`supabase/migrations/20260630_student_profile_foundation.sql` — `ADD COLUMN IF NOT EXISTS` only;
NULLable; enum CHECKs allow NULL; backfills `student_status` from `is_active`; partial indexes
`idx_students_transport_queue` / `idx_students_hostel_queue` for the assignment queues.

## Flow

```
Add/Edit Student form  ─┐
Student Import (aliases)─┼─► StudentWriteInput ─► students.service.toDb (column-fallback safe)
                         │                                   │
                         │                                   ▼
                         │                              students table (new columns)
                         ▼                                   │
   importMapping.coerceProfileFields()                       ├─► Student 360° Report (Profile/Medical/
   (Yes/No→bool, "WhatsApp"→WHATSAPP)                        │     Emergency/Transport/Hostel populated)
                                                             ├─► studentProfileHealthService.metrics()
                                                             │     ├─ Dashboard: "Student Profile Health" widget
                                                             │     ├─ Transport queue (required & no route)
                                                             │     └─ Hostel queue (required & no room)
                                                             └─► commsPreference.partitionByPreference()
                                                                   WHATSAPP→WA only · NONE→skip+reason
```

## Module reuse

- **Student form** — new "Logistics, Health & Communication" section (Add + Edit).
- **Student Import** — smart aliases auto-map Section, Blood Group, Transport, Hostel, Emergency
  Contact, Medical Notes, Communication Preference, Status; booleans + enums normalised.
- **Student 360° Report** — Section 2 now shows real Section / Emergency / Medical / Allergies /
  Transport / Hostel / Communication Preference / Status (layout unchanged).
- **Communication** — `utils/communicationPreference.ts`: `channelsForPreference`, `decideChannel`
  (logs skip reason), `partitionByPreference`. Reusable by any send path; NONE → skip, unknown →
  allow-all (never blocks legacy students).
- **Transport / Hostel** — no module exists yet, so the foundation exposes the **assignment queues**
  as data (`studentProfileHealthService` → `transportQueue` / `hostelQueue`) for a future module to
  consume; counts surface on the dashboard now.
- **Data Health** — import-preview checks (emergency / comm-preference / section) +
  DB-wide `studentProfileHealthService` percentages.
- **Dashboard** — new `card.studentProfileHealth` widget (management/admin/coordinator): students
  requiring Transport/Hostel (+unassigned), and counts/% missing Emergency Contact / Blood Group /
  Communication Preference.

## Backward Compatibility Report

- Migration is additive; **no column removed/altered**; new columns NULLable; enum CHECKs allow NULL.
- Existing students keep working: reads use `SELECT *` (absent columns → `undefined`); writes use the
  per-column fallback (`safeInsert/UpdateWithColumnFallback`) so a pre-migration DB silently drops the
  new keys instead of erroring.
- The communication `commsRecipients` query was **left untouched** (adding columns to its fixed
  SELECT could have returned `[]` pre-migration) — preference is applied via the pure helper instead.
- Unknown/empty `communication_preference` = allow all channels → no student is silently muted.
- `studentProfileHealthService` returns honest zeros if the columns aren't migrated yet.

## Performance Report

- Profile-health aggregation is a single paginated `SELECT *` over active students (1000/page),
  cached 60s; the transport/hostel queues come from the same pass (no extra query).
- Import coercion is O(1) per row over a handful of fields — no measurable impact (20k-row pipeline
  still ~27–57k rows/sec in `studentImportPerformance.test.ts`).
- Pure preference/health helpers are allocation-light and unit-tested.

## Quality gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS — 0 errors |
| `eslint` (changed files) | ✅ PASS — 0 errors |
| `vitest` (students + communication) | ✅ PASS — 121/121 (incl. 5 new foundation tests) |
| `vite build` | ✅ PASS |

## Modified / new files

**New**
- `supabase/migrations/20260630_student_profile_foundation.sql`
- `src/features/students/services/studentProfileHealth.service.ts`
- `src/features/students/hooks/useStudentProfileHealth.ts`
- `src/features/communication/utils/communicationPreference.ts`
- `src/features/dashboard/widgets/StudentProfileHealthCard.tsx`
- `src/features/students/testing/profileFoundation.test.ts`
- `docs/STUDENT_PROFILE_FOUNDATION.md`

**Modified**
- `src/features/students/types/student.types.ts` — Student + StudentWriteInput + enums
- `src/features/students/services/students.service.ts` — StudentRow / toDomain / toDb
- `src/features/students/utils/constants.ts` — option lists + smart aliases
- `src/features/students/utils/dataCleaning.ts` — emergency name/number cleaners
- `src/features/students/utils/importMapping.ts` — boolean/enum coercion
- `src/features/students/utils/dataHealth.ts` — new import-preview checks
- `src/features/students/schemas/student.schema.ts` — new fields
- `src/features/students/pages/StudentRegistrationPage.tsx` — form section
- `src/features/students/services/student360.service.ts` — populate report sections
- `src/features/students/hooks/index.ts` — export profile-health hook
- `src/features/communication/utils/index.ts` — export preference helper
- `src/features/dashboard/types/dashboard.types.ts` + `registry.ts` — widget registration
