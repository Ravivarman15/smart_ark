# Phase 4 — Organization Provisioning & White-Label Infrastructure

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 20 August 2026
**Migrations:** `20260820_phase4a` / `20260820_phase4b` (+ 2 rollbacks)
**Prerequisites:** Phases 0, 1, 1E, 2, 3 deployed

---

## 1. Executive Summary

Provisioning is now a **queue-based, resumable, idempotent engine**: 21 catalogued steps, retry, resume, rollback, leases, full audit — plus a live platform dashboard, a derived onboarding checklist, and a working white-label theme engine.

ARK and every existing tenant are untouched: Phase 4 adds new tables and functions, alters no tenant table, deletes nothing.

## 2. Provisioning Flow — the split that makes it work

"Never block registration" and "the customer must not sign in to an empty ERP" pull against each other. Making everything async resolves the first and breaks the second.

So the work is split by **what the first login actually needs**:

| | Contents | Why |
|---|---|---|
| **Synchronous** (~200ms, one transaction) | organization · branch · academic year · roles · standards · subjects · settings · admin profile | The ERP is **usable the moment registration returns** |
| **Queued** (seconds, resumable, 21 steps) | departments · sections · permission grants · comms templates · certificate templates · dashboards · report presets · theme · branding · feature flags · portals · storage folders · welcome email | Enrichment. Absence degrades; it does not break — and progress is visible while it runs |

Signup enqueues at `priority: 10` and kicks the worker immediately, so the first job starts now rather than on the next cron tick.

## 3–4. New Database Objects & Tables

**4 tables:** `provisioning_step_catalog` (21 rows), `provisioning_jobs`, `provisioning_steps`, `organization_onboarding`.

**9 queue functions:** `enqueue_provisioning`, `claim_provisioning_job`, `heartbeat_provisioning_job`, `run_provisioning_step`, `complete_provisioning_job`, `retry_provisioning_job`, `rollback_provisioning_job`, `provisioning_progress`, `provisioning_queue`.

**21 step handlers** + `refresh_onboarding_checklist` + `validate_branding`.

**11 white-label columns** on `organization_branding`, **3** on `organization_domains`.

The step catalogue is a **table, not a hardcoded array**: adding a step is a row, the dashboard renders exactly what the worker executes, and a step can be disabled without a deploy.

## 5–10. Services · Workers · Functions · Components · Pages · Hooks

**Worker:** `provisioning-worker` edge function. **Pages:** `/platform/provisioning`. **Components:** `OnboardingChecklist`, `OnboardingProgressBadge`. **Providers:** `OrganizationThemeProvider`. **Service:** 5 provisioning methods added to `platform.service.ts`.

## 11. Modified Files

`public-onboarding` (enqueues), `platform.service.ts`, `platform/routes.tsx`, `PlatformShell.tsx` (nav), `AppProviders.tsx` (theme provider), `config.toml`. **No ERP module was modified.**

---

## The three invariants, and how they're enforced

Everything risky in this phase is invisible on screen. Each is gated, and each gate was mutation-tested.

### 1. No handler reads `current_org_id()`

The worker runs with **no tenant context**. A handler falling back to the session's organization would provision **into the wrong tenant** — silently, into a stranger's data. Every handler takes `_org uuid` explicitly.

```
→ handlers reading current_org_id: provision_step_bad
```

### 2. Every handler is idempotent

Retry re-runs a step that may have failed *after doing half its work*. A bare INSERT would double-seed a tenant. Every INSERT is guarded by `ON CONFLICT`, `WHERE NOT EXISTS`, or an enclosing `IF`.

This gate found three handlers on its first run — **all three were correctly guarded**, and the gate was wrong: it cut statements at the first `;`, but `provision_step_storage` has a semicolon *inside a string literal*, and two others are guarded by an enclosing `IF` that sits before the INSERT. Fixed by inspecting a window bounded at the *next* INSERT rather than guessing statement boundaries. It still fails on a genuine bare INSERT.

### 3. Rollback refuses once real data exists

```sql
IF n_students > 0 OR n_staff > 1 THEN
  RAISE EXCEPTION 'Refusing to roll back: … This is a live tenant, not a
    failed provision — use deprovision_organization() for a soft delete';
```

Rollback removes provisioning *artefacts* — templates, presets, settings, flags. A gate asserts every DELETE targets an allow-listed artefact table **and** is scoped to the one organization. Without the refusal, "recovery" would be data loss with a friendly button.

---

## Queue mechanics

| Property | Implementation |
|---|---|
| **Concurrency** | `FOR UPDATE SKIP LOCKED` — N workers take N different jobs. Without it, effective concurrency is **1** and "100 organizations concurrently" is fiction |
| **Dead workers** | Jobs are **leased**; an expired lease is reclaimed and resumed |
| **Resume, not replay** | A completed step is never re-run; retry resets only failed steps |
| **Critical vs. optional** | A failed critical step aborts the job; an optional one is recorded and the job continues — a missing certificate template must not stop the welcome email |
| **Runtime budget** | The worker stops before the edge timeout and leaves the job `running` with a live lease; the next invocation resumes |
| **One job per org** | Partial unique index — two concurrent jobs would race on the same steps |
| **Idempotent enqueue** | An org with a live job returns that job |
| **No injection** | The handler name comes from the catalogue, never a caller. A caller-supplied name in `EXECUTE` would be RCE |

---

## 12. White Label Architecture · 13. Theme Engine

Colours are validated **twice**: a database trigger rejects anything that is not `#rrggbb` before storage, and `OrganizationThemeProvider` validates again before writing CSS. Two layers because these values land inside a style declaration — an unvalidated string there is CSS injection, and "it's only their own tenant" stops being true the moment a parent opens the portal. Fonts and theme modes are allow-listed, not free text.

The engine writes **CSS custom properties** onto `<html>`, overriding `--primary`, `--ring`, `--secondary`, `--accent` and their computed foregrounds. Because the app already styles everything through `hsl(var(--primary))`, this re-skins every button, chart, badge and focus ring **with no component changes**. A per-tenant stylesheet would mean a build per customer and a flash of the wrong brand on every load.

It also restores every variable it set on unmount — otherwise switching organizations leaves the previous tenant's brand behind.

**HTML branding fields (`email_header_html`, `report_header_html`) are stored raw and rendered NOWHERE.** They need an allowlist sanitiser, which Phase 6 owns. Rendering them now would be stored XSS reaching parents. A gate asserts no `dangerouslySetInnerHTML` in the theme engine.

**Custom domains: infrastructure only.** `verification_token`, `ssl_status` and `last_checked_at` exist; there is no DNS automation, as instructed.

---

## 14. Performance Report

| Concern | Handling |
|---|---|
| 100 concurrent provisions | `SKIP LOCKED` claiming; concurrency is a question of how many worker invocations, not architecture |
| Memory | The worker holds one job at a time and streams steps; nothing is accumulated |
| Long jobs | Heartbeat extends the lease; budget exhaustion resumes rather than fails |
| Dashboard polling | 5s while jobs are in flight; the checklist stops polling entirely once the job finishes |
| Checklist cost | ~10 indexed `EXISTS` probes — cheap and always accurate, which a cached value would not be |
| Bundle | Provisioning page and checklist lazy-loaded; build unchanged at 25 prerendered routes |

**Not measured:** no load test with 100 real concurrent organizations has been run. The mechanism is correct by construction (`SKIP LOCKED`, leases, per-job isolation); the *number* is unverified and I am not going to claim one.

## 15. Security Review

| Control | Implementation |
|---|---|
| Wrong-tenant provisioning | No handler reads `current_org_id()` — gated |
| Worker endpoint | Not open: `CRON_SECRET` **or** a verified active platform user |
| Retry / rollback | Require `organizations.manage` |
| Tenant write access | A tenant reads its own job; **no INSERT/UPDATE/ALL policy** — a tenant that could enqueue could exhaust the queue |
| Dynamic SQL | Handler name from the catalogue via `format('%I')`, never a caller |
| Safe defaults | Every comms automation seeded **disabled**; `auto_receipt_delivery` and `auto_notify_absent` **off** |
| Branding injection | Validated in the database and again in the client; HTML fields stored but never rendered |
| New platform tables | Added to `is_tenant_scoped_table` so a 1B re-run cannot scope them |

**Residual risks:**
- The worker's `CRON_SECRET` is a shared secret. Rotating it is an operator task with no automation.
- Rollback's guard counts students and staff. An organization that failed provisioning *and* has imported students is not rollback-able — correct, but it means recovery there is manual.
- Storage placeholders are written to `student-documents`. If that bucket is unavailable the step fails non-critically and the folder structure is simply absent — harmless, since Supabase folders are virtual anyway.

---

## 16. PASS / FAIL Matrix

| Gate | Baseline | Phase 3 | **Phase 4** | Verdict |
|---|---|---|---|---|
| Tests | 71 / 777 | 77 / 1000 | **78 / 1046** | ✅ **PASS** (+46, 0 regressions) |
| Production build | exit 0 | exit 0 | exit 0 + prerender | ✅ **PASS** |
| TypeScript | 527 | 527 | **527** | ✅ **PASS** — per-file **and** per-code identical |
| ESLint errors | 15 | 15 | **15** | ✅ **PASS** |
| ESLint warnings | 259 | 271 | **275** | ⚠️ **PASS** — +4, all `react-refresh`/`exhaustive-deps` matching existing provider patterns |
| Phase 0–3 gates | — | 213 | 213 pass | ✅ no regression |
| Phase 4 gates | — | — | **46 pass** | ✅ **PASS** |
| Wrong-tenant invariant | — | — | mutation-tested | ✅ **PASS** |
| Idempotency invariant | — | — | mutation-tested | ✅ **PASS** |
| Runtime verification | — | — | **not run** | ⏳ **PENDING DEPLOY** |

### Two things caught mid-build, both by existing gates

**The Phase 2 gate rejected my Phase 4 page.** `ProvisioningPage.tsx` imported `supabase` directly, which the "no platform page queries supabase directly" gate forbids — because pages must go through the service, and the service is the file policed by the "never queries a tenant table" gate. Fixed by moving five queries into `platform.service.ts`. The gate was right; weakening it would have opened a hole around the boundary it protects.

**That fix then introduced one TypeScript error** (a bad `as Promise<...>` cast on a loosely-typed RPC). Caught by the delta check and fixed properly by narrowing inside the query function, not by suppressing. Final state is byte-identical to baseline in both dimensions.

---

## 17. Deployment Guide

- [ ] **1.** Verified backup / PITR restore point.
- [ ] **2.** Apply `20260820_phase4a`, then `20260820_phase4b`.
- [ ] **3.** Confirm the catalogue: `SELECT count(*) FROM provisioning_step_catalog;` → **21**.
- [ ] **4.** `npx supabase secrets set CRON_SECRET=<strong-random>` if not already set. **The worker cannot authorise cron without it.**
- [ ] **5.** `npx supabase functions deploy provisioning-worker public-onboarding`.
- [ ] **6. Schedule the worker every minute.** Without it, retries and dead-worker recovery never happen — jobs kicked at signup still run, but a failure is permanent until someone presses Retry.
- [ ] **7.** Deploy the frontend.
- [ ] **8. End-to-end test with a real signup:** register → verify → provision. Watch `/platform/provisioning` — the job should appear, run and complete in seconds.
- [ ] **9.** Confirm in the new org: 4 roles, standards with section A, 8 message templates, **every automation disabled**, dashboard layouts, 4 report presets, branding row.
- [ ] **10. Test retry:** disable a step (`UPDATE provisioning_step_catalog SET handler='nope' WHERE step_key='reports'`), provision, watch it fail non-critically, restore the handler, press Retry — only the failed step re-runs.
- [ ] **11. Test rollback refusal:** import one student into a failed-job org, press Roll back — it must refuse and name the reason.
- [ ] **12.** Set a `primary_color` on an org and confirm the ERP re-skins without a deploy.
- [ ] **13. Confirm ARK is unaffected:** sign in as an ARK admin, mark attendance, collect a fee, open a report. ARK has no provisioning job and must behave exactly as before.

## 18. Rollback Guide

Order: **4B → 4A**.

| Symptom | Action |
|---|---|
| Jobs stuck `queued` | Worker not scheduled, or `CRON_SECRET` missing |
| Jobs stuck `running` | Worker died; the lease expires in 120s and another reclaims it |
| A step fails every attempt | Read `provisioning_steps.error` — usually a table absent in that environment |
| Rollback refuses | Working as designed. The org has real data; use `deprovision_organization()` |
| Theme not applying | Colour rejected by `validate_branding` — it must be `#rrggbb` |

**The 4A rollback refuses while jobs are queued or running** — dropping then would leave those organizations half-provisioned with no record of what remains.

**The 4B rollback keeps the white-label columns.** A customer may already have uploaded a logo and chosen colours; dropping those columns destroys their configuration to undo a migration. **The 4A rollback keeps `organization_onboarding`** for the same reason — that is the tenant's real progress, not a queue artefact.

⚠️ **Deregister the worker's cron schedule before rolling back 4A**, or it will invoke missing RPCs and log an error every minute.

## 19. Production Verification Checklist

- [ ] `SELECT count(*) FROM provisioning_step_catalog` → 21
- [ ] A signup produces a job that reaches `completed`
- [ ] `SELECT * FROM provisioning_steps WHERE status='failed'` → empty for a healthy run
- [ ] Retry re-runs **only** failed steps (completed timestamps unchanged)
- [ ] Rollback refuses on an org with students
- [ ] A tenant `INSERT` into `provisioning_jobs` → **denied**
- [ ] Worker called with no `x-cron-key` and no platform session → **403**
- [ ] `UPDATE organization_branding SET primary_color='red'` → **rejected**
- [ ] Two orgs with different `primary_color` render differently
- [ ] Onboarding checklist ticks "students" **only after** a student exists
- [ ] ARK smoke test: attendance, fees, payroll, parent document access

---

## 20. Remaining Work for Phase 5

**Carry-overs from Phase 4:**
1. **Load test 100 concurrent provisions.** The mechanism is right; the number is unverified.
2. **`CRON_SECRET` rotation** has no automation.
3. **Tenant-facing branding editor.** Phase 4 built the engine and the RLS to allow tenant admins to edit; the *UI* lives in Phase 6 (White Label), so today branding is set from the control plane or by SQL.
4. **Import assistant.** The checklist links to the existing import pages, which already handle staff and students. A unified wizard covering fees, timetable, subjects and exam data is not built — the brief listed it, and I did not fake it.

**Still deferred by instruction, tables already shaped:**
- Payment gateway, invoices, dunning → **Phase 5**
- Feature-flag *enforcement* in the sidebar and RLS → Phase 6 (Phase 4 seeds the rows)
- Custom-domain DNS automation and certificate issuance → Phase 7

**Known gaps I did not paper over:**
- `provision_step_departments` seeds **course types**, because the schema has no `departments` table. Creating one for a concept the ERP already models differently would produce two sources of truth.
- `provision_step_certificates` writes to `organization_settings`, because the certificates module is a 94-line stub. When it is built the data is already there.
- Storage "folders" are `.keep` placeholders — Supabase folders are virtual prefixes, and the step says so rather than implying directories exist.
