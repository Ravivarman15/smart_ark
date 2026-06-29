# Student Import — Enterprise Finalization (Phase 2)

Builds on the family-aware duplicate engine (Phase 1, `docs/STUDENT_IMPORT_FAMILY_DEDUP.md`).
**Nothing from Phase 1 was rewritten** — `duplicateEngine.ts`, `buildImportPreview()`,
`commitPlan()`, `groupFamilies()`, the import UI, service and progress system are all reused and
extended. This phase makes the importer production-ready for real institutions.

---

## What shipped

| # | Capability | Where |
|---|---|---|
| 1 | **Smart column detection** — many more header aliases (Candidate Name, Admission/Reg No, Guardian Mobile…) + **manual override** per column before import | `utils/constants.ts`, `importMapping.rowsToImportRecords(matrix, overrides)`, `OVERRIDE_TARGETS`; page mapping panel |
| 2 | **Data cleaning** — phones → digits (keeps country code), names → Title Case, whitespace collapsed, mixed dates → `YYYY-MM-DD`, emails lower-cased | `utils/dataCleaning.ts`, applied in `rowsToImportRecords` |
| 3 | **Smart family detection** — union-find over parent mobile / email / name+address; stats: families, single-child, multi-child, largest | `duplicateEngine.groupFamilies` (union-find), `importMapping.buildFamilyDashboard` |
| 4 | **Import validation** — missing class/admission/mobile/year, invalid DOB/email/phone, duplicate admission/student-id/roll — as **warnings**, never silent rejection | `importMapping.buildImportPreview` → `preview.validation[]` |
| 5 | **Import conflict center** — existing vs incoming side-by-side, matched fields, confidence, per-row action (Import as New / Update Existing / Merge / Skip) + Apply to all | `StudentsImportPage` duplicate-review + `ConflictCol` |
| 6 | **Import history** — imported / updated / skipped / errors / families / duration / status, with extended columns | migration + `import.service.commitPlan` + history tab |
| 7 | **Import rollback** — undo a batch: deletes **only** students it created (tagged `import_batch_id`); never touches manual students or other imports | `import.service.rollbackBatch`, `students.deleteByBatch`, `useRollbackImport` |
| 8 | **Bulk performance** — bounded chunked commit (×25) for 20k+, realtime progress, **pause / resume / cancel**, memory-safe (no full result set held) | `commitPlan` + `ImportControl`; page pause/resume/cancel |
| 9 | **Import report** — downloadable **CSV and Excel**: imported/updated/skipped/merged, families, errors, warnings, confidence, reason | page `downloadReportCsv` / `downloadReportExcel` (lazy `xlsx`) |
| 10 | **Import analytics** — students imported, updated, families, average confidence, processing time, rows/sec | page post-import panel |
| 11 | **Security** — only **admin / management / coordinator** may import / roll back (menu RBAC + in-page gate + RLS); every import & rollback **audited** | `menu.config` (adminCoordMgmt), page gates, `student_import_audit` |
| 12 | **Final validation** — TS / ESLint / Vitest / Build + the 4 required scenarios | `testing/studentImportEnterprise.test.ts` |

---

## Import flow

```
Upload XLSX/CSV ─► parse ─► CLEAN each cell (phone/name/date/email/text)
   │
   ▼
Auto-map columns (aliases) ──► operator can OVERRIDE any column ──┐
   │                                                              │ (re-parse)
   ▼ ◄────────────────────────────────────────────────────────────┘
buildImportPreview  =  groupFamilies (union-find)
                       + weighted duplicate engine (existing + in-file)
                       + per-row validation warnings
   │
   ▼
PREVIEW: New · Possible dup · Duplicates · Family members · Missing data
         · Invalid mobile · Errors  +  Family dashboard (single/multi/largest)
   │
   ▼
CONFLICT CENTER (per flagged row): existing ⇄ incoming, confidence, matched
         fields → action [Import as New | Update Existing | Merge | Skip] + Apply to all
   │
   ▼
commitPlan { inserts (tagged import_batch_id), updates } — chunked ×25
         · realtime progress · PAUSE / RESUME / CANCEL · per-row isolated
   │
   ▼
history row (imported/updated/skipped/errors/families/duration/status)
         + audit('import')  ──►  ANALYTICS (rows/sec, time, avg confidence)
                                  + downloadable report (CSV / Excel)

ROLLBACK (history tab) ─► deleteByBatch(import_batch_id) ─► audit('rollback')
         deletes ONLY students created by that batch.
```

## Duplicate / conflict resolution

Unchanged weighted engine: Admission/Student-ID = 100, Roll+Class = 95, Name+DOB+Mobile = 90 …
**parent mobile alone = 10 (family signal, never a duplicate)**, with the decisive-identifier veto.
Bands: `≥85` duplicate · `50–84` possible · `<50` new. See the Phase-1 doc for the full table.

---

## Database changes

Migration `supabase/migrations/20260629_student_import_enterprise.sql` (additive, idempotent, no
data migrated):

- **`student_import_batches`** += `updated_rows, skipped_rows, warning_rows, families, duration_ms,
  status, rolled_back_at, rolled_back_by`.
- **`students`** += `import_batch_id uuid` (FK → batches, `ON DELETE SET NULL`) + partial index.
- **`student_import_audit`** (id, batch_id, action, actor_id, detail jsonb, created_at) + RLS:
  read = authenticated, write = admin/management/coordinator.

Everything degrades gracefully before the migration runs (column-fallback drops unknown columns;
history falls back to the base column set; audit writes are fire-and-forget).

> The Phase-1 review still holds: **no UNIQUE constraint on any phone/mobile column** — and none is
> added. Uniqueness rests on institutional identifiers.

---

## Performance report

- **Parsing + cleaning:** single O(n) pass; cleaning is per-cell pure string ops.
- **Family grouping:** union-find with path-halving over the file's signals — near-linear.
- **Duplicate scoring:** indexed candidate gathering (Map buckets) — each row compares against a
  handful of real candidates, never the full table. A 20,000-row file does not degrade to O(n²).
- **Commit:** bounded concurrency — chunks of 25, `Promise.allSettled` per chunk, progress emitted
  per chunk. Only one chunk is in flight at a time, so memory stays flat regardless of file size.
  Pause/cancel is checked between chunks (cooperative; no thread/worker needed). Duration and
  rows/sec are measured and stored on the batch.
- **Bundle:** `xlsx` is lazy-imported only when an Excel report is generated.

Indicative: a 20k import is ~800 chunked writes; throughput is dominated by Supabase round-trips,
not client work. Rows/sec is surfaced live in the analytics panel.

---

## Import report sample (CSV/Excel columns)

```
row,name,status,action,confidence,matched_fields,family_id,admission_no,roll_number,mobile,email,class,reason,warnings,suggested_fix
2,Arjun,valid,import_new,,,FAM-0001,ADM-1,5A1,919876543210,,5,,,
3,Akhil,valid,import_new,,,FAM-0001,ADM-2,7B2,919876543210,,7,,,
4,Ananya,valid,import_new,,,FAM-0001,ADM-3,10C3,919876543210,,10,,,
5,Old Student,duplicate,skip,100%,Admission/Enrolment No,,ADM-1,,919876543210,,5,"Matches an existing student (100% — Admission/Enrolment No)",Duplicate admission number,"Confirmed match — Skip, or choose Update Existing to refresh the record"
```

## Audit report sample (`student_import_audit`)

```
action    | actor        | detail
----------+--------------+------------------------------------------------------------
import    | <profile_id> | {"file":"jan-intake.xlsx","created":318,"updated":4,"errors":0,
          |              |  "skipped":2,"warnings":11,"families":126,"durationMs":21840,"status":"completed"}
rollback  | <profile_id> | {"deleted":318}
```

## Rollback verification

1. Import a file → N students created, each tagged with the batch's `import_batch_id`; history shows
   the run; `audit('import')` written.
2. Manually create an unrelated student (no batch id).
3. History → **Roll back** (admin/management only) → confirm dialog → `deleteByBatch(batchId)`.
4. Result: exactly the N batch students are removed; the batch is marked `rolled_back`;
   `audit('rollback', {deleted:N})` written; **the manually created student and any other import's
   students remain untouched** (the delete is scoped strictly to `import_batch_id = batchId`).

This is covered structurally by `students.deleteByBatch` (single `.eq("import_batch_id", batchId)`)
and the rollback flow in `import.service.rollbackBatch`.

---

## Files

**New**
- `src/features/students/utils/dataCleaning.ts`
- `src/features/students/testing/dataCleaning.test.ts`
- `src/features/students/testing/studentImportEnterprise.test.ts`
- `supabase/migrations/20260629_student_import_enterprise.sql`
- `docs/STUDENT_IMPORT_ENTERPRISE.md`

**Modified**
- `utils/importMapping.ts` — override-aware parsing + cleaning, validation warnings, family stats, `recordToIdentity`/family wiring
- `utils/duplicateEngine.ts` — union-find family grouping (mobile/email/name+address)
- `utils/constants.ts` — expanded column aliases (Admission/Reg No, Candidate Name, …)
- `services/import.service.ts` — batch-id tagging, pause/cancel, extended history, rollback, audit, analytics
- `services/students.service.ts` — `importBatchId` mapping + `deleteByBatch`
- `hooks/useStudentImport.ts` — commit stats/control + `useRollbackImport`
- `types/student.types.ts` — `importBatchId`, extended `ImportBatch`, `ImportControl`, `ImportRunStats`
- `pages/StudentsImportPage.tsx` — manual mapping, conflict center, pause/resume/cancel, analytics, CSV/Excel report, history rollback, RBAC gate
- `core/navigation/menu.config.ts` — import visible to coordinator (admin/management/coordinator)

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS (0 errors) |
| `eslint` (changed files) | ✅ PASS (0 errors/warnings) |
| `vitest` (full suite) | ✅ PASS — 317/317 (incl. RBAC route/registry audits) |
| `vite build` | ✅ PASS |

### Final scenarios (`testing/studentImportEnterprise.test.ts`)
1. Three siblings, same parent mobile + address, different classes → **all import**, one family ✅
2. Twins, same DOB, different admission number → **both import** ✅
3. Duplicate admission number (vs existing student) → **detected** (100%) ✅
4. Different parents, same student name → **both import** ✅
