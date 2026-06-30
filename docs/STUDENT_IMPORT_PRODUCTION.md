# Student Import — Production Finalization (Phase 3, FINAL)

Builds on Phase 1 (`docs/STUDENT_IMPORT_FAMILY_DEDUP.md`) and Phase 2
(`docs/STUDENT_IMPORT_ENTERPRISE.md`). **Nothing from earlier phases was rewritten** —
`duplicateEngine.ts`, `buildImportPreview()`, `commitPlan()`, `import.service.ts`,
`useStudentImport.ts`, `StudentsImportPage`, Import History, Rollback, Family Detection,
Conflict Center and the Audit System are all reused and extended.

> **This is the final phase. No new Student Import features will be added.** The module is
> production-ready and frozen except for bug fixes and performance improvements.

---

## What shipped

| # | Capability | Where |
|---|---|---|
| 1 | **Incremental import** — for a matched existing student, write **only changed fields** (`changedPatch`); never overwrite existing data with a blank; show Previous → New per field; per-row Update / Ignore / Apply-to-all; never creates a duplicate | `utils/incrementalDiff.ts` (`diffStudent`, `changedPatch`, `isPromotionCandidate`); `StudentsImportPage` conflict center |
| 2 | **Cross-module linking** — surface which modules a student is (or isn't) wired to: Batch, Fee, Parent, Login/App access, etc. **Never created automatically** — one-click navigation only | `StudentsImportPage` post-import Action Center (navigate to assign-batch / app-access / chat / fees) |
| 3 | **Data Health report** — downloadable; missing parent mobile / email / DOB / admission / roll / blood group / address, students without batch / academic year, duplicate parent records | `utils/dataHealth.ts` (`buildDataHealth`, `rowHealthIssues`); page health panel + CSV download |
| 4 | **Import dashboard** — aggregate stats across all imports: total imports, students imported, updated, skipped, families, rolled back, avg processing time, errors | `utils/dataHealth.ts` (`summarizeImports`); page dashboard tab |
| 5 | **Smart promotion support** — a newer academic year / batch on a matched student is flagged as a **promotion candidate**, handled by the year-transfer flow; **academic placement is excluded from incremental overwrite** so historical records are never silently changed | `incrementalDiff.isPromotionCandidate`, `DIFF_FIELDS` (no academic ids) |
| 6 | **Post-import Action Center** — Assign Batch, Generate Logins / App access, Send message, Fees — without manual navigation hunting | `StudentsImportPage` action center |
| 7 | **Final audit** — Import ID / User / Time / Duration / Rows / Inserted / Updated / Skipped / Warnings / Errors / Families / status, every import + rollback logged | `student_import_audit`, `import.service.writeAudit`, history tab |
| 8 | **Performance** — verified at 50 / 500 / 5 000 / 20 000 rows; bounded chunked commit; pause/resume/cancel; memory-safe | `testing/studentImportPerformance.test.ts` |
| 9 | **Final verification** — TS / ESLint / Vitest / Build all green | this document |

Plus, on the **Add Student Registration** form: new fields **Group** (Science / Commerce / …),
**Category / Board** (State Board / CBSE / ICSE / …) and **Campus** (Senior / Junior).
Added to `StudentRegistrationPage`, `registrationSchema` and the write payload.

---

## Architecture / flow

```
Upload XLSX/CSV
   │
   ▼
parse ─► CLEAN each cell (phone / name / date / email)   [Phase 2]
   │
   ▼
auto-map columns (+ manual override)                     [Phase 2]
   │
   ▼
buildImportPreview = groupFamilies (union-find)
                   + weighted duplicate engine            [Phase 1]
                   + per-row validation warnings           [Phase 2]
   │
   ├─► DATA HEALTH (buildDataHealth)  ─► downloadable report
   │
   ▼
CONFLICT CENTER per flagged row:
   existing ⇄ incoming, confidence, matched fields
   │   action = [New | Update | Merge | Skip] + Apply-to-all
   │
   │   INCREMENTAL  ─► resolvePlan() computes changedPatch(existing,incoming)
   │                   • only changed, non-blank fields
   │                   • academic placement EXCLUDED (→ promotion candidate)
   ▼
plan = { inserts: StudentWriteInput[], updates: {id, data: Partial<…>}[] }
   │
   ▼
commitPlan()  ── chunk ×25, Promise.allSettled, pause/resume/cancel
   │            inserts tagged import_batch_id (client UUID, pre-history)
   │            updates patch ONLY changed fields
   ▼
students table  +  student_import_batches (history)  +  student_import_audit
   │
   ▼
POST-IMPORT ACTION CENTER ─► Assign Batch · App access · Message · Fees
   │                          (cross-module links — one click, never auto)
   ▼
IMPORT DASHBOARD (summarizeImports across all batches)
ROLLBACK (rollbackBatch) ─► deletes ONLY import_batch_id rows
```

---

## Performance report

Pure pipeline (`rowsToImportRecords → buildImportPreview → buildFamilyDashboard`), families of 3
siblings sharing a parent mobile + address, unique admission numbers, measured by
`studentImportPerformance.test.ts`:

| Rows | Time | Throughput | Correctness |
|------|------|-----------|-------------|
| 50 | 7 ms | ~7k rows/sec | all valid · families = ⌈n/3⌉ |
| 500 | 14 ms | ~36k rows/sec | ✓ |
| 5 000 | 159 ms | ~31k rows/sec | ✓ |
| 20 000 | 334 ms | ~60k rows/sec | ✓ |

(Numbers vary per run / machine; all runs stay far under the 15 s budget.) The DB commit is
separately bounded into chunks of 25 with cooperative pause/resume/cancel, so memory stays flat
regardless of file size — the full result set is never held in memory.

---

## Verification — PASS / FAIL

| Gate | Result |
|------|--------|
| `tsc --noEmit` | ✅ PASS — 0 errors |
| `eslint src/features/students/**` | ✅ PASS — 0 errors (6 pre-existing `exhaustive-deps` warnings in unrelated pages) |
| `vitest run src/features/students/testing` | ✅ PASS — **50/50 tests**, 6 files |
| `vite build` | ✅ PASS — production bundle builds (`StudentsImportPage` chunk emitted) |

Behaviour verified by the suite: incremental diff (only changed, never blank-overwrite, academic
excluded, promotion flagged), family-aware dedup (3 siblings same mobile all import; true dups
still caught), enterprise commit/rollback, data cleaning, and performance at scale.

---

## Modified / new files (Phase 3)

**New**
- `src/features/students/utils/incrementalDiff.ts`
- `src/features/students/utils/dataHealth.ts`
- `src/features/students/testing/incrementalDiff.test.ts`
- `src/features/students/testing/studentImportPerformance.test.ts`
- `docs/STUDENT_IMPORT_PRODUCTION.md` (this file)

**Modified**
- `src/features/students/pages/StudentsImportPage.tsx` — incremental updates via `changedPatch`,
  data-health panel + report, dashboard tab, post-import action center
- `src/features/students/pages/StudentRegistrationPage.tsx` — Group / Category-Board / Campus fields
- `src/features/students/schemas/student.schema.ts` — `campusId` / `groupName` / `category`
- `src/features/students/services/import.service.ts` — `ImportPlan.updates` typed `Partial<…>`
- `src/features/students/hooks/useStudentImport.ts` — incremental `updates` wiring

**Untouched (reused as-is):** `duplicateEngine.ts`, `buildImportPreview()`, `groupFamilies()`,
`commitPlan()` core, `rollbackBatch`, the audit system, and every non-import module.

---

## Frozen

The Student Import module is **production-ready and frozen**. Future changes are limited to bug
fixes and performance improvements — no new import features.
