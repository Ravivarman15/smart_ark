# Phase 2 — Platform Control Plane (Super Admin)

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 10 August 2026
**Migrations:** `20260810_phase2a/b/c` (+ 3 paired rollbacks)
**Prerequisites:** Phases 0, 1, 1E deployed

---

## 1. Executive Summary

The SaaS control plane exists: 20 routes, 7 platform roles, secure impersonation, plan/pricing/coupon management, per-organization feature flags, usage analytics, system health and an append-only audit centre.

**ARK Learning Arena is untouched.** Phase 2 adds only new tables and new routes. It alters no tenant table, adds no policy to any tenant table, and deletes nothing — asserted by CI gates, not by assurance.

| Delivered | Detail |
|---|---|
| Platform identity | `platform_users` + 7 roles + capability model |
| Secure impersonation | Time-boxed, reason-required, fully audited, **no RLS bypass** |
| Organization management | Provision, suspend, activate, soft-delete, search, export |
| Commerce | Plans, prices, subscriptions, coupons (management only — no gateway) |
| Feature flags | Per-organization, with assignment history |
| Observability | Usage rollups, system health, append-only audit |
| Reserved entities | All 8 you asked for, shaped with RLS, nothing wired |

---

## 2. Platform Architecture

```
                    ┌──────────────────────────────────────┐
  /platform/*  ───► │  CONTROL PLANE                       │
                    │  platform_users · capabilities       │
                    │  reads: platform_* + AGGREGATES only │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  AGGREGATE BOUNDARY                  │
                    │  platform_summary()                  │
                    │  platform_organization_overview()    │
                    │  platform_organization_detail()      │
                    │  platform_system_health()            │
                    │  → returns COUNTS. No names, no      │
                    │    phones, no salaries, no marks.    │
                    └───────────────┬──────────────────────┘
                                    │
   ┌────────────────────────────────▼──────────────────────┐
   │  167 TENANT TABLES · 362 RLS POLICIES                 │
   │  NOT ONE of them mentions is_platform_admin()         │
   └────────────────────────▲──────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │  SECURE IMPERSONATION     │
              │  grant → mint session AS  │
              │  an existing tenant user  │
              │  → normal RLS applies     │
              └───────────────────────────┘
```

### The defining constraint

**A platform administrator gets no RLS bypass.** Adding `OR is_platform_admin()` to every tenant policy is one migration and would "just work". It was rejected because:

1. One compromised support account would equal a total breach of every customer's data, simultaneously.
2. All 362 policies become harder to reason about, and the bypass is invisible at the call site.
3. **It is un-auditable.** A SELECT that RLS permits leaves no trace.

A CI gate scans every migration for a tenant policy referencing `is_platform_admin()` or `platform_can()`. It was mutation-tested by adding exactly that bypass to `students` and confirming the failure.

### Impersonation without a bypass

The platform admin gains no rights. They temporarily **become** an existing tenant user:

1. Edge function verifies: MFA-enrolled platform user, `impersonate` capability
2. Confirms the target is an **active member of that organization**, and is **not** a platform user (no support → owner escalation)
3. Writes the grant — who, as whom, which tenant, why, until when — **before** minting anything
4. Mints a magic-link token via the admin API
5. The dialog hands it to a **new tab**, which exchanges it there

Every RLS policy then applies to that user exactly as always. Reason is mandatory; the window is capped at 60 minutes by a database trigger.

**Why a separate tab:** supabase-js keeps one session per storage key per origin. Exchanging in the platform tab would replace the platform session — logging the operator out and leaving no identity with which to end the grant.

---

## 3. Database Changes

Three additive migrations. No tenant table altered, nothing deleted.

| Migration | Contents |
|---|---|
| **2A** identity | `platform_users`, `platform_role_capabilities`, `platform_audit_log`, `platform_impersonation_grants`; `is_platform_admin()`, `platform_can()`, `platform_audit()`, `active_impersonation()`, `end_impersonation()`; extends the access-token hook |
| **2B** aggregates | `organization_metrics_daily`; `refresh_organization_metrics()`, `platform_summary()`, `platform_organization_overview()`, `platform_organization_detail()`, `platform_system_health()` |
| **2C** commerce | `plans`, `plan_prices`, `plan_features`, `subscriptions`, `subscription_usage`, `coupons`, `coupon_redemptions`, `organization_features`, `feature_flag_assignments`, `platform_settings` + 6 reserved tables |

### 4. New Tables (22)

**Live:** `platform_users`, `platform_role_capabilities`, `platform_audit_log`, `platform_impersonation_grants`, `organization_metrics_daily`, `plans`, `plan_prices`, `plan_features`, `subscriptions`, `subscription_usage`, `coupons`, `coupon_redemptions`, `organization_features`, `feature_flag_assignments`, `platform_settings`

**Reserved — shape + RLS only, nothing reads or writes them:** `invoices`, `invoice_lines`, `organization_invitations`, `organization_activity`, `platform_notifications`, `platform_announcements`

> Reserved tables get RLS **now**. An unused table with RLS enabled and no policy is deny-all (safe); one with RLS *disabled* is fully readable over PostgREST the moment someone inserts into it. That is how a "we'll secure it later" table becomes a breach.

Three of your eight requested entities already existed: `plans`, `subscriptions` and `subscription_usage` are implemented live rather than reserved, since Phase 2 explicitly scopes subscription *management*.

---

## 5–8. Services, Pages, Components, Hooks

**Service:** `platform.service.ts` — the single data gateway. A CI gate asserts it never queries a tenant table, and a second gate asserts no platform *page* imports the Supabase client directly (which would route around the first).

**Pages (20 routes):** dashboard, organizations, organization detail, plans, pricing, subscriptions, coupons, invoices, revenue, usage, storage, feature-flags, support, system-health, backups, audit, security, logs, platform-settings, users.

**Components:** `PlatformShell` (guard, layout, nav, `StatTile`, `StatusPill`, `EmptyState`, `ReservedNotice`), `ImpersonationDialog`.

**Hooks:** `usePlatform.ts` — 15 queries + 7 mutations. Keys namespaced under `platform`, deliberately **not** under the tenant `withOrg()` helper: control-plane data has no organization context, and tenant-namespacing would evict it on every impersonation round trip.

### Pages that say "not yet" instead of faking it

`logs`, `invoices`, `backups` and parts of `revenue`/`support` render a `ReservedNotice` naming the owning phase. Application logs live in the Supabase log stream, not Postgres; invoices need Phase 5's gapless GST numbering; backups are project-level and not controllable from SQL. Likewise `platform_system_health()` reports CPU/memory/disk as **`unavailable`** rather than inventing numbers — a dashboard showing a fabricated 42% is worse than one that admits it cannot see.

Revenue is labelled **contracted**, not collected. There is no gateway; nothing shown has been paid.

---

## 9. Modified Files

| File | Change |
|---|---|
| `src/App.tsx` | `/impersonate` route + `renderPlatformRoutes()` |
| `src/core/providers/AppProviders.tsx` | `PlatformAuthProvider` under `AuthProvider` |
| `supabase/config.toml` | `[functions.platform-admin] verify_jwt = true` |
| `src/test/security/phase1e.test.ts` | Gate widened for natively-composite keys (§12) |

**No ERP service, hook, page or policy was modified.**

---

## 10. RBAC Changes

**Zero changes to ERP RBAC.** Platform roles are a separate axis in `platform_role_capabilities` and never appear in `rbac_roles`.

| Role | Notable |
|---|---|
| `owner` | Everything, incl. `platform.users.manage` — **the only role that can** |
| `admin` | Everything except creating platform users |
| `finance` | Billing, plans, coupons. **No impersonation** |
| `support` | Impersonation + tickets. **No billing, no plans** |
| `sales` | Organizations, coupons, plan read |
| `customer_success` | Health, usage, feature flags, support |
| `auditor` | **Read-only everywhere. Cannot impersonate.** |

Capabilities are rows, not code: granting sales coupon-create is an INSERT, not a deploy. Gates assert `auditor` has no `impersonate`, `support` has no `billing.manage`, and only `owner` holds `platform.users.manage`.

---

## 11. Security Review

| Control | Implementation |
|---|---|
| No RLS bypass | 0 tenant policies reference platform functions — CI-gated, mutation-tested |
| Aggregate boundary | 4 definer functions, each gating on `platform_can()` **before** returning data |
| Member privacy | Org detail returns member **counts by kind**, never names or emails |
| MFA mandatory | Enforced twice: the token hook issues no `platform_role` without it, and the edge function independently rejects |
| Impersonation | Concrete target required; membership verified; platform users refused; 60-min cap; reason mandatory; grant written before token minted |
| Grant creation | **No INSERT policy** for `authenticated` — only the edge function, which checks capability server-side |
| Audit immutability | UPDATE/DELETE blocked by trigger; no UPDATE/DELETE/ALL policy exists |
| Secrets | `platform_settings` documents that credentials belong in edge env vars — it is readable by every platform employee over PostgREST |
| Enumeration | A non-platform user is redirected to `/` without confirming the control plane exists |
| Bundle isolation | All platform pages lazy-loaded; a tenant never downloads the control-plane code |

**Residual risks, stated plainly:**
- An `owner` account is genuinely powerful. MFA + audit are the controls; there is no separation-of-duties on platform-user creation yet.
- Impersonation grants a real session. The controls are time-boxing, mandatory reason, and an immutable log — not prevention.
- `generateLink` tokens are single-use and short-lived, but they do transit the browser. They are handed to a new tab, never persisted.

---

## 12. Performance Review

| Concern | Handling |
|---|---|
| Dashboard at 10,000 orgs | Reads a **nightly rollup**, not live `COUNT(*)` across every tenant. One indexed read vs. a full scan of the largest tables per page view. |
| Metric freshness | Displayed explicitly ("Metrics as of …") rather than implied |
| Org overview | Single RPC with a LATERAL join, not N+1 per organization |
| Health polling | 60s interval — health is genuinely live; summary is not and does not poll |
| Indexes | `platform_audit_log` indexed on created_at, actor, org and action; `subscriptions` on status and renewal date |
| Bundle | 20 lazy chunks; `index` grew 586.11 → 587 kB (platform code is not in it) |
| Rollup cost | `refresh_organization_metrics()` is per-org and idempotent; every source wrapped so one schema drift degrades one metric, never the run |

---

## 13. PASS / FAIL Matrix

| Gate | Baseline | Phase 1E | **Phase 2** | Verdict |
|---|---|---|---|---|
| Tests | 71 / 777 | 75 / 896 | **76 / 956** | ✅ **PASS** (+60, 0 regressions) |
| Production build | exit 0 | exit 0 | exit 0, 29.0s | ✅ **PASS** |
| TypeScript | 527 | 527 | **527** | ✅ **PASS** — per-file **and** per-code identical |
| ESLint errors | 15 | 15 | **15** | ✅ **PASS** |
| ESLint warnings | 259 | 262 | **269** | ⚠️ **PASS** — +7, see below |
| Phase 0/1/1E gates | — | 109 | 109 pass | ✅ no regression |
| Phase 2 gates | — | — | **60 pass** | ✅ **PASS** |
| No-bypass invariant | — | — | mutation-tested | ✅ **PASS** |
| Runtime verification | — | — | **not run** | ⏳ **PENDING DEPLOY** |

**+7 warnings:** 5 × `react-refresh/only-export-components` in the two new provider/shell files — the identical warning `AuthContext.tsx` and `ThemeProvider.tsx` already carry, i.e. the codebase's established pattern; 2 × `no-explicit-any` in the edge function's generic query helpers. No new errors.

**On TypeScript:** my first run introduced **5 errors** in Phase 2 files — `.bind(service)` erases parameter types, so three mutations typed their input as `void`, and two `.map(([k,v]))` over mixed tuples produced `unknown` in JSX. Both fixed properly (typed arrow functions, explicit tuple types) rather than suppressed. Final state is byte-identical to baseline in both dimensions.

### Quality gates from the brief

| Requirement | Evidence |
|---|---|
| Existing ERP / organization / data unchanged | Gate: no `ALTER TABLE` on a tenant table, no `DROP`/`TRUNCATE`/`DELETE`/`DROP COLUMN` in any Phase 2 migration |
| Communication / attendance / payroll / reports / portals unchanged | No ERP service, hook, page or policy modified — only `App.tsx` routes and `AppProviders` |
| Platform routes working | 20 routes declared; gate asserts every one carries a capability except the dashboard |
| Platform RBAC working | Capability model + gates on role boundaries |
| Tests / build passing | 956 tests, build exit 0 |

---

## 14. Deployment Guide

- [ ] **1.** Verified backup / PITR restore point.
- [ ] **2.** Apply **2A**. Verify `platform_users` exists and the capability table has ~60 rows.
- [ ] **3. Re-register the access-token hook.** 2A *replaces* `custom_access_token_hook`; the registration in the dashboard points at the function by name, so it keeps working — but confirm a fresh login still carries `app_metadata.organization_id` before proceeding.
- [ ] **4.** Apply **2B**, then **2C**.
- [ ] **5.** Confirm the plan catalogue seeded (6 plans) and ARK has an `internal` subscription.
- [ ] **6. Create the first platform owner** — chicken-and-egg: nobody can use the invite flow yet.
  ```sql
  INSERT INTO public.platform_users (user_id, email, name, role, mfa_enrolled)
  VALUES ('<auth.users.id>', 'you@smartark.ai', 'Your Name', 'owner', false);
  ```
- [ ] **7. Enrol MFA for that account**, then set `mfa_enrolled = true`. **Until this is done the account cannot reach `/platform` at all** — by design, enforced in both the hook and the edge function.
- [ ] **8.** Deploy the frontend and `npx supabase functions deploy platform-admin`.
- [ ] **9.** Sign in and open `/platform/dashboard`. Press **Refresh metrics** — the rollup has never run, so tiles read zero until it does.
- [ ] **10. Verify the boundary holds.** Sign in as an ARK teacher and navigate to `/platform` — you must be redirected to `/` with no indication the control plane exists.
- [ ] **11.** Smoke test: provision a test organization, toggle a feature flag, create a coupon, run an impersonation session and end it, then confirm all four appear in the Audit Center.
- [ ] **12.** Schedule `refresh_organization_metrics()` nightly (cron → `platform-admin` with `action: "refresh_metrics"`).
- [ ] **13.** Re-run `scripts/tenant-isolation-audit.sql` — Phase 2 must not have changed any tenant result.

---

## 15. Rollback Guide

Order: **2C → 2B → 2A**. Each is independent; revert only what is failing.

| Symptom | Action |
|---|---|
| `/platform` redirects a genuine platform user | `mfa_enrolled` is false, or the hook is not registered |
| Dashboard tiles all zero | Rollup never ran — press Refresh metrics |
| "Access denied: organizations.read" | Role lacks the capability — add a row to `platform_role_capabilities` |
| Provisioning refuses | The tenancy readiness guard is doing its job; read the message and resolve the named flag |
| Control plane broken | Roll back **2C and 2B only** — 2A leaves identity intact and nothing else depends on it |

⚠️ **The 2A rollback restores the Phase 1A token hook FIRST, and must not be reordered.** Dropping `platform_users` while GoTrue still calls a hook that selects from it fails every token issuance — **nobody, tenant or platform, could log in.**

The 2C rollback **refuses to run** if any organization other than ARK holds a paying subscription.

Because no tenant policy ever referenced `is_platform_admin()`, removing the entire control plane cannot affect a single tenant row. That was the point of the design, and it is what makes this rollback trivial.

---

## 16. Production Verification Checklist

- [ ] `SELECT count(*) FROM platform_role_capabilities;` → ~60
- [ ] A teacher account hitting `/platform` is redirected to `/`
- [ ] A platform user without MFA sees the MFA notice, and **no data loads**
- [ ] `SELECT platform_summary();` as a tenant user → **raises "Access denied"**
- [ ] Organization detail shows member **counts**, never names
- [ ] `UPDATE platform_audit_log SET action='x';` → **raises "append-only"**
- [ ] Impersonation with a blank reason → rejected
- [ ] Impersonation of a platform user → rejected
- [ ] Impersonation for 120 minutes → capped at 60
- [ ] Ending a grant writes `impersonation.end` to the audit log
- [ ] `scripts/tenant-isolation-audit.sql` results unchanged from Phase 1E
- [ ] ARK smoke test: attendance, fee collection, payroll, parent document access

---

## 17. Remaining Work for Phase 3

Per your sequence, Phase 3 is the **Public SaaS Website**. Carried forward from Phase 2:

**Operational (before Phase 3):**
1. Schedule the nightly metrics rollup — without it every dashboard reads stale zeros.
2. Populate `organization_metrics_daily.storage_bytes`; it is currently always 0 (storage size is not queryable from Postgres and needs a Storage API sweep in the rollup function).
3. Run the Phase 1E storage relocation and cross-tenant probe if not already done — both remain prerequisites for organization #2.

**Deferred by instruction, with tables already shaped:**
- Payment gateway, invoices, dunning → Phase 5
- Feature-flag *enforcement* in the ERP sidebar and RLS → Phase 6 (Phase 2 manages the data only)
- Cross-tenant support tickets → Phase 10
- Log shipping with an `organization_id` dimension → Phase 11

**Known gaps I did not paper over:**
- No separation of duties on platform-user creation — an `owner` can create another `owner`.
- Impersonation target is entered as a raw UUID. The control plane deliberately cannot list a tenant's users, so support must obtain it from the customer or the ticket. If that proves impractical, the right fix is a tenant-side "grant support access" button, not a user list on a platform screen.
- Health check reports no CPU/memory/disk. Those are Supabase platform metrics; surfacing them needs their management API in Phase 11.
