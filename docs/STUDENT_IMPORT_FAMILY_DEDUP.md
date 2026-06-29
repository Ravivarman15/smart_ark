# Student Import — Family-Aware Duplicate Detection

Redesigns the Student Import duplicate engine so a **mobile number is never a
unique student identifier**. One parent can have many children sharing the same
mobile / email / address / parent name — those are **family members**, not
duplicates. A record is only a duplicate when enough *identity* fields agree.

> **Scope honoured:** the existing importer (parsing, column auto-mapping,
> academic resolution, auto-create, chunked commit, history) is **reused
> unchanged**. Only the duplicate-detection engine was improved and the preview
> UI extended. No data migration; full backward compatibility.

---

## The bug

The old `findDuplicate` treated `mobile` and `email` as stand-alone dedup keys:

```
Parent 9876543210 → Arjun (Class 5), Akhil (Class 7), Ananya (Class 10)
old engine: row 2 & 3 → "Duplicate Mobile" → SKIPPED      ❌ only 1 imported
new engine: shared mobile = family signal (10%) → all 3 imported  ✅
```

---

## Weighted scoring (`utils/duplicateEngine.ts`, pure + unit-tested)

| Signal | Score |
|---|---|
| Student ID (biometric) equal | **100** |
| Admission / Enrolment No equal | **100** |
| GR No equal | **100** |
| Roll No equal **+ same Class/Year** | **95** |
| Name + DOB + Parent Mobile equal | **90** |
| Name + DOB equal | **80** |
| Name + Parent Mobile equal | **70** |
| Name + Address equal | **65** |
| Roll No equal (no class context) | **60** |
| **Parent Mobile equal ONLY** | **10** (family signal) |
| **Parent Email equal ONLY** | **10** (family signal) |

**Bands:** `≥85` → **duplicate**, `50–84` → **possible duplicate** (review),
`<50` → **new** (imports).

**Decisive-identifier veto:** when both records carry a Student ID / Admission /
GR No and they are present-and-different (and none match), they are **different
people** — the score is capped below the duplicate band. This is what makes
*"same name + same DOB, different admission number"* import as a new student.

### Why the spec cases behave correctly

| Case | Result |
|---|---|
| 3 siblings, same parent mobile, different names/classes/rolls | only mobile matches → 10 → **all import** |
| Twins: same DOB, different names, different admission | name differs → veto → **new** |
| Identical name + DOB, different parent + different admission | veto → **new** (not a duplicate) |
| Same student re-imported (same admission / id) | 100 → **duplicate detected** |
| Same student re-imported (name+DOB+mobile, no id) | 90 → **duplicate detected** |

---

## Duplicate-detection flow

```
            ┌────────────── one import row ──────────────┐
            │  build IdentityFields (id/admission/roll/   │
            │  name/dob/parentMobile/email/class/address) │
            └───────────────────┬────────────────────────┘
                                ▼
        ┌──── score vs EXISTING students ────┐   ┌──── score vs EARLIER rows in file ────┐
        │ findBestMatch(identity, existing)  │   │ findBestMatch(identity, seen-so-far)  │
        │  (indexed candidates, not a scan)  │   │  (grows as we walk the file)          │
        └──────────────┬─────────────────────┘   └───────────────┬───────────────────────┘
                       └──────────── take higher score ───────────┘
                                ▼
                 decisive-id veto?  (cap < duplicate band)
                                ▼
                 classify:  ≥85 duplicate · 50–84 possible · <50 new
                                ▼
         status + confidence% + matchedFields + existingId + familyId
```

Candidate gathering is **indexed** (Student ID / Admission / GR / Roll / Name+DOB
/ Name+Mobile / Name buckets), so each row compares against a handful of real
candidates — never the whole student table. Mobile-only pairs are never even
compared (they could only score 10), which keeps big files fast.

## Import flow

```
Upload XLSX/CSV → parse → auto-map columns → resolve academic refs (Setup)
   → buildImportPreview (weighted engine + groupFamilies)
   → PREVIEW: Total · New · Possible dups · Duplicates · Family members
              · Missing data · Invalid mobile · Errors  +  Family dashboard
   → per-flagged-row ACTION: Import as New · Update Existing · Merge · Skip
              (+ Apply to all)
   → commitPlan { inserts, updates }  (chunked ×25, per-row isolated)
   → student_import_batches history row + post-import distribution analytics
```

---

## Family support

`groupFamilies()` assigns a **Family ID** (`FAM-0001`…) by shared parent mobile
(primary) or parent name + address (fallback). The preview shows a **Family
Dashboard**: Families · Parents · Children · Students sharing mobile / address /
parent. Siblings land in one family and import as **distinct students**.

---

## Duplicate actions

For every flagged row (duplicate / possible): **Import as New · Update Existing ·
Merge · Skip**, plus **Apply to all**. Update/Merge patch the matched existing
student (`existingId`) via `studentsService.update`; with no match they fall back
to a new insert. The commit plan splits rows into `inserts` + `updates` and
records one history entry.

## Error report

`Download report` → CSV with **Row · Name · Status · Confidence% · Matched fields
· identity columns · Family ID · academic refs · Reason · Suggested fix**.

---

## Database

**No schema change is required for the fix** — it was a client bug. Migration
`20260629_student_import_family_dedup.sql` is additive:

- Documents the **constraint review**: there is **no UNIQUE constraint on any
  phone/mobile column** (`student_contact` / `parent_contact` / `mother_contact`)
  in any migration — the DB never enforced mobile uniqueness, and we add none.
- Adds **non-unique** partial lookup indexes (`parent_contact`, `mother_contact`,
  `parent_name`, `date_of_birth`) to speed existing-student matching on large
  databases. Guarded + idempotent; no data migrated.

Student uniqueness rests on institutional identifiers (`enrolment_no` / `gr_no` /
`biometric_id`), **not** the parent's phone.

---

## Performance

- **Engine:** O(1)-ish per row — candidate gathering is indexed by Map buckets;
  a 20,000-row file scores against small candidate sets, not the full table.
  Family grouping is a single O(n) bucket pass. Pure functions, no I/O.
- **Commit:** unchanged — bounded-concurrency chunks of 25 with per-row
  isolation (`Promise.allSettled`) and a live progress bar; one bad row never
  aborts the run. Inserts then updates share one progress total.
- **Preview** recomputes via `useMemo`, so re-scoring only runs when the file,
  Setup data, or existing students change.

---

## Files

**New**
- `src/features/students/utils/duplicateEngine.ts` — weighted engine + family grouping (pure)
- `src/features/students/testing/duplicateEngine.test.ts` — 16 tests (incl. the 3-sibling scenario)
- `supabase/migrations/20260629_student_import_family_dedup.sql` — additive indexes + constraint review
- `docs/STUDENT_IMPORT_FAMILY_DEDUP.md`

**Modified**
- `src/features/students/utils/importMapping.ts` — engine integration, family grouping, `possible_duplicate` status, confidence/matchedFields/existingId/familyId, family dashboard summary; mobile/email removed as stand-alone dedup keys
- `src/features/students/pages/StudentsImportPage.tsx` — preview tiles, family dashboard, duplicate-action selectors + apply-to-all, enriched error report, action-aware commit
- `src/features/students/services/import.service.ts` — `commitPlan({inserts, updates})`; `commit` delegates (back-compat)
- `src/features/students/hooks/useStudentImport.ts` — optional `updates` in the commit mutation

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS (0 errors) |
| `eslint` (changed files) | ✅ PASS (0 errors/warnings) |
| `vitest` (full suite) | ✅ PASS — 301/301 (16 new duplicate-engine tests) |
| `vite build` | ✅ PASS |

The decisive test — three siblings sharing one parent mobile — all import as
distinct students, while a true duplicate (same enrolment no as an existing
student) is still flagged. See
`src/features/students/testing/duplicateEngine.test.ts`.
