# Phase 1 — Multi-Tenant Foundation

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 6 August 2026
**Migrations:** `20260806_phase1a` … `20260806_phase1d` (+ 4 paired rollbacks)
**Prerequisite:** Phase 0 deployed (`docs/PHASE0_SECURITY_HARDENING.md`)

---

## 1. Executive Summary

Smart ARK is now a multi-tenant platform at the database layer. Every business table carries `organization_id`, every RLS policy enforces it, every storage object is tenant-partitioned, and every edge function derives the tenant server-side.

**ARK Learning Arena becomes organization #1 automatically.** No manual SQL, no data migration, no downtime.

The number that matters: **1,243 `.from()` call sites, 207 services and all 26 feature modules were not modified.** Isolation lives entirely in the database.

| How | Why it works |
|---|---|
| `organization_id NOT NULL DEFAULT public.current_org_id()` | The app never sends a tenant — **Postgres stamps it on every INSERT**. Existing write code is already correct. |
| RLS wraps every policy: `organization_id = current_org_id() AND (<original>)` | Existing read code is already filtered. For ARK the conjunct is always true, so **behaviour is byte-for-byte identical**. |
| `current_org_id()` reads a **JWT claim**, never a table | One integer comparison per policy, not a subquery across 167 tables. |

### The two decisions that shaped this phase

**1. Existing policies are WRAPPED, never rewritten.** The 362 policies encode months of authorization logic — coordinator-owns-standard, parent-of-this-student, fee-collector, leave-approver. Hand-rewriting them was the single most likely way to break ARK. Instead the migration reads `pg_policies.qual` and issues `ALTER POLICY … USING (org_conjunct AND (<original>))`. Every rule survives verbatim inside the parentheses.

**2. Global unique constraints are deliberately NOT changed — and a database trigger enforces that consequence.** Detail in §3.3. This is the most important thing to understand about Phase 1, and the reason it is safe to deploy despite being incomplete.

---

## 2. Architecture Changes

```
BEFORE                                   AFTER
──────                                   ─────
auth.users                               auth.users
    │                                        │
    ├─ profiles      (staff)                 ├── organization_users ──► organizations
    ├─ parent_auth_accounts                  │      (membership)              │
    └─ student_auth_accounts                 │                                │
                                             ├─ profiles ────────────────────►│
167 tables, no tenant                        ├─ parent_auth_accounts ────────►│
362 policies, no tenant                      └─ student_auth_accounts ───────►│
                                                                              │
                                             167 tables · organization_id ───►┤
                                             362 policies · org conjunct      │
                                             storage {org}/…                  │
                                                                              │
                                    JWT app_metadata.organization_id ─────────┘
                                             ▲
                                    custom_access_token_hook
```

**Membership is its own table, not a column on `profiles`.** A real person can be staff at one organization and a parent at another (a teacher whose child studies elsewhere on the platform). `profiles.organization_id` would foreclose that permanently. `organization_users` also gives the future org switcher something to read and lets the token hook resolve a claim in one indexed lookup.

**Provider ordering:** `Auth → Organization → StaffRights → …`. The org derives from the session, and it sits above everything that fetches because it **clears the entire React Query cache** on any change of organization id.

---

## 3. Database Changes

### 3.1 New tables (all additive)

`organizations`, `organization_users`, `organization_branches`, `organization_settings`, `organization_domains`, `organization_branding`, `organization_subscriptions`, `organization_audit`, plus `tenancy_readiness` and `tenancy_policy_backup`.

> **Scope note.** `organization_subscriptions` and `organization_branding` are created as **schema only**. Billing (Phase 5) and white-label (Phase 6) are explicitly out of scope; nothing reads or writes them. Creating the shape now means those phases are additive rather than another 167-table change.

`campuses` is **not renamed**. 118 `campusId` references in `src/` and 29 in SQL make a rename pure cost. It gains `organization_id` and remains the working branch entity; `organization_branches` mirrors it with a `campus_id` link.

### 3.2 The column, applied by catalog iteration

The migration does not list 167 tables. It iterates `pg_class`, because:

1. **The live database does not match the repository.** Several migrations are known to be unapplied. A hardcoded list would fail on the first missing table and abort.
2. **A hand-written list rots.** The next module would silently ship an unscoped table.
3. Idempotency and re-runnability come free.

Per table: add nullable → backfill in **10,000-row committed batches** → `SET DEFAULT current_org_id()` → `SET NOT NULL` → FK `ON DELETE RESTRICT` → index leading with `organization_id`.

Adding a `NOT NULL DEFAULT` column in one statement would evaluate the default for every row under an `ACCESS EXCLUSIVE` lock — on a production institute's attendance history that is a visible outage.

### 3.3 What is deliberately NOT done, and the guard that makes it safe

**Global unique constraints are unchanged** — `system_settings.key`, `campuses.name`, `rbac_roles.slug`, `comms_automation_settings.event_key`, `attendance_settings.singleton`, `payroll_role_rates.role`, and others.

**Why:** 25 call sites pass an explicit `onConflict` naming the exact column list:

```ts
.upsert(rows, { onConflict: "student_id,date" })              // attendance
.upsert(row,  { onConflict: "scope,period_type,period_key" }) // attendance locks
.upsert(row,  { onConflict: "singleton" })                    // attendance settings
.upsert(row,  { onConflict: "event_key" })                    // comms automation
.upsert(row,  { onConflict: "exam_id,student_id" })           // exam results
```

Postgres rejects `ON CONFLICT` when no unique index matches the named columns **exactly**. Prepending `organization_id` would break attendance submission, staff attendance, exam-result entry, class allocation and comms settings **the moment this deployed** — the precise "never break ARK" failure this phase forbids.

Those constraints are still *correct* today: with one tenant, a global unique and a per-tenant unique are the same thing. They become wrong only when organization #2 exists.

**So the database physically refuses to create organization #2:**

```sql
CREATE TRIGGER trg_assert_multi_tenant_ready
  BEFORE INSERT ON public.organizations …
```

It raises unless every row in `tenancy_readiness` is `ready`. After Phase 1, `composite_unique_keys` is `false` — deliberately. **Phase 1E must change each constraint and its call sites in the same commit, then set the flag.**

This is the difference between a documented caveat and an enforced one. The unsafe state is unreachable by construction, not by discipline.

---

## 4. Migration Files

| # | File | Effect | Reversible |
|---|---|---|---|
| 1A | `phase1a_tenant_foundation.sql` | Spine + tenant resolution + ARK seed + token hook | Yes — DROP |
| 1B | `phase1b_organization_id.sql` | Column, backfill, constraints, indexes, guard | Yes — non-destructive by default |
| 1C | `phase1c_tenant_rls.sql` | Policy wrap, FORCE RLS, helpers, storage | Yes — exact restore from backup |
| 1D | `phase1d_provisioning_engine.sql` | Provisioning functions | Yes — DROP |

Apply in order 1A → 1B → 1C → 1D. Roll back in reverse.

**1A is independently deployable and touches no existing table or row.** It can ship alone, be verified at leisure, and rolled back with a DROP. A gate test asserts it contains no `ALTER TABLE` on a business table and no `DROP`/`TRUNCATE`/`DELETE`.

### Tenant resolution — the performance-critical detail

```sql
CREATE FUNCTION public.jwt_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb
                 -> 'app_metadata' ->> 'organization_id', '')::uuid $$;
```

Reads `app_metadata` (server-controlled), **never `user_metadata`** (user-writable — a tenant could forge its own org). It touches no relation: a resolver written as `SELECT organization_id FROM organization_users WHERE …` turns one comparison into a subquery per policy across 167 tables. That is the difference between a platform and an outage.

### The transition fallback is self-disabling

Between deploying 1C and registering the token hook, no live session carries the claim. Without a fallback every ARK user instantly sees zero rows — a total outage.

```sql
CREATE FUNCTION public.fallback_org_id() RETURNS uuid … AS $$
  SELECT o.id FROM public.organizations o
   WHERE o.deleted_at IS NULL
     AND (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL) = 1
   LIMIT 1 $$;
```

**It returns the org id only while exactly one organization exists.** The moment organization #2 is created it returns NULL and any claimless session sees nothing. It cannot become a cross-tenant leak even if someone forgets to remove it — the property that makes shipping a fallback acceptable at all.

---

## 5. Modified Files

| File | Change |
|---|---|
| `src/core/providers/AppProviders.tsx` | `OrganizationProvider` inserted under `AuthProvider` |
| `src/core/constants/queryKeys.ts` | `withOrg()` helper + tenant-cache rationale |
| `src/core/index.ts` | Tenant surface exported from `@/core` |
| `supabase/functions/_shared/auth.ts` | `Caller.organizationId` + `scoped()` |
| `supabase/functions/student-parent-accounts/index.ts` | BOLA site scoped |
| 10 service files | `orgPath()` on every storage upload |

The 10 services: `estudy`, `questionPaperImport`, `feeReceiptDelivery`, `bulkImport` (leads), `staff/storage`, `students/documents`, `taskAttachments`, `financeAttachment`, `help/attachments`, `payrollEmail`.

## 6. New Files

`src/core/tenant/tenant.ts`, `src/core/tenant/OrganizationProvider.tsx`, `src/lib/orgStorage.ts`, `src/test/security/phase1.test.ts` (56 gates), `scripts/tenant-isolation-audit.sql`, 4 migrations + 4 rollbacks, this document.

---

## 7. RLS Changes

**All 362 policies wrapped**, none rewritten. Idempotent — a policy already carrying `current_org_id` is skipped, never double-wrapped.

**`FORCE ROW LEVEL SECURITY` on every scoped table.** Without `FORCE`, the table *owner* bypasses RLS entirely — and that is the role migrations run as.

**Identity helpers made tenant-aware:** `current_profile_id`, `is_staff`, `has_any_role`, `get_user_role`, `has_role`, `current_parent_account_id`, `is_parent`, `parent_child_ids`, `is_parent_of`. This is defence in depth: a policy whose own qual is only `current_profile_id() = x` still gets tenant containment through the helper.

> `current_profile_id()` was defined **four separate times** across migrations `20260614`, `20260617`, `20260718` and `20260723`; whichever ran last won. 1C makes it a single definition. Later migrations must not redefine it.

**`get_financial_summary()` bounded.** It is `SECURITY DEFINER`, so it bypasses RLS. Phase 0 re-verified its role gate was already correct (management only — correcting an overstatement in the original architecture review). What it lacked was a tenant bound; without one it would aggregate every tenant's `fee_transactions` into a single number.

---

## 8. Storage Changes

New uploads are keyed `{organization_id}/{previous/path}`. `storage_path_org_ok(name)` checks the first segment.

**Existing ARK objects are not moved.** Relocating thousands of live files is non-transactional, unrollable with the migration, and exactly the step that goes wrong at 2am. The helper also accepts un-prefixed paths — but only while exactly one organization exists, the same self-disabling guard as the org fallback.

### The segment-shift bug this phase had to fix

Two live policies identify an **entity** by the first folder segment:

```sql
-- 20260727 parent portal
is_parent_of(((storage.foldername(name))[1])::uuid)
-- Phase 0 avatars
(storage.foldername(name))[1] = current_profile_id()::text
```

Prefixing uploads with `{organization_id}/` shifts that entity id from segment 1 to segment 2. Left alone, **parents would silently lose access to their own children's documents** and staff could not upload an avatar — a regression introduced by the isolation work itself.

`storage_entity_segment()` reads the **last** folder segment, which is the entity id under both layouts:

```
{student}/file.pdf         → student   (legacy)
{org}/{student}/file.pdf   → student   (new)
```

---

## 9. Edge Function Changes

`Caller` gains `organizationId`, resolved **server-side from `organization_users`** using the verified user id.

Every function here runs with the **service role, which bypasses RLS entirely**. If a function took the org from the request body, any authenticated user of tenant A could pass tenant B's id and read or write B's data with full privileges — RLS would never see it. `scoped(query, caller)` throws rather than running an unscoped service-role query, because a convention is a thing people forget and forgetting it here is a cross-tenant read.

A gate asserts **no function reads `organization_id` from a request body**.

---

## 10. Testing Results

**56 new gates, all passing.** Full suite: **74 files / 867 tests**, up from 71/777 at Phase 0 start.

| Area | Gates |
|---|---|
| Foundation & ARK seeding | 11 |
| Tenant resolution (JWT, fallback, hook) | 5 |
| `organization_id` correctness | 7 |
| Second-organization guard | 3 |
| RLS cutover | 7 |
| Storage isolation | 4 |
| Edge-function tenant binding | 4 |
| Frontend tenant context | 3 |
| Provisioning engine | 5 |
| Rollback completeness | 7 |

### What these gates cannot prove — read before trusting a green run

They prove the **repository** is correct. They cannot prove the **live database** is. Several migration PARTs are wrapped in `EXCEPTION WHEN insufficient_privilege` because a hosted Supabase migration runner may not own `storage.objects` — **a partial apply is a real and silent outcome.** `scripts/tenant-isolation-audit.sql` is the runtime half and is a mandatory deployment step.

**The definitive cross-tenant proof has not been run.** Seeding organization B, authenticating as B and asserting zero rows of A across all 167 tables requires two real tenants — which the second-organization guard currently, and correctly, forbids. **That test is the gate for Phase 2** and must run in the same change that lifts the guard (Phase 1E).

Per the isolation matrix requested (students, staff, parents, attendance, fees, payroll, communication, reports, documents, storage): each is covered *structurally* — every one of those tables is scoped by the same catalog-driven mechanism, and the audit script verifies per-table coverage at runtime. None is covered *empirically* yet, for the reason above. That distinction is the honest state of this phase.

---

## 11. Performance Report

| Change | Impact |
|---|---|
| `current_org_id()` per policy | One `uuid` comparison against a session variable. `STABLE`, no relation access → evaluated once per statement. **<2%.** |
| `fallback_org_id()` during transition | One indexed read on a 1-row table, only when the JWT claim is absent. Disappears once the hook is registered. |
| Tenant-leading index per table | Adds ~16 bytes/entry across ~167 indexes. **Net win:** every query gains a highly selective leading predicate. |
| Composite FKs (10 relationships) | One extra index probe per insert on those tables. |
| `signedUrlMap` on attachment lists | Batch `createSignedUrls` — **one** request per list, not N. |
| `resolveCaller()` in edge functions | One GoTrue verification added; folds in the profile lookup each function already did. Roughly neutral. |
| Bundle | `index` chunk 584.17 → 586.11 kB (+1.94 kB). |

**No N+1 introduced.** The organization is fetched **once per session** and cached for 5 minutes; the module-level mirror means services read it synchronously with no request at all.

---

## 12. PASS / FAIL Matrix

Baseline captured before Phase 0, on commit `3563ede`.

| Gate | Baseline | Phase 0 | Phase 1 | Verdict |
|---|---|---|---|---|
| Tests | 71 / 777 | 73 / 811 | **74 / 867** | ✅ **PASS** (+90, 0 regressions) |
| Production build | exit 0 | exit 0 | exit 0, 37.3s | ✅ **PASS** |
| TypeScript | 527 errors | 527 | **527** | ⚠️ **PASS (delta)** — identical files, counts **and error codes**; zero introduced |
| ESLint errors | 15 | 15 | **15** | ✅ **PASS** |
| ESLint warnings | 259 | 259 | **262** | ⚠️ **PASS** — +3, see below |
| Phase 0 gates | — | 24 pass | 24 pass | ✅ **PASS** (no regression) |
| Phase 1 gates | — | — | 56 pass | ✅ **PASS** |
| Migration review | — | — | 4 + 4 rollbacks, idempotent | ✅ **PASS** |
| Runtime DB audit | — | pending | **not run** | ⏳ **PENDING DEPLOY** |
| Cross-tenant proof | — | — | **blocked by design** | ⏳ **PHASE 1E** |

**The +3 ESLint warnings**: 2× `react-refresh/only-export-components` in `OrganizationProvider.tsx` — the identical warning `AuthContext.tsx` and `ThemeProvider.tsx` already carry, i.e. the codebase's established provider pattern; 1× `no-explicit-any` in the `scoped()` generic constraint, matching the surrounding edge-function code. No new errors.

**On the TypeScript gate:** a raw text diff showed differences, but per-file counts and per-error-code counts are byte-identical. The variance is TypeScript's non-deterministic truncation of long union types (`… 37 more …`) in message text. Verified both ways before claiming parity.

### Quality gates from the brief

| Requirement | Status | Evidence |
|---|---|---|
| No production data deleted | ✅ | Gate asserts no `DROP`/`TRUNCATE`/`DELETE`/`DROP COLUMN` in 1A/1B |
| No records modified incorrectly | ✅ | Only `organization_id` written; all rows → ARK |
| ARK works exactly as before | ✅ *by construction* | Policies wrapped; conjunct always true with one tenant. **Requires smoke test to confirm empirically.** |
| Existing modules / reports / dashboards | ✅ | Zero service or query call sites changed |
| Communication / payroll / attendance / imports | ✅ | Unchanged; `onConflict` deliberately preserved (§3.3) |
| Parent / teacher / management portals | ✅ | Segment-shift fix protects parent documents |
| RBAC | ✅ | `rbac_*` scoped by the same mechanism; registry gate still passes |

---

## 13. Deployment Guide

Steps 1–2 are operator actions. **Read step 6 before starting.**

- [ ] **1.** Verified backup + tested PITR restore point.
- [ ] **2.** Capture the row-count baseline (§12 of the audit script) — the reconciliation target.
- [ ] **3.** Apply **1A**. Verify: one organization row, membership counts match `profiles` + `parent_auth_accounts` + `student_auth_accounts`. **App behaviour is unchanged at this point** — nothing reads these tables yet.
- [ ] **4.** Apply **1B**. Read the `NOTICE` output: tables touched, rows backfilled. Re-run if any table reports NULLs remaining (it is idempotent).
- [ ] **5.** Apply **1C**. Read the output for `Could not scope policy …` warnings.
- [ ] **6. If `insufficient_privilege` appears, re-run PART 4 of 1C from the SQL editor as owner.** Otherwise storage policies are unscoped **and the parent-document segment fix has not applied** — parents lose access to their children's files.
- [ ] **7.** Apply **1D**.
- [ ] **8.** Deploy the frontend. Signed URLs and `orgPath()` are backward compatible, so ordering is flexible; migration-first is safest.
- [ ] **9.** Deploy edge functions: `npx supabase functions deploy`.
- [ ] **10.** Run `scripts/tenant-isolation-audit.sql`. Sections 1–7, 9, 11 must be empty/true. Section 8: `composite_unique_keys = false` is **expected**. Section 12 must match step 2 exactly.
- [ ] **11. Register the access-token hook** — Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims → Postgres → `public.custom_access_token_hook`. Until then every session uses the single-tenant fallback, which is correct but must not be the permanent state.
- [ ] **12.** Sign out and back in; confirm the JWT carries `app_metadata.organization_id`.
- [ ] **13. Smoke test as a real user** — this is the step that empirically proves "ARK works exactly as before":
  - Mark and **re-submit** attendance (exercises the `onConflict` path)
  - Collect a fee; open the receipt
  - Run and approve payroll; open an emailed payslip
  - Upload a student document; **open it as a parent**
  - Import students; import a question paper
  - Send a WhatsApp/email from the Communication Centre
  - Open a report and a dashboard as each of the four roles

---

## 14. Rollback Guide

Order: **1D → 1C → 1B → 1A**. Each part is independent — revert only what is failing.

| Symptom | Targeted fix | Full revert? |
|---|---|---|
| Everyone sees zero rows | Token hook registered but memberships missing → re-run 1A PART 6 | No |
| One module 403s | One policy failed to wrap → check 1C warnings, re-run 1C | No |
| Storage 404s / parent can't open documents | 1C PART 4 skipped on privilege → re-run as owner | No |
| Writes fail `null value in column organization_id` | `current_org_id()` returned NULL → confirm exactly one organization exists, or register the hook | No |
| Widespread breakage | **Roll back 1C only** — removes enforcement, restores previous behaviour completely | Partial |

**Roll back 1C alone in almost every case.** It restores the original policies exactly (from `tenancy_policy_backup`, captured before any wrapping) and leaves the harmless, unread `organization_id` columns in place. A nullable extra column costs nothing; re-backfilling 167 tables does.

**1B's rollback is non-destructive by default** — it drops the DEFAULT, the NOT NULL and the guard trigger, but *keeps the data*. The `DROP COLUMN` block is commented out and must be uncommented deliberately. That friction is the point: it is the only irreversible statement in Phase 1 and must never be reached by pasting a file in a hurry.

**Both 1B and 1C rollbacks refuse to run if more than one organization exists** — removing the tenant conjunct on a genuinely multi-tenant database is a data breach, not a rollback.

⚠️ **Deregister the access-token hook before rolling back 1A.** A registered hook pointing at a dropped function makes GoTrue fail on every token issuance — nobody can log in.

---

## 15. Production Verification Checklist

After deployment:

- [ ] `organizations` has exactly **one** row: ARK Learning Arena
- [ ] `organization_users` counts match `profiles` + `parent_auth_accounts` + `student_auth_accounts`
- [ ] Audit §1 (tables missing the column) — **empty**
- [ ] Audit §2 (unconstrained columns) — **empty**
- [ ] Audit §3 (NULL `organization_id`) — **0 for every table**
- [ ] Audit §4 (policies without a tenant conjunct) — **empty**
- [ ] Audit §5 (tables without FORCE RLS) — **empty**
- [ ] Audit §6 (storage policies without a tenant check) — **empty** except `profile_pictures_public_read`
- [ ] Audit §7 (unbounded `SECURITY DEFINER`) — **empty**
- [ ] Audit §9 — guard trigger **installed**
- [ ] Audit §11 (index coverage) — **empty**
- [ ] Audit §12 — row counts **identical** to the pre-migration baseline
- [ ] All 13 smoke tests from §13 pass
- [ ] Access-token hook registered and issuing the claim

---

## 16. What Phase 1 Does NOT Do

Stated plainly, so a green matrix is not mistaken for "we can onboard customers":

- **A second organization cannot be created yet** — blocked by the readiness guard until Phase 1E converts the global unique constraints *and* their 25 `onConflict` call sites in the same commit. This is intentional and enforced by the database.
- **The cross-tenant probe suite has not run.** It needs two tenants. It is the gate for Phase 2.
- **Legacy storage objects are not relocated.** They remain readable via the single-tenant tolerance, which self-disables at tenant #2. Relocation is a background job in Phase 1E.
- **No runtime verification.** Every claim here is provable from the repository; the database has not been touched.
- **The 527 pre-existing TypeScript errors are untouched.** Separate task.
- **Nothing about billing, pricing, website, white-label, feature flags, marketplace or mobile** — out of scope by instruction.

### Phase 1E — required before organization #2

1. Convert global unique constraints to `(organization_id, …)` **and** update all 25 `onConflict` call sites in one commit.
2. Relocate legacy storage objects under `{organization_id}/`.
3. Set `composite_unique_keys` and confirm `storage_org_partitioned` in `tenancy_readiness`.
4. Provision a synthetic organization B and run the cross-tenant probe suite across all 167 tables.
