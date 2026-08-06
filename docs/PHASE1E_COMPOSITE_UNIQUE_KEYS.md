# Phase 1E — Composite Unique Keys & Tenant-2 Readiness

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 7 August 2026
**Migration:** `20260807_phase1e_composite_unique_keys.sql` (+ paired rollback)
**Prerequisite:** Phase 1 (1A–1D) deployed

---

## 1. Executive Summary

Phase 1E is the work Phase 1 deliberately deferred: it lifts the second-organization guard.

| Deliverable | Status |
|---|---|
| Convert cross-tenant-colliding unique constraints to `(organization_id, …)` | ✅ 16 constraints |
| Update every dependent `onConflict` call site **in the same commit** | ✅ 12 sites, 10 files |
| Relocate legacy storage objects under `{organization_id}/` | ✅ script (operator-run) |
| Set `composite_unique_keys` + `storage_org_partitioned` readiness flags | ✅ **earned, not asserted** |
| Cross-tenant probe across every scoped table | ✅ runnable, transaction-safe |

**Nothing in ARK changes.** With one tenant, `UNIQUE(key)` and `UNIQUE(organization_id, key)` accept and reject exactly the same rows.

---

## 2. Which constraints actually needed changing

Not all of them — and getting this wrong in either direction is expensive.

A unique constraint is **already correct** under multi-tenancy when at least one column is a foreign key to an org-scoped entity. That entity belongs to exactly one organization, so the tuple cannot collide across tenants:

```
student_attendance UNIQUE(student_id, date)     ← SAFE  (student_id anchors it)
exam_results       UNIQUE(exam_id, student_id)  ← SAFE
payroll_items      UNIQUE(run_id, staff_id)     ← SAFE
```

It is **unsafe** only when every column is an organization-agnostic scalar:

```
system_settings     UNIQUE(key)        ← org B silently overwrites org A's settings
campuses            UNIQUE(name)       ← no two tenants can have a "Main Campus"
attendance_settings UNIQUE(singleton)  ← ONE attendance policy for the whole PLATFORM
```

**Converting the safe ones too would look more secure and be strictly worse.** It buys zero isolation and forces edits to 14 additional `onConflict` call sites — every one a chance to break attendance marking or exam entry, on a live institute. Restraint here is the engineering decision, not laziness.

### Converted (16)

| Table | Was | Call site |
|---|---|---|
| `settings_sms_automations` | `(automation_key)` | ✅ |
| `attendance_alerts` | `(dedupe_key)` | ✅ |
| `comms_automation_settings` | `(event_key)` | ✅ |
| `payroll_role_rates` | `(role)` | ✅ |
| `rbac_role_actions` | `(role, action_id)` | ✅ ×2 |
| `rbac_role_permissions` | `(role, module_id, submodule_id)` | ✅ ×2 |
| `dashboard_layouts` | `(scope)` | ✅ |
| `attendance_closings` | `(scope, month)` | ✅ |
| `attendance_locks` | `(scope, period_type, period_key)` | ✅ |
| `attendance_settings` | `(singleton)` | ✅ |
| `campuses` | `(name)` | — |
| `system_settings` | `(key)` | — |
| `rbac_roles` | `(slug)` | — |
| `comms_templates` | `(template_key, version, language)` | — |
| `daily_report_log` | `(date)` | — |
| `settings_whatsapp_config` | unique index `(singleton)` | — |

### Deliberately excluded — `settings_referrals.referral_code`

A referral code is quoted to a person **outside** the platform ("use code ARK2026"). Redemption must resolve it *without already knowing which organization it belongs to*, so global uniqueness is the correct semantics, not an oversight. The mechanical detector is told about this exception by name so it stays visible rather than being silently skipped.

---

## 3. Why the call sites still work

PostgREST emits `ON CONFLICT (<cols>)`, and Postgres matches an index by column **set** — order-independent, but it must match **exactly**. A converted constraint with an unchanged `onConflict` string throws:

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

…at runtime, on a production write path, with nothing a compiler could have caught. So all 12 strings gained `organization_id,` **in this commit**.

**The client does not send `organization_id`.** The column DEFAULT (`public.current_org_id()`, from 1B) is applied during INSERT and **before** conflict detection, so the composite index resolves correctly from a payload that never mentions the tenant.

### The gate that keeps them in sync

`src/test/security/phase1e.test.ts` parses **both sides from the files** and cross-checks them — it does not assert a hand-written list twice:

- Every `onConflict:"…"` string in `src/`
- Every `(table, columns)` pair the migration converts

Then it fails if either side is missing its counterpart, in **both directions**:

| Mutation | Result |
|---|---|
| Revert one call site to the old string | ❌ `onConflict strings left behind by 1E: …locks.service.ts` |
| Add the prefix where no conversion happened | ❌ `onConflict prefixed but no matching conversion: …attendance.service.ts` |

Both were verified by actually introducing the mutation and confirming the failure — a gate that has never failed is unproven.

---

## 4. The detector: derived, not maintained

The list in PART 1 is a list, and lists rot. `public.unsafe_unique_constraints()` derives the answer from `pg_catalog`, so a constraint added by a **future** module is caught without anyone remembering to update anything:

> flag a unique constraint when it is on a tenant-scoped table, `organization_id` is not among its columns, **and** none of its columns participates in a foreign key to another tenant-scoped table.

**The readiness flag is set from the detector's own output, not from the fact that the migration ran:**

```sql
SELECT count(*) INTO remaining FROM public.unsafe_unique_constraints();
IF remaining = 0 THEN  UPDATE tenancy_readiness SET ready = true …
ELSE                   RAISE WARNING 'flag NOT set';
```

Setting it unconditionally would defeat the entire second-organization guard — the flag would report "safe" because a migration executed, not because the database is actually safe.

`mark_storage_partitioned()` applies the same principle: it re-counts un-prefixed objects itself rather than trusting the relocation script's tally.

---

## 5. Storage relocation

`scripts/relocate-storage-to-org.mjs` — `--dry-run` supported, resumable, one bucket at a time via `--bucket=`.

**It is a script, not a migration**, because moving objects is thousands of HTTP calls against the Storage API. It cannot join the migration's transaction and cannot be undone by the paired rollback file. Pretending otherwise would hand you a "rollback" that silently does nothing for the one step that touches customer files.

Safety properties, in order of importance:

1. **Copy → verify → delete.** A crash mid-run leaves the original readable rather than nothing at all. The destination is listed back before the source is removed.
2. **DB paths rewritten before the file is removed.** `finance_attachments.file_url` and `support_ticket_attachments.url` store the object path; deleting first would strand the row with no error until a user clicks the attachment.
3. **Refuses to run once a second organization exists.** Legacy objects carry no tenant marker, so ownership cannot be inferred — a guess would mis-file customer documents across tenants, the worst possible outcome.
4. **Skips `profile-pictures`** — deliberately public avatars, referenced by absolute URLs already stored in `profiles`.

---

## 6. Cross-tenant probe

`scripts/cross-tenant-probe.sql` — the test Phase 1 could not run.

**Safe against production:** the whole script runs in one transaction ending in `ROLLBACK`. The probe organization, its membership and its staff profile never survive.

**Inverted by design.** The naive probe — create tenant B, insert data for B, check A cannot see it — means satisfying every `NOT NULL` and foreign key across 167 tables. Instead: ARK already has thousands of rows in every table, so the probe becomes a member of tenant B and asserts it sees **zero** of them. Same guarantee, no synthetic data.

**The detail that makes it a real test.** The probe user is created as an **active `management` profile inside tenant B**. Without that, every count would be zero for the wrong reason — `is_staff()` would be false and role-gated policies would deny regardless of tenancy, so the probe would pass on a database with *no tenant isolation at all*.

Section 0 is a **control case**: with the same user claiming tenant A, it must see rows. If the control is empty the script reports `INCONCLUSIVE` rather than `PASS`. A test that cannot fail is not a test.

It checks four things, not one:

| # | Check |
|---|---|
| 0 | **Control** — the probe user can see data when claiming tenant A |
| 1–2 | **Read isolation** — every tenant-scoped table returns 0 rows of another tenant |
| 3 | **Write isolation** — an INSERT stamped with tenant A's id is rejected |
| 4 | **Default stamping** — an INSERT with no `organization_id` becomes tenant B's |

Counts exclude the probe's own rows (`WHERE organization_id <> $1`), so its own profile and membership cannot be reported as a false leak.

---

## 7. Files

**New:** `20260807_phase1e_composite_unique_keys.sql` (+ rollback), `scripts/relocate-storage-to-org.mjs`, `scripts/cross-tenant-probe.sql`, `src/test/security/phase1e.test.ts`, this document.

**Modified (10 files, 12 call sites):** `smsSettings`, `alerts`, `commsAutomationSettings`, `payrollConfig`, `actionRights` ×2, `rolePermissions` ×2, `dashboard`, `closing`, `locks`, `attendance/settings`.

**Unchanged and verified so:** `attendanceImport.service.ts` passes `onConflict` as a parameter — its callers use `"staff_id,date"` and `"student_id,date"`, both FK-anchored, correctly untouched.

---

## 8. PASS / FAIL Matrix

| Gate | Baseline | Phase 1 | Phase 1E | Verdict |
|---|---|---|---|---|
| Tests | 71 / 777 | 74 / 867 | **75 / 896** | ✅ **PASS** (+29, 0 regressions) |
| Production build | exit 0 | exit 0 | exit 0 | ✅ **PASS** |
| TypeScript | 527 | 527 | **527** | ✅ **PASS** — per-file **and** per-code counts identical |
| ESLint errors | 15 | 15 | **15** | ✅ **PASS** |
| ESLint warnings | 259 | 262 | **262** | ✅ **PASS** — no new |
| Phase 0 / 1 gates | 24 / 56 | — | 24 / 56 pass | ✅ no regression |
| Phase 1E gates | — | — | **29 pass** | ✅ **PASS** |
| Desync gate mutation-tested | — | — | both directions | ✅ **PASS** |
| Migration review | — | — | idempotent + rollback | ✅ **PASS** |
| Runtime probe | — | — | **not run** | ⏳ **PENDING DEPLOY** |

Unlike Phase 1, the TypeScript comparison was clean on the first check in **both** dimensions (per-file and per-error-code), so no interpretation is needed this time.

---

## 9. Deployment Guide

⚠️ **Migration and frontend must deploy together.** The build sends `onConflict: "organization_id,…"`; the constraints must already accept it. Deploy the migration first, then the frontend, in the same window.

- [ ] **1.** Verified backup / PITR restore point.
- [ ] **2.** Apply `20260807_phase1e_composite_unique_keys.sql`.
- [ ] **3. Read the output.** `Phase 1E: N constraint(s) converted, M skipped` — skips are expected for tables that don't exist live. Any `could not convert` warning means the constraint is the target of a foreign key; resolve before continuing.
- [ ] **4.** Confirm `composite_unique_keys → READY`. If it warns instead, `unsafe_unique_constraints()` still returns rows — they are listed in the output. **The flag is not set and tenant #2 stays blocked, correctly.**
- [ ] **5.** Deploy the frontend.
- [ ] **6. Smoke test the converted write paths specifically** — every one is an upsert that would throw if the constraint and the string disagree:
  - Lock and unlock an attendance period *(attendance_locks)*
  - Close and reopen an attendance month *(attendance_closings)*
  - Save attendance settings *(attendance_settings — singleton)*
  - Toggle a comms automation *(comms_automation_settings)*
  - Save a payroll role rate *(payroll_role_rates)*
  - Grant and revoke a permission in Manage Staff Role *(rbac_role_permissions, rbac_role_actions)*
  - Rearrange a dashboard *(dashboard_layouts)*
  - Save an SMS automation *(settings_sms_automations)*
  - Run the attendance automation scan *(attendance_alerts dedup)*
- [ ] **7.** `node scripts/relocate-storage-to-org.mjs --dry-run` — review the object counts.
- [ ] **8.** Run it for real. Expect `storage_org_partitioned → READY`.
- [ ] **9.** Re-test file access: open a finance attachment, a support attachment, a student document **as a parent**, and an emailed payslip link.
- [ ] **10.** Run `scripts/cross-tenant-probe.sql`. Require **`RESULT: PASS`** — `INCONCLUSIVE` is not a pass.
- [ ] **11.** Run `scripts/tenant-isolation-audit.sql`; §8 must now show **all flags ready**.
- [ ] **12.** Only now is organization #2 possible: `SELECT public.provision_organization('demo', 'Demo Institute');`

---

## 10. Rollback Guide

| Symptom | Action |
|---|---|
| An upsert throws *"no unique or exclusion constraint matching…"* | Constraint/frontend desync — deploy the matching pair, do **not** roll back the DB alone |
| `could not convert X` in migration output | That constraint is an FK target; drop the FK, re-run, re-add |
| Storage relocation failed partway | Re-run — it is resumable and skips already-prefixed objects |
| Probe reports a leak | **Stop. Do not create organization #2.** Fix the reported table first |

⚠️ **Rolling back 1E requires reverting the frontend in the same deploy.** The 1E build sends prefixed `onConflict` strings; against rolled-back constraints **every affected upsert fails at runtime** — attendance locks, closings, settings, comms automation, payroll rates, RBAC grants, dashboard layouts, SMS automations and alert dedup all stop writing. These two move together, in both directions. The rollback file says so at the top.

The rollback **refuses to run if more than one organization exists** — by then the composite keys are the only thing stopping tenants from overwriting each other's settings, roles and campus names.

**Storage relocation is not reversible by the rollback file.** Objects stay under `{organization_id}/`, which remains readable via the org-prefix branch of `storage_path_org_ok()`. No action needed; noted so nobody goes looking for a revert that does not exist.

---

## 11. Production Verification Checklist

- [ ] `SELECT * FROM public.unsafe_unique_constraints();` → **0 rows**
- [ ] `SELECT flag, ready FROM public.tenancy_readiness;` → **all `true`**
- [ ] All 9 converted write paths from §9.6 succeed
- [ ] `scripts/cross-tenant-probe.sql` → **`RESULT: PASS`** (not `INCONCLUSIVE`)
- [ ] `scripts/tenant-isolation-audit.sql` §1–7, 9, 11 clean; §12 row counts unchanged
- [ ] No un-prefixed storage objects outside `profile-pictures`
- [ ] Parent can open a child's document; emailed payslip link works
- [ ] A test `provision_organization()` call succeeds, then `deprovision_organization()`

---

## 12. What is now unblocked — and what still is not

**Unblocked:** organization #2 can be created. `provision_organization()` works. The guard passes once the flags are green.

**Still open, and honest about it:**

- **The probe has not been run against your database.** Every claim here is provable from the repository. `RESULT: PASS` from step 10 is what converts "isolated by construction" into "isolated in fact" — it is the single most important line of output in this phase.
- **Storage relocation has not been executed.** Until it is, legacy objects rely on the single-tenant tolerance in `storage_path_org_ok()`, which **fails closed the instant organization #2 exists**. Run step 8 *before* step 12, or ARK's own historical files become unreadable.
- **No load testing at multi-tenant scale.** Composite indexes are correct; their behaviour at 1,000 tenants is a Phase 11 concern.
- **`custom_access_token_hook` must be registered** (Phase 1 checklist step 11). Until it is, every session uses `fallback_org_id()` — which returns NULL the moment tenant #2 exists, so **every user loses access**. This is the one ordering mistake that would take ARK down: register the hook *before* creating organization #2.
