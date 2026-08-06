# Smart ARK — Multi-Tenant SaaS Architecture Review

**Document type:** Architecture Review & Decision Record (pre-implementation)
**Author:** Principal Architect review
**Date:** 5 August 2026
**Status:** DRAFT — requires approval before any Phase 1 code is written
**Scope:** Evolution of Smart ARK ERP from single-organization ERP to multi-tenant SaaS platform

---

## 0. How this document was produced

Every number in this document was measured against the repository at `main` (`3563ede`), not estimated:

| Measurement | Value | How measured |
|---|---|---|
| TypeScript/TSX source files | 1,401 | `find src -name "*.ts*"` |
| Lines of application source | ~198,800 | `cat` over the same set |
| Feature modules | 26 dirs under `src/features` | `ls src/features` |
| Service files | 207 (`*.service.ts`) | `find` |
| Hooks | 202 (`use*.ts*`) | `find` |
| Test files | 71 | `find src -name "*.test.ts*"` |
| Migrations | 87 | `ls supabase/migrations` |
| Tables created | 167 | `CREATE TABLE` scan across migrations |
| RLS policies | 362 | `CREATE POLICY` scan |
| Policies with `USING (true)` / `WITH CHECK (true)` | **102** | grep |
| Indexes | ~330 | `CREATE INDEX` scan |
| Edge functions | 14 (13 use the service role) | `ls supabase/functions` + grep |
| Storage buckets | 10 | grep on `storage.buckets` |
| Client DB call sites (`.from(`) | **1,243** across 201 files | grep |
| Occurrences of `organization_id` / `tenant_id` | **0** in SQL, **0** in `src` | grep |

That last row is the whole problem in one line.

---

## 1. Current Architecture Analysis

### 1.1 Shape of the system

```
                          ┌──────────────────────────────┐
   Web (Vercel SPA)  ───►  │  React 18 + TS + Vite        │
   Android (Capacitor) ──► │  react-router v7             │
                          │  TanStack Query (cache)      │
                          │  26 feature modules          │
                          └───────────────┬──────────────┘
                                          │  supabase-js (anon key)
                                          ▼
                          ┌──────────────────────────────┐
                          │  Supabase project            │
                          │   • Postgres (167 tables)    │
                          │   • RLS (362 policies)       │
                          │   • GoTrue auth              │
                          │   • Storage (10 buckets)     │
                          │   • Realtime publication     │
                          │   • 14 Edge Functions (Deno) │
                          └───────────────┬──────────────┘
                                          │
                       AiSensy (WhatsApp) │ Brevo (email)
                       ── single global API key each ──
```

**There is no server tier.** The browser talks directly to PostgREST with the anon key. This is the single most important fact for this project: *RLS is not one of several authorization layers — it is the only one.* Every architectural decision below follows from that.

### 1.2 Identity model (well-designed, and the right foundation to build on)

The codebase already runs **two distinct principal types** on one auth backend, and does it cleanly:

- **Staff** — a row in `public.profiles` keyed to `auth.users.id`. `public.is_staff()` is literally defined as "holds a profiles row."
- **Parents** — a row in `public.parent_auth_accounts`. Deliberately *not* given a `profiles` row.
- **Students** — `public.student_auth_accounts`, same pattern.

`AuthContext.tsx` mirrors this exactly: a parent leaves `user === null` and surfaces under `parent`, so the ~200 staff call sites that read `user.role` are *structurally incapable* of rendering for a parent. The comment in that file explaining why is correct and the design is sound.

`20260729_auth_user_trigger_fix.sql` shows the team already understands the danger here — it refuses to create a `profiles` row for a parent/student login, and ships a privilege-escalation audit block. **This is exactly the discipline multi-tenancy needs, applied to a different axis.**

### 1.3 Authorization model

Three layers, all already built:

1. **Coarse role** — `app_role` enum (`teacher | admin | management | coordinator`) on `profiles.role`, read by `get_user_role(auth.uid())` in RLS.
2. **Custom role catalog** — `rbac_roles` (slug, hierarchy_level, base_role) + `rbac_role_permissions` + `rbac_role_actions`, with per-user overrides in `rbac_user_permission_overrides` / `rbac_user_action_overrides`.
3. **Module catalog in TypeScript** — `src/features/rbac/constants/catalog.ts`, 19 module IDs, submodules with routes and legacy action keys. Deliberately not a DB table, and the reasoning in that file's header is good.

Enforcement in the UI runs through `PermissionGate`, `ActionGuard`, `ProtectedButton`, `RouteAccessGuard`, `LayoutAccessGate` and `useSidebarAccess`.

### 1.4 Routing model

`src/core/routing/sharedRoutes.tsx` is the strongest piece of architecture in the repo. Any route available to more than one role is declared **once**, with its RBAC submodule and the list of role layouts it mounts under. A build gate fails when a new module skips coordinator. This registry is what will make white-labelling and feature flags cheap — see §10 and §21.

### 1.5 Data access model

There is no repository/DAL abstraction. 1,243 `.from("table")` calls are spread directly across 201 files inside `*.service.ts` modules and hooks. Services are thin — they build a PostgREST query and return rows.

**This is the single most consequential fact for cost of change.** Any design that requires editing query call sites is a 1,243-site refactor with no compiler assistance. Any design where the *database* does the scoping costs approximately zero call-site edits. §4 chooses accordingly.

---

## 2. Problems in the Current Architecture

Ordered by severity for the SaaS transition.

### P0 — Critical (must be fixed before a second organization exists)

**P0.1 — 102 policies are `USING (true)`.**
`profiles`, `students`, `campuses`, `batches`, `student_attendance`, `class_logs`, `test_results`, `system_settings`, `subjects`, `standards`, `academic_years`, `taxes`, `expense_categories`, `student_fees`, `fee_installments`, `fee_structures` and more are readable by **any authenticated user**. Today that is correct — everyone authenticated belongs to ARK. The moment organization #2 exists, it is total cross-tenant data disclosure across the most sensitive tables in the product (student PII, fee ledgers, staff records).

**P0.2 — `handle_new_user()` mints a staff profile by default.**
```sql
COALESCE(meta_role::app_role, 'teacher')
```
Any `auth.users` INSERT with no `role` in metadata produces a `profiles` row with role `teacher`. `is_staff()` = "holds a profiles row". Combined with P0.1, **anyone who can call `supabase.auth.signUp()` becomes a teacher with read access to the entire database.** This is currently contained only because self-serve signup is not exposed. Phase 8 (organization onboarding) exposes it by definition. This must be closed *before* the signup wizard ships, not with it.

> **Immediate action, independent of this project:** verify whether anon signup is enabled on project `vxyshcucwdbpxrhddaeh`. If it is, this is a live vulnerability today.

**P0.3 — Storage policies scope by bucket only.**
Every bucket policy in the repo is of the form `USING (bucket_id = 'student-documents')`. No path check, no ownership check. Across 10 buckets — `student-documents`, `payslips`, `receipts`, `finance-attachments`, `question-papers`, `lead-imports`, `support-attachments`, `task-attachments`, `study-materials`, `profile-pictures` — any authenticated user can list and download every file. Payslips and student documents are the worst cases.

**P0.4 — Edge functions use the service role and derive nothing from the caller's tenant.**
13 of 14 functions instantiate a `SUPABASE_SERVICE_ROLE_KEY` client, which **bypasses RLS entirely**. They then take object IDs straight from the request body:
```ts
const studentId = String(body?.studentId ?? "");
const { data: stu } = await supabase.from("students").select(...).eq("id", studentId)
```
With one tenant this is fine. With many, it is textbook Broken Object Level Authorization: an admin of org B provisions a login for a student of org A by guessing/harvesting a UUID. Every function needs a tenant assertion, not just a role assertion.

Additionally, several functions decode the JWT with `JSON.parse(atob(token.split(".")[1]))` — **no signature verification**. That is survivable only where `verify_jwt = true` makes the platform verify first. `lead-intake` and `aisensy-webhook` run with `verify_jwt = false`.

### P1 — High (blocks correctness of the tenant model)

**P1.1 — Globally unique constraints that must become per-tenant.** Measured list:

| Table | Constraint | Consequence if unchanged |
|---|---|---|
| `campuses` | `name TEXT NOT NULL UNIQUE` | Two orgs cannot both have a "Main Campus" |
| `system_settings` | `key TEXT NOT NULL UNIQUE` | **All orgs share one settings row per key** |
| `rbac_roles` | `slug text not null unique` | Two orgs cannot both define `senior-coordinator` |
| `comms_templates` | `UNIQUE (template_key, version, language)` | Orgs overwrite each other's message templates |
| `comms_automation_settings` | `event_key TEXT NOT NULL UNIQUE` | One global automation config for all tenants |
| `settings_sms_automations` | `automation_key text not null unique` | Same |
| `settings_referrals` | `referral_code text not null unique` | Arguably correct globally — decide explicitly |
| `settings_whatsapp_config` | `settings_whatsapp_singleton` unique index | One WhatsApp config for the whole platform |
| `attendance_settings` | `singleton boolean ... unique` | One attendance policy for the whole platform |
| `payroll_role_rates` | `UNIQUE(role)` | One salary rate table for all tenants |
| `daily_report_log` | `UNIQUE(date)` | Only one org can file a report per day |
| `attendance_locks` | `unique (scope, period_type, period_key)` | Cross-tenant lock collisions |
| `attendance_closings` | `unique (scope, month)` | Same |

The "singleton" tables are the sharpest: they encode *"there is exactly one organization"* directly into the schema.

**P1.2 — `campus_id` is decorative.** It appears 29 times in migrations and 118 times in `src`, and in **zero** RLS policies. Branch isolation is currently pure client-side filtering. The multi-branch story the product will sell does not exist below the UI. Do not confuse "we have campuses" with "we have branch isolation."

**P1.3 — Integration credentials are global process secrets.** `AISENSY_API_KEY`, `BREVO_API_KEY`, `SENDER_EMAIL` are edge-function env vars. Every tenant would send WhatsApp from ARK's WhatsApp Business account and email from ARK's verified sender. This is not a configuration inconvenience — it is a compliance and deliverability failure, and it makes per-tenant credit metering (a stated Phase 4 requirement) impossible.

**P1.4 — Realtime publication is table-wide.** Tables are added to `supabase_realtime` wholesale. RLS is applied to `postgres_changes` for authenticated subscribers, but every tenant's write still fans out to every subscriber's filter evaluation. At 10,000 orgs this is a scaling wall, not a correctness bug — but it becomes a correctness bug the moment anyone adds a table to the publication without RLS on it.

**P1.5 — Branding is compiled in.** `index.html` hardcodes `ARK Management` as the title, an ARK JPEG as the favicon, and `ark-theme` as the localStorage key. 64 source files reference ARK. `src/core/theme/themes.ts` defines `ARK Primary` / `ARK Light`. Certificate and receipt templates hardcode `ARK Learning Arena`. Two campuses are hardcoded with **literal GPS coordinates** in the geofencing code.

### P2 — Medium (technical debt that will compound)

- **Duplicate feature modules:** `src/features/fee` *and* `src/features/fees`; `src/features/live-classes` *and* `src/features/liveclass`. Both pairs have their own components/hooks/services/types. Multiplying an ambiguity across 10,000 tenants is worse than multiplying it across one.
- **13 loose `.mjs`/`.py` scripts at repo root** (`add_students.mjs`, `try_logins.mjs`, `scratch_*.mjs`, `fix_updates.py`, `query_overrides.mjs`) — several appear to hold or exercise credentials. These do not belong in a repo that is becoming a commercial platform.
- **Two stale Vite timestamp artifacts** committed at root.
- **`supabase/schema_migration.sql` (736 lines)** sits outside the numbered migration chain — provenance unclear.
- **Migration naming is inconsistent** (UUID-suffixed Lovable exports vs. hand-named). Fine so far; will hurt when migrations must be replayed per-cell (§10).
- **No DAL.** Discussed in §1.5. Not worth fixing wholesale, but new tenant-aware code should not extend the pattern.

---

## 3. Multi-Tenant Readiness Assessment

Scored per dimension. **Ready** = works as-is. **Adaptable** = right shape, needs extension. **Absent** = does not exist.

| Dimension | Status | Notes |
|---|---|---|
| Tenant column on data | **Absent** | 0 of 167 tables |
| Tenant enforcement in RLS | **Absent** | 0 of 362 policies |
| Tenant claim in JWT | **Absent** | No `auth.jwt()` usage anywhere |
| Multi-principal identity | **Ready** | staff/parent/student split is excellent |
| Role model | **Adaptable** | `rbac_roles` needs org scoping; enum stays |
| Permission model | **Adaptable** | Registry-driven; add org dimension |
| Route registry | **Ready** | `sharedRoutes.tsx` is the feature-flag hook point |
| Module catalog | **Ready** | TS catalog is exactly the feature-flag source |
| Storage isolation | **Absent** | Bucket-level only |
| Edge function isolation | **Absent** | Service role, no tenant assertion |
| Provider credentials | **Absent** | Global secrets |
| Branding | **Absent** | Compiled in |
| Subscriptions / billing | **Absent** | No concept exists |
| Platform administration | **Absent** | No concept exists |
| Usage metering | **Absent** | No concept exists |
| Audit logging | **Adaptable** | ~12 `*_audit` tables exist per module; no platform-level log |
| Observability | **Absent** | No metrics, no error tracking, no health checks |
| Indexing discipline | **Adaptable** | ~330 indexes; none lead with a tenant column |

**Overall readiness: 22%.** The application layer is far more ready than the data layer. This is the good failure mode — the expensive thing (198k lines of working product logic) is sound; the missing thing (a tenant axis) is mostly mechanical and can be pushed into the database rather than the app.

---

## 4. Required Database Changes

### 4.1 Isolation model — the central decision

Three candidates:

| Model | Verdict |
|---|---|
| **Database (Supabase project) per tenant** | **Rejected.** 10,000 projects = 10,000 billing lines, 10,000 migration targets, no cross-tenant analytics, minutes-not-seconds provisioning. Violates the 2-minute onboarding requirement outright. |
| **Postgres schema per tenant** | **Rejected.** 167 tables × 10,000 tenants = 1.67M relations. `pg_catalog` degrades badly, `pg_dump` becomes unusable, and every one of the 87 existing migrations would need to run 10,000 times per deploy. PostgREST schema exposure would also have to be dynamic. |
| **Shared schema + `organization_id` + RLS** | **ADOPTED.** One migration per change. Constant-time provisioning (one INSERT). Cross-tenant platform analytics are a `GROUP BY`. Retains the option to shard later (§10.2) precisely *because* every row carries its org. |

**Decision: shared-schema, row-level multi-tenancy, enforced exclusively at the database layer.**

### 4.2 The tenant spine (new tables)

```sql
CREATE TABLE public.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,        -- subdomain: acme.smartark.app
  legal_name      text NOT NULL,
  display_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'trialing'
                    CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  country         text NOT NULL DEFAULT 'IN',
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  currency        text NOT NULL DEFAULT 'INR',
  locale          text NOT NULL DEFAULT 'en-IN',
  created_at      timestamptz NOT NULL DEFAULT now(),
  suspended_at    timestamptz,
  deleted_at      timestamptz                  -- soft delete; retention window
);

-- Membership is the ONLY authority on "which org is this user in".
CREATE TABLE public.organization_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principal_kind   text NOT NULL CHECK (principal_kind IN ('staff','parent','student')),
  is_default       boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, principal_kind)
);
```

Why `organization_members` rather than `profiles.organization_id`: a real person can be staff at one org and a parent at another (a teacher whose child studies elsewhere on the platform). Putting the org on `profiles` forecloses that permanently. It also gives the eventual org-switcher a table to read.

`branches` supersedes `campuses` conceptually — but **do not rename `campuses`.** 118 `campusId` references in `src` and 29 in SQL make a rename pure cost. Add `organization_id` to `campuses` and treat "campus" as the branch entity, with a `branches` view alias if the marketing term matters.

### 4.3 The tenant column — applied to all 167 tables

```sql
ALTER TABLE public.students
  ADD COLUMN organization_id uuid
    NOT NULL
    DEFAULT public.current_org_id()
    REFERENCES public.organizations(id) ON DELETE RESTRICT;
```

Three properties, and each one is load-bearing:

- **`DEFAULT public.current_org_id()`** — this is the pivot of the entire migration. The application never sends `organization_id`, so Postgres stamps it on every INSERT. **All 1,243 client call sites keep working unmodified.** Without this, the project is a 1,243-site refactor; with it, it is a schema change.
- **`NOT NULL`** — an unstamped row is an un-isolated row. Fail the write, never orphan the data.
- **`ON DELETE RESTRICT`** — org deletion must be an explicit, audited, staged process, never a cascade that silently erases a paying customer's history.

**Backfill for ARK:** every existing row gets tenant #1's id (§23).

### 4.4 Composite keys and indexes

Every constraint in P1.1 is rewritten as composite:

```sql
ALTER TABLE public.system_settings DROP CONSTRAINT system_settings_key_key;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_org_key_uq
  UNIQUE (organization_id, key);
```

The "singleton" tables lose their singleton guarantee and gain a per-org one:
```sql
DROP INDEX settings_whatsapp_singleton;
CREATE UNIQUE INDEX settings_whatsapp_org_singleton
  ON public.settings_whatsapp_config (organization_id);
```

**Indexing rule, non-negotiable:** every existing index whose table gains `organization_id` must be re-created with `organization_id` as the **leading column**. `students(batch_id)` becomes `students(organization_id, batch_id)`. An index that doesn't lead with the tenant forces the planner to scan across tenants and then filter — the classic multi-tenant performance cliff. This is ~330 index rewrites, mechanically generated (§26).

### 4.5 Foreign-key integrity across tenants

An FK to `students(id)` does not prove the student is in *your* org. For the ~25 highest-value relationships, use composite FKs:

```sql
ALTER TABLE public.students ADD UNIQUE (organization_id, id);   -- redundant but FK-referenceable
ALTER TABLE public.student_fees
  ADD CONSTRAINT student_fees_student_same_org
  FOREIGN KEY (organization_id, student_id)
  REFERENCES public.students (organization_id, id);
```

This makes cross-tenant reference **structurally impossible**, not merely policy-prevented. Apply to: `student_attendance`, `student_fees`, `fee_installments`, `exam_results`, `parent_student_links`, `class_students`, `payroll_items`, `leads`, `tasks`. Do not attempt all 167 — the cost/benefit falls off sharply past the core entities.

---

## 5. Required RLS Changes

### 5.1 The tenant resolver

```sql
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'organization_id',
    ''
  )::uuid
$$;
```

**This must read the JWT, never a table.** A resolver that does `SELECT organization_id FROM organization_members WHERE user_id = auth.uid()` gets evaluated per policy, per row, on 167 tables — it is the difference between a platform and an outage. The claim is populated by a Supabase **custom access token hook** that reads `organization_members` once at token issuance.

Note it is `STABLE`, not `SECURITY DEFINER` — it touches no tables, so it needs no elevated rights, and keeping it non-definer means it can never be a privilege-escalation vector.

**Migration-window fallback.** During Phase 2, before all sessions carry the claim, wrap it:
```sql
COALESCE(public.current_org_id(), public.default_org_id())
```
where `default_org_id()` returns tenant #1. This lets existing ARK sessions keep working with un-refreshed tokens. **`default_org_id()` must be deleted at the end of Phase 2** — leaving it in is a silent cross-tenant fallback. Add a Phase-3 gate test that fails if the function still exists.

### 5.2 Policy rewrite pattern

Every one of the 362 policies gains a tenant conjunct. The 102 `USING (true)` policies become:

```sql
-- BEFORE
CREATE POLICY "All can read students" ON public.students
  FOR SELECT TO authenticated USING (true);

-- AFTER
CREATE POLICY "org members read students" ON public.students
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
```

Policies that already encode role/ownership logic keep it and gain the conjunct:

```sql
CREATE POLICY "Staff read own leave_requests" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (user_id = public.current_profile_id()
         OR get_user_role(auth.uid()) IN ('admin','management','coordinator'))
  );
```

Write policies gain `WITH CHECK (organization_id = public.current_org_id())` — this is what stops a client from *sending* a foreign org id and overriding the column default.

### 5.3 Existing helpers must become tenant-aware

`current_profile_id()`, `is_staff()`, `is_parent()`, `is_fee_collector()`, `coordinator_owns_standard()`, `can_access_lead()`, `parent_child_ids()`, `is_parent_of()`, `get_user_role()`, `has_role()` all resolve identity without reference to an org. Each gets an `AND organization_id = current_org_id()` in its body. `current_profile_id()` is defined **four separate times** across migrations (`20260614`, `20260617`, `20260718`, `20260723`) — consolidate to one definition in the Phase 1 migration before touching it, or the fix will land in three copies and miss the fourth.

### 5.4 Platform administration must not run through tenant RLS

Platform staff are **not** `profiles` rows and **not** `organization_members`. They live in a separate table with a separate helper:

```sql
CREATE TABLE public.platform_users (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role     text NOT NULL CHECK (role IN ('owner','support','billing','readonly')),
  mfa_enrolled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_users WHERE user_id = auth.uid()) $$;
```

**Deliberate design choice: `is_platform_admin()` is NOT added to the 362 tenant policies.** Adding a global bypass to every policy makes one compromised support account equal to a total platform breach, and makes every policy harder to reason about. Instead:

- Platform portal reads only `platform_*` and `billing_*` tables, plus **aggregate views** over tenant data (counts, revenue, usage) — never raw student rows.
- Support access to a tenant's actual data goes through **explicit, time-boxed, audited impersonation**: a `platform_impersonation_grants` row (org, platform user, expiry, reason, customer consent flag) that the token hook reads to issue a scoped tenant token. Every such session writes to an append-only log.

This is how Salesforce and Stripe do support access, and it is the difference between "we can support customers" and "our support tool is the largest attack surface in the company."

### 5.5 Forced RLS

```sql
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
```
Applied to all 167 tables. Without `FORCE`, the table owner bypasses RLS — which is precisely the role that runs migrations and, in some misconfigurations, PostgREST.

### 5.6 The regression gate (this is the most important deliverable of Phase 2)

A `pgTAP` / SQL test suite that asserts, mechanically and without a human enumerating tables:

1. Every table in `public` (excluding an explicit allowlist of platform tables) **has** an `organization_id` column that is `NOT NULL`.
2. Every such table has `rowsecurity = true` **and** `relforcerowsecurity = true`.
3. **No policy's `qual` or `with_check` expression omits `current_org_id`** — read straight from `pg_policies`.
4. No `UNIQUE` constraint on a tenant table lacks `organization_id` among its columns.
5. Every index on a tenant table leads with `organization_id`.
6. `default_org_id()` does not exist (post-Phase-2).

This runs in CI and fails the build. It is the same discipline as the existing RBAC registry gate and the coordinator-route gate — the team has already proven this pattern works. **With 167 tables and 362 policies, no human review process will hold the line. Only a gate will.**

---

## 6. Required Storage Changes

**Path convention becomes the security boundary:**
```
{bucket}/{organization_id}/{entity}/{entity_id}/{filename}
```

Policy pattern for all 10 buckets:
```sql
CREATE POLICY "org reads own student docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.is_staff()
  );
```

Additional requirements:
- **All buckets private.** Signed URLs only, short TTL (≤ 5 min for payslips and student documents).
- **Existing ARK objects must be relocated** under `{ark_org_id}/…` during Phase 2, with a path-rewrite pass over the DB columns that store object paths. This is the only genuinely awkward part of the migration — it is not transactional with the SQL. Mitigation in §23.
- **Per-org storage quota** enforced by an edge function on upload, reading the org's plan limit and a `storage_usage` rollup. Storage is a metered resource (Phase 4) and unbounded uploads are a real cost risk.
- `profile-pictures` may stay org-readable-by-all if desired, but should still be org-partitioned so a future policy change is a one-liner.

---

## 7. Required Authentication Changes

| Change | Detail |
|---|---|
| **Custom access token hook** | A Postgres function registered as Supabase's access-token hook. Reads `organization_members` for `auth.uid()` and injects `organization_id`, `principal_kind`, and `plan_tier` into `app_metadata`. **Must be in `app_metadata`, never `user_metadata`** — the latter is user-writable and would let a tenant forge its own org claim. |
| **Fix `handle_new_user()`** | Stop defaulting to `'teacher'`. A profile is created **only** when the metadata carries a staff role **and** an `organization_id`. Self-serve signup creates an `auth.users` row with no profile and no membership; the onboarding wizard (§8) creates both, transactionally, server-side. This closes P0.2. |
| **Org switcher** | For users with multiple `organization_members` rows: re-issue the token with a different `organization_id`. Requires re-auth or a server-side token exchange — never a client-side claim change. |
| **MFA mandatory for `platform_users`** | Enforced at the token hook; a platform user without `mfa_enrolled` gets no platform claim. |
| **Per-org session policy** | Enterprise plans expect configurable session TTL and IP allowlisting. Store on `organizations`; enforce in the token hook. |
| **SSO (SAML/OIDC)** | Not Phase 1–8. But `organizations.auth_provider` should exist from Phase 1 so the column doesn't need a backfill later. Universities will ask for this in the first sales cycle. |

---

## 8. Required API Changes

### 8.1 Edge functions (all 14)

Standard preamble, extracted to `supabase/functions/_shared/tenant.ts`:

```ts
// Verify the JWT properly (not atob), resolve the caller, and pin the org.
const ctx = await resolveTenantContext(req);   // { userId, organizationId, role }
if (!ctx) return jsonResponse(401, { error: "Unauthorized" });
```

Then **every** service-role query in the function body is filtered:
```ts
const { data: stu } = await supabase.from("students")
  .select("id, name")
  .eq("id", studentId)
  .eq("organization_id", ctx.organizationId)   // ← closes the BOLA hole
  .maybeSingle();
```

Better still, where the function does not need to bypass RLS, **stop using the service role** and construct the client with the caller's JWT — then RLS does the work and the tenant filter cannot be forgotten. Audit each of the 13: several (`send-daily-report`, `end-of-day-check`, `kpi-engine`) likely only need caller privileges.

### 8.2 Public/unauthenticated endpoints

`lead-intake` and `aisensy-webhook` run with `verify_jwt = false` and currently authenticate with a **single shared secret**. Under multi-tenancy:

- `lead-intake` needs a **per-org intake key** (`organizations.intake_key`, rotatable), and the org is derived from the key — never from a body field.
- `aisensy-webhook` receives provider callbacks; the org must be resolved from the message id → `message_queue.organization_id`, not from anything the caller supplies.
- The public admission form and public lead form (`PublicLeadFormPage`) need an org-scoped route (`/o/:slug/apply`) whose slug resolves server-side to an org id.
- Both need per-org rate limiting. A single tenant's spam should not exhaust the platform's function quota.

### 8.3 New platform APIs

`platform-provision-org`, `platform-suspend-org`, `platform-impersonate`, `billing-webhook` (Razorpay/Stripe), `usage-rollup` (scheduled). All gated by `is_platform_admin()` except the billing webhook, which is signature-verified.

---

## 9. Required UI Changes

Deliberately small — this is the payoff of pushing isolation into the database.

| Area | Change | Effort |
|---|---|---|
| `AuthContext` | Add `organization: { id, slug, displayName, plan, features }` to context, sourced from the JWT claim + one `organizations` fetch | Low |
| `OrganizationProvider` | New provider in `AppProviders`, exposing `useOrganization()` | Low |
| Query cache | **Namespace every TanStack Query key with `organization_id`.** Non-negotiable: without it, an org switch serves the previous tenant's cached data. `src/core/constants/queryKeys.ts` is the single place to enforce this. | Medium |
| Branding | Replace hardcoded logo/title/theme with values from `useOrganization()`; drive `index.html` title/favicon at runtime | Medium |
| Feature gating | `<FeatureGate feature="payroll">` wrapper, and a `feature` field on `sharedRoutes` entries | Low |
| Onboarding wizard | New public flow (register → verify → org details → plan → provisioning progress → land in ERP) | High |
| Platform portal | Entirely new surface — see §16 | High |
| Org switcher | Header control for multi-org users | Low |
| Hardcoded ARK strings | 64 files; mostly a find-and-replace to `org.displayName`. The GPS-hardcoded campuses in the geofencing code need real work — coordinates must come from `campuses` rows. | Medium |

**Everything else — all 26 feature modules, all 207 services, all 1,243 query call sites — is untouched.** That is the design working.

---

## 10. Required Routing Changes

### 10.1 Tenant resolution

Adopt **subdomain-primary, path-fallback**:
- `acme.smartark.app/admin/...` — production default, cleanest cookie/session isolation
- `app.smartark.app/o/acme/admin/...` — fallback for local dev and for custom-domain edge cases
- `{custom-domain}/admin/...` — enterprise white-label; a `organization_domains` table maps host → org

Note `vercel.json` currently rewrites everything to `index.html` with no host awareness — wildcard subdomains need a Vercel domain configuration change, not just a rewrite rule. Custom domains additionally need automated certificate provisioning; budget for this in Phase 7, it is usually underestimated.

The tenant in the URL is a **routing hint only**. The authoritative org is the JWT claim. If the URL says `acme` and the token says `globex`, the app must sign out and re-authenticate — never silently trust either one.

### 10.2 Route structure

```
/                              → marketing / login redirect
/signup, /verify, /onboarding  → public onboarding (no org context)
/platform/*                    → PlatformProtectedRoute (is_platform_admin only)
/{admin|management|coordinator|teacher}/*  → existing, now org-scoped
/parent/*                      → existing
/o/:slug/apply                 → public org-scoped forms
```

`sharedRoutes.tsx` gains one optional field per entry:
```ts
{ path: "payroll/runs", element: <PayrollRuns/>, module: "payroll.runs",
  roles: ["admin","management"], feature: "payroll" }
```
`renderSharedRoutes` filters on the org's enabled features. **One field change gives the entire shared surface feature-flagging** — this is exactly the payoff the registry was built for, and it is why the registry should not be bypassed by native mounts.

---

## 11. Required RBAC Changes

The three-layer model survives intact. Changes are additive:

1. **`rbac_roles` becomes org-scoped.** `slug` unique → `UNIQUE (organization_id, slug)`. System roles (the built-in four) are seeded per org at provisioning, not shared globally — a tenant must be able to rename "coordinator" without affecting anyone else.
2. **`app_role` enum stays as-is.** It maps to layout/routing (`base_role`), not to authority. Do not extend it — that is what `rbac_roles.hierarchy_level` is for.
3. **All `rbac_*` tables gain `organization_id`** with the standard treatment: `rbac_role_permissions`, `rbac_role_actions`, `rbac_user_permission_overrides`, `rbac_user_action_overrides`, and all four audit tables.
4. **The TS module catalog stays global** — it is the *union of what the product can do*. What a given org can do = catalog ∩ plan features ∩ org feature flags ∩ role grants. Compute this in `useEffectiveAccess` / `useSidebarAccess`, which already do the intersection work; they gain one more set to intersect.
5. **The existing build gate extends:** a new module must now appear in 5 registries — catalog, actionCatalog, context, menu, **and the feature-flag registry**. Extend the existing test rather than writing a new one.
6. **Platform roles are a separate axis** and must never appear in `rbac_roles`.

---

## 12. Required Edge Function Changes

Covered in §8. Summary of per-function work:

| Function | verify_jwt | Change required |
|---|---|---|
| `invite-staff` | true | Tenant assertion; per-org sender identity; seat-limit check against plan |
| `student-parent-accounts` | true | Tenant assertion on every `studentId`/`parentId` (P0.4) |
| `verify-credentials` | true | Tenant assertion |
| `send-email` | true | Per-org Brevo credentials + sender; usage metering |
| `send-aisensy` | true | Per-org AiSensy credentials; WhatsApp credit decrement |
| `send-whatsapp` | true | Same |
| `send-daily-report` | true | Drop service role if possible; org filter |
| `end-of-day-check` | true | Org filter |
| `seed-users` | true | **Delete or gate to platform admin** — a seed function in a SaaS product is a liability |
| `kpi-engine` | false (cron) | Iterate orgs; per-org snapshots |
| `sla-checker` | false (cron) | Iterate orgs |
| `comms-scheduler` | false (cron) | Iterate orgs; respect per-org quiet hours and timezone |
| `lead-intake` | false | Per-org intake key (§8.2) |
| `aisensy-webhook` | false | Org resolved from message id (§8.2) |

The three cron functions all become "for each active org, do X". At 10,000 orgs a single invocation will exceed the function timeout — they need to become **queue-driven fan-out** (a `job_queue` table, batch workers) by Phase 10. Do not defer the *design* of this to Phase 10; write them batch-shaped in Phase 2.

---

## 13. Required Services Changes

**Near zero, by design.** The 207 services keep calling `.from("students").select(...)`; RLS filters reads and the column default stamps writes.

Exceptions requiring real work:

- **`financeSyncService`** — dedupes by `(source, source_id)`; needs org in the dedupe key.
- **`commsDispatcherService` / `aisensyService` / `renderMessage`** — must resolve per-org provider credentials and templates. Per the existing memory on hand-written `message_queue` rows: enqueueing must continue to go through `renderMessage` + `aisensyService`, and those now need an org parameter.
- **`student360.service`, report/PDF services** — org branding in headers/footers instead of hardcoded ARK.
- **`reportWindow.ts`** — no tenant work, but org branding flows through it.
- **Student import engine** — dedup scope must be org-bounded; a "duplicate" across orgs is not a duplicate.
- **Any service using `service_role`** — there should be none client-side; verify.
- **Anything with an aggregate/`count`** — verify RLS applies (it does for PostgREST, but `SECURITY DEFINER` RPC functions like `get_financial_summary()` **bypass it**). `get_financial_summary()` is a confirmed leak vector: it is `SECURITY DEFINER` and takes `p_campus_id` from the caller. It must take the org from `current_org_id()`, not from a parameter. **Audit every `SECURITY DEFINER` function for this pattern** — there are ~39.

---

## 14. Required Hook Changes

- **`src/core/constants/queryKeys.ts`** — every key factory takes org id. This is the highest-risk UI change in the project; a missed key is a cross-tenant cache read that RLS cannot catch because the data never leaves the browser. Make the key factory the *only* way to build a key and lint against literal array keys.
- **`useOrganization()`** — new.
- **`useFeature(flag)`** — new.
- **`useSubscription()`** — new; plan, status, limits, days remaining.
- **`useEffectiveAccess` / `useSidebarAccess`** — intersect with org features.
- **Realtime hooks (17 files use `.channel(`)** — channel names must be org-namespaced (`org:{id}:tasks`), otherwise every tenant subscribes to a global topic.
- **`useStudentInsights`, `useConfirm`/`usePrompt`/`useAlert`** — no change.

---

## 15. Required Context Changes

`AppProviders` composition becomes:

```
ErrorBoundary
└ QueryProvider
  └ AuthProvider                    (existing: staff | parent principal)
    └ OrganizationProvider          (NEW: org, plan, features, branding)
      └ ThemeProvider               (MODIFIED: reads org branding tokens)
        └ StaffRightsProvider       (existing)
          └ AppDataProvider         (existing)
```

`OrganizationProvider` sits **above** `ThemeProvider` because branding is org-derived, and **below** `AuthProvider` because the org comes from the session. It must render a hard block (not empty data) when the org is `suspended` or `past_due` beyond grace — a suspended tenant should see a billing wall, not a broken dashboard.

`AppDataContext` currently front-loads global reference data; verify it does not cache across an org switch (it will need the same key-namespacing as §14).

---

## 16. Required Dashboard Changes

**Tenant dashboards:** no structural change. They query org-scoped tables and RLS does the rest. Some widgets gain feature gates.

**Platform portal — entirely new**, and explicitly *not* a school-management UI:

| Section | Contents |
|---|---|
| Organizations | List, search, status, plan, seats, storage, health score, drill-in |
| Subscriptions | Plans, trials expiring, renewals due, churn risk |
| Billing | Invoices, payments, failed charges, refunds, dunning queue, tax/GST |
| Usage | AI credits, WhatsApp credits, SMS, storage, API calls — per org, with trend |
| Feature flags | Per-org module toggles, plan-level defaults, targeted rollouts |
| Support | Tickets, impersonation grants + audit trail, customer health |
| Platform health | Error rates, slow queries, function failures, queue depth |
| Revenue | MRR, ARR, ARPU, expansion, contraction, cohort retention |
| Audit | Append-only platform action log |

Build this as a **separate route tree with its own layout and its own protected route**, sharing only the design system. Do not mount platform pages inside `sharedRoutes` — the blast radius of a mistake there is the entire customer base.

---

## 17. Required Analytics Changes

- **Tenant analytics** — unchanged, now org-scoped for free.
- **Platform analytics** — must **never** read raw tenant rows. Build materialized views / rollup tables (`org_daily_metrics`: students, staff, logins, messages sent, storage bytes, revenue) refreshed nightly. This gives platform reporting without granting platform staff row access, and keeps dashboards fast at 10,000 orgs.
- **KPI engine** — `kpi_snapshots` and `kpi_cache` gain `organization_id`; the engine becomes per-org batch.
- **Cross-tenant benchmarking** ("your attendance vs. similar institutions") is a genuinely valuable future feature, but it is a **data-governance decision, not an engineering one**. Anonymised, k-anonymity ≥ 20, opt-in only. Flagged here so it is designed for and not retrofitted.

---

## 18. Billing Architecture

```
plans ──┬── plan_features (feature_key, limit)
        └── plan_prices (currency, interval, amount)
                │
organizations ──┴── subscriptions (plan_id, status, period, trial_end,
                                   grace_until, cancel_at)
                       │
                       ├── invoices (number, period, subtotal, tax, total, status)
                       │      └── invoice_lines (description, qty, unit, amount)
                       ├── payments (gateway, gateway_ref, amount, status)
                       ├── credit_notes / refunds
                       ├── coupons ── coupon_redemptions
                       └── usage_records (metric, quantity, period)
```

Decisions:

- **Gateway: Razorpay primary** (India-first, UPI/mandates/GST), **Stripe secondary** for international. Abstract behind a `PaymentGateway` interface from day one — dual-gateway retrofits are painful.
- **Invoice numbering must be per-org and gapless** (`{org_prefix}/{FY}/{seq}`) — an Indian GST requirement, and a sequence, not a count.
- **GST**: CGST/SGST vs IGST by state, HSN/SAC code, reverse charge for exports. `taxes` table already exists but is org-agnostic; extend rather than duplicate.
- **Webhooks are the source of truth**, not client callbacks. Idempotent by `gateway_event_id`.
- **Dunning**: `past_due` → grace (configurable, default 7d) → read-only → suspended (data retained 90d) → export offered → deletion. **Never delete on non-payment.** Data retention is a trust product.
- **Money as `numeric(14,2)` with an explicit currency column.** Never floats.

---

## 19. Subscription Architecture

Plan tiers (starting point — pricing is a business decision, the *structure* is the architecture decision):

| | Trial | Starter | Professional | Enterprise |
|---|---|---|---|---|
| Duration | 14 days | monthly/annual | monthly/annual | annual |
| Students | 50 | 500 | 5,000 | unlimited |
| Staff seats | 5 | 25 | 200 | unlimited |
| Branches | 1 | 1 | 5 | unlimited |
| Storage | 1 GB | 10 GB | 100 GB | negotiated |
| Modules | core | core + fees + exams | + payroll, CRM, live classes, AI | all |
| White-label | — | logo | logo + theme | + custom domain |
| Support | community | email | priority | SLA + CSM |

Enforcement rules:
- **Limits are enforced at the database**, via a `BEFORE INSERT` trigger calling `check_plan_limit('students')`. A UI-only limit is a suggestion.
- **Downgrade must not destroy data.** Over-limit records go read-only, never deleted. This is both an ethics and a retention decision.
- **Trial expiry → read-only + export**, never a wall with no way to get data out.
- Custom/negotiated plans are rows, not code branches.

---

## 20. White-Label Architecture

```sql
CREATE TABLE public.organization_branding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_name        text,
  logo_url        text,
  logo_dark_url   text,
  favicon_url     text,
  primary_color   text,     -- validated hex
  accent_color    text,
  theme_mode      text NOT NULL DEFAULT 'system',
  login_bg_url    text,
  email_header_url text,
  email_footer_html text,   -- SANITIZED server-side
  report_header_html text,  -- SANITIZED
  support_email   text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

Implementation notes that matter:

- **Colors → CSS custom properties**, injected by `ThemeProvider`. The theme system already uses `data-theme` and CSS variables, so this is an extension, not a rewrite.
- **Validate every color server-side.** A hex validator, not free text. Unvalidated CSS injection is an XSS vector, and "it's only their own tenant" is wrong the moment a parent views a page.
- **Sanitize all HTML fields** (email/report headers) with an allowlist. This is the most likely XSS hole in the entire feature.
- **The theme localStorage key `ark-theme` must become org-namespaced**, or two orgs on the same browser fight over it.
- **`index.html` title/favicon set at runtime** after org resolution; keep a neutral platform default for the pre-auth state.
- **Custom domains** (`organization_domains`: host, verified, ssl_status) — DNS verification via TXT record, certificate automation. Enterprise tier only; the operational cost is real.

---

## 21. Feature Flag Architecture

Three layers, resolved in order:

```
plan_features (what the tier includes)
      ↓ overridden by
organization_features (per-org grant/revoke — sales overrides, betas)
      ↓ intersected with
rbac permissions (what this user may do within enabled modules)
```

```sql
CREATE TABLE public.organization_features (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key     text NOT NULL,
  enabled         boolean NOT NULL,
  reason          text,            -- 'plan' | 'sales_override' | 'beta' | 'incident'
  expires_at      timestamptz,
  PRIMARY KEY (organization_id, feature_key)
);
```

- `feature_key` **is** the RBAC `ModuleId` — do not invent a second vocabulary. 19 keys already exist and are already the source of truth for the sidebar.
- Resolved flags ride in the JWT (`app_metadata.features`) so both the UI and RLS can read them without a round trip.
- **A disabled feature must be enforced at the database too**, not only hidden in the UI — a `payroll` policy conjunct of `has_feature('payroll')`. Otherwise a disabled module is a UI convention that PostgREST doesn't know about.
- Kill-switch flags (`reason = 'incident'`) let support disable a misbehaving module for one tenant without a deploy. This will pay for itself.

---

## 22. Monitoring & Observability Architecture

Currently **absent**: no metrics, no error tracking, no health checks, no slow-query visibility. At one tenant this is survivable. At 10,000 it is negligence.

| Layer | Instrument |
|---|---|
| Frontend errors | Sentry (or equivalent) with `organization_id` as a tag on every event |
| Frontend performance | Web Vitals per org; bundle-size budget in CI |
| API/PostgREST | Supabase logs → aggregation; p50/p95/p99 by table and org |
| Database | `pg_stat_statements` enabled; nightly slow-query report; connection-pool saturation alert |
| Edge functions | Structured JSON logs with `organization_id`, duration, outcome; failure-rate alerts |
| Queues | `message_queue` depth and age by org; alert on stalled rows (the existing "empty body" failure mode belongs here) |
| Business | Signups, activations, trial→paid, churn, failed payments |
| Audit | `platform_audit_log` — append-only, RLS-denied to everyone, readable only via a definer view for platform owners |
| Health | `/health` endpoint + synthetic login check per hour |
| Tenant health score | Composite of logins, feature adoption, support tickets, payment status → drives the CSM view in §16 |

**Every log line and every metric carries `organization_id`.** Retrofitting that dimension later means re-instrumenting everything.

---

## 23. Migration Plan (ARK → Tenant #1)

The hard requirement: **no downtime, no data loss, existing users keep working.**

### Stage 0 — Pre-flight (before any schema change)
1. Full backup + verified restore into a staging project. **A restore that has not been tested is not a backup.**
2. Confirm anon signup is disabled (P0.2).
3. Run the privilege-escalation audit from `20260729` and resolve every finding.
4. Snapshot row counts for all 167 tables — the reconciliation baseline.

### Stage 1 — Additive schema (zero app impact)
```sql
CREATE TABLE organizations …;
INSERT INTO organizations (slug, legal_name, display_name)
  VALUES ('ark', 'ARK Learning Arena', 'ARK Learning Arena')
  RETURNING id;                                   -- → :ark_org
CREATE TABLE organization_members …;
INSERT INTO organization_members (organization_id, user_id, principal_kind)
  SELECT :ark_org, user_id, 'staff'   FROM profiles WHERE user_id IS NOT NULL
  UNION ALL SELECT :ark_org, user_id, 'parent'  FROM parent_auth_accounts …
  UNION ALL SELECT :ark_org, user_id, 'student' FROM student_auth_accounts …;
```
Nothing in the app knows this happened.

### Stage 2 — Column addition, nullable, backfilled
```sql
ALTER TABLE students ADD COLUMN organization_id uuid REFERENCES organizations(id);
UPDATE students SET organization_id = :ark_org WHERE organization_id IS NULL;
```
Backfill in **batches of 10,000 with a commit between** — a single `UPDATE` over a large table takes a lock long enough to be an outage. Repeat for 167 tables via a generated script.

### Stage 3 — Constrain
```sql
ALTER TABLE students ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE students ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
```
Add composite uniques, composite FKs, and re-created indexes (`CREATE INDEX CONCURRENTLY`, then drop the old — never a plain `CREATE INDEX` on a live table).

### Stage 4 — Token hook, with fallback
Register the access-token hook. Deploy `current_org_id()` **with the `default_org_id()` fallback** so sessions holding pre-hook tokens keep working. Existing users notice nothing; new tokens carry the claim.

### Stage 5 — Policy cutover
Rewrite all 362 policies inside a single transaction per table. At this point ARK users are filtered to ARK's org — which is every row they could already see, so behaviour is identical.

### Stage 6 — Storage relocation
Copy objects into `{ark_org}/…`, rewrite stored paths, verify, then delete originals after a soak period. This is the one non-transactional step: run it **after** Stage 5, keep both paths readable during the soak via a temporary dual policy, and reconcile by object count.

### Stage 7 — Remove the fallback
Drop `default_org_id()`. Enable the CI gate from §5.6. **Only now is the system genuinely multi-tenant.**

### Stage 8 — Verification
- Row counts match the Stage-0 baseline exactly.
- Create a synthetic tenant #2 with seeded data; run an automated **cross-tenant probe suite**: for every table, authenticate as org B and assert zero org-A rows are visible. This suite becomes a permanent CI job.
- Full regression pass on ARK's real workflows.

---

## 24. Risk Analysis

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A table is missed and leaks cross-tenant | **High** | **Catastrophic** | §5.6 CI gate enumerates from `pg_catalog`, not from a human list |
| R2 | A `SECURITY DEFINER` function bypasses RLS (`get_financial_summary` confirmed) | **High** | **Catastrophic** | Audit all ~39; ban new definer functions without a tenant assertion; add to the gate |
| R3 | Query-cache key missing org → cross-tenant data in the browser | Medium | High | Centralised key factory + lint rule; RLS cannot catch this |
| R4 | Backfill locks a large table → outage | Medium | High | Batched updates, `CONCURRENTLY`, off-peak window |
| R5 | Storage relocation loses or orphans files | Medium | High | Copy-verify-soak-delete; never move-in-place |
| R6 | Token hook fails → every user locked out | Low | **Catastrophic** | Fallback in Stage 4; hook must fail-open to *no claim* (deny) not to a *default claim* (leak) |
| R7 | Performance regresses under composite indexes | Medium | Medium | Benchmark before/after on the 20 hottest queries; §26 |
| R8 | Cron functions time out at scale | High (later) | Medium | Design batch-shaped in Phase 2, queue-driven by Phase 10 |
| R9 | Platform support account compromised | Low | **Catastrophic** | No global RLS bypass; time-boxed audited impersonation; mandatory MFA |
| R10 | Feature-flag drift between UI and DB | Medium | Medium | Single `feature_key` vocabulary shared with RBAC catalog |
| R11 | Billing webhook replay/duplication | Medium | High | Idempotency on `gateway_event_id` |
| R12 | Scope creep collapses the phasing | **High** | High | Each phase independently deployable + revertible; no phase starts before the prior one's gate is green |
| R13 | ARK operations disrupted during migration | Medium | High | Every stage additive and reversible until Stage 7; staging rehearsal first |

**R1 and R2 are the ones that end companies.** Both are addressed by mechanical gates rather than review discipline, because 167 tables and 362 policies exceed what review can reliably cover.

---

## 25. Rollback Strategy

| Stage | Reversible? | How |
|---|---|---|
| 1 — new tables | Yes, trivially | `DROP TABLE` — nothing references them |
| 2 — nullable column + backfill | Yes | `DROP COLUMN` |
| 3 — constraints/indexes | Yes | Drop constraints; restore prior indexes (keep the old DDL in the migration as comments) |
| 4 — token hook | Yes | Deregister hook; `current_org_id()` falls back |
| 5 — policy cutover | Yes, per table | **Ship every policy rewrite with its exact prior definition in a paired `_rollback.sql`.** Per-table granularity means a bad policy is a one-table revert, not a platform revert |
| 6 — storage | Yes during soak | Originals still present; dual policy still active |
| 7 — drop fallback | **No** | Point of no return. Requires all prior gates green + a 7-day soak |
| Phases 3–10 | Yes | Feature-flagged off; platform portal is a separate route tree |

Standing rules:
- Every migration file ships with a rollback file. No exceptions.
- No `DROP COLUMN` on tenant data until 30 days after the phase is stable.
- Point-in-time recovery verified working before Stage 2.
- Rehearse Stages 1–8 end-to-end on a staging clone before touching production. Time the rehearsal — that number is the maintenance-window estimate.

---

## 26. Performance Impact

### Expected regressions
- **RLS evaluation cost**: one extra `=` comparison per row against a value the resolver returns from the JWT. `current_org_id()` is `STABLE` and touches no tables, so Postgres evaluates it once per query, not per row. **Estimated overhead: <2%.** If the resolver ever queries a table, this becomes 10–100× — which is why §5.1 is emphatic.
- **Index bloat**: leading `organization_id` adds 16 bytes per entry across ~330 indexes. Acceptable; the alternative is cross-tenant scans.

### Expected improvements
- Every query gains a highly selective leading predicate. At 10,000 orgs, `WHERE organization_id = ?` is a ~0.01% selectivity filter. Queries that scan a 1M-row `students` table today will touch a few thousand rows.

### Required work
1. **Benchmark the 20 hottest queries before and after.** Without a baseline there is no way to tell a regression from noise.
2. **Partition the largest tables by `organization_id` hash** once any exceeds ~50M rows. Candidates: `student_attendance`, `message_queue`, `exam_results`, `mcq_answers`. Design for it now (partition-compatible PKs); execute in Phase 10.
3. **Connection pooling** — Supabase's pooler in transaction mode. Note this breaks session-level `SET`, which is another reason the JWT-claim resolver is correct and a `SET app.org_id` approach would not be.
4. **Fix N+1s** revealed at scale. The current `qry()` pattern that swallows errors (per the teacher-dashboard memory) will also hide slow paths.
5. **Bundle size** — 1,401 files with heavy deps (`xlsx`, `jspdf`, `pdfjs-dist`, `html2canvas`, `mammoth`, `recharts`). Already lazy-loaded via `lazyWithRetry`; add a CI size budget before it grows further.
6. **Archive strategy** — per-org data retention policy, cold storage for graduated academic years.

---

## 27. Security Review

### Findings summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | **Critical** | 102 policies `USING (true)` — full cross-tenant read | Fix in Phase 2 |
| S2 | **Critical** | `handle_new_user()` defaults to staff role; any signup = teacher with global read | **Verify anon signup disabled TODAY** |
| S3 | **Critical** | Storage policies scope by bucket only — all files readable by any authenticated user | Fix in Phase 2 |
| S4 | **Critical** | Edge functions: service role + body-supplied IDs = BOLA | Fix in Phase 2 |
| S5 | **High** | `get_financial_summary()` is `SECURITY DEFINER` taking `p_campus_id` from the caller | Fix in Phase 2; audit all ~39 definer functions |
| S6 | **High** | JWT decoded via `atob` without signature verification | Safe only where `verify_jwt=true`; fix all |
| S7 | **High** | Global provider secrets (AiSensy, Brevo) shared across tenants | Phase 4 |
| S8 | **Medium** | Realtime publication is table-wide; channels are not org-namespaced | Phase 2 |
| S9 | **Medium** | No rate limiting on public endpoints (`lead-intake`, public forms) | Phase 2 |
| S10 | **Medium** | Loose `.mjs` scripts at repo root exercising credentials | Remove now |
| S11 | **Medium** | No CSP, no security headers in `vercel.json` | Phase 1 — cheap |
| S12 | **Low** | Hardcoded GPS coordinates for geofencing | Phase 7 |

### Against the stated threat list

| Threat | Defense after this plan |
|---|---|
| Cross-tenant access | `organization_id` NOT NULL + RLS + composite FKs + CI gate + cross-tenant probe suite |
| Privilege escalation | Org in `app_metadata` (not user-writable); no global RLS bypass; MFA on platform users |
| Broken object authorization | Composite FKs make cross-org reference structurally impossible; edge functions assert tenant |
| Data leakage | Forced RLS; org-namespaced query cache; aggregate-only platform analytics |
| URL guessing | UUID PKs + RLS — a guessed id returns zero rows |
| Bucket enumeration | Private buckets, path-scoped policies, short-TTL signed URLs |
| SQL injection | PostgREST parameterises; **audit any dynamic SQL in the ~39 definer functions** |
| Mass assignment | `WITH CHECK` on org column; column-level grants on sensitive columns |

### Additional requirements for enterprise sales
Data residency (India/EU) — plan for a cell architecture (§10.2) rather than promising it. GDPR/DPDP: export and erasure per org. Pen test before GA. SOC 2 Type II will be asked for; the audit log and access controls designed here are the prerequisites.

---

## 28. Enterprise Readiness Score

| Dimension | Now | After Phase 4 | After Phase 10 |
|---|---|---|---|
| Multi-tenancy | 0/10 | 8/10 | 9/10 |
| Security | 3/10 | 7/10 | 9/10 |
| Scalability | 3/10 | 6/10 | 9/10 |
| Observability | 1/10 | 5/10 | 9/10 |
| Billing/subscriptions | 0/10 | 8/10 | 9/10 |
| Self-service onboarding | 0/10 | 3/10 | 9/10 |
| White-label | 1/10 | 2/10 | 9/10 |
| Feature functionality | **9/10** | 9/10 | 10/10 |
| Code quality | 7/10 | 7/10 | 8/10 |
| Test coverage | 4/10 | 6/10 | 8/10 |
| Documentation | 6/10 | 7/10 | 8/10 |
| Compliance readiness | 2/10 | 4/10 | 8/10 |
| **Overall** | **3.0/10** | **6.0/10** | **8.8/10** |

The standout is functionality at 9/10. **Smart ARK has the hardest part of an education SaaS already built and in daily production use.** Most competitors at this stage have a tenant model and no product. The gap here is infrastructure, and infrastructure is tractable.

---

## 29. Technical Debt Analysis

| Debt | Cost to fix | Cost of not fixing | Verdict |
|---|---|---|---|
| Duplicate `fee`/`fees`, `live-classes`/`liveclass` modules | 2–3 d | Confusion compounds ×10,000 tenants; two code paths to make tenant-aware | **Fix in Phase 1** |
| `current_profile_id()` defined 4× across migrations | 1 h | Fixing it once will silently miss three copies | **Fix in Phase 1** |
| 13 loose scripts at repo root, some with credentials | 1 h | Credential exposure in a commercial repo | **Fix now** |
| Stale Vite timestamp artifacts committed | 5 min | Noise | Fix now |
| `schema_migration.sql` outside the chain | 2 h | Unreproducible database | Fix in Phase 1 |
| No DAL — 1,243 raw call sites | 3–4 wk | High, but the DB-default design avoids paying it | **Do not fix.** Cost exceeds benefit; enforce for new code only |
| `qry()` swallowing errors | 1 wk | Hides failures at scale (already caused one production bug) | Phase 10 |
| 71 tests for 198k LOC | ongoing | Regression risk during a 167-table migration | **Raise in Phase 2** — cross-tenant probes are the priority, not coverage % |
| Inconsistent migration naming | 1 d | Hurts per-cell replay | Phase 10 |
| No CI beyond existing gates | 3 d | Everything above | **Phase 1** |
| Hardcoded ARK strings (64 files) | 1 wk | Blocks white-label | Phase 7 |

**Deliberate non-goal:** do not refactor the 207 services. The architecture chosen in §4.3 exists precisely so that 198,000 lines of working, production-proven code does not need to be touched. Every hour spent rewriting working feature code is an hour not spent on the tenant boundary — and the tenant boundary is the thing that can lose customer data.

---

## 30. Recommended Implementation Order

Each phase is independently deployable, independently revertible, and **gated**: the next phase does not start until the prior phase's gate is green.

| Phase | Deliverable | Gate | Est. |
|---|---|---|---|
| **0. Emergency hardening** | Verify anon signup disabled; run privilege-escalation audit; remove root scripts; add security headers | Audit reports clean | **2 d** |
| **1. Foundation** | `organizations`, `organization_members`, `platform_users`; consolidate `current_profile_id()`; merge duplicate modules; CI pipeline; staging clone | ARK unaffected; CI green | 1–2 wk |
| **2. Tenant isolation** ⚠️ | `organization_id` on 167 tables; 362 policies rewritten; composite keys + indexes; storage relocation; token hook; edge-function tenant assertions; **CI gate + cross-tenant probe suite** | Probe suite: 0 cross-tenant rows across all 167 tables | **4–6 wk** |
| **3. Super Admin portal** | Platform route tree, org CRUD, impersonation with audit, platform analytics views | Support can operate without raw tenant reads | 2–3 wk |
| **4. Subscriptions** | Plans, features, subscriptions, trials, DB-enforced limits, lifecycle | Limits enforced at DB, not UI | 2–3 wk |
| **5. Billing** | Razorpay + Stripe, invoices, GST, dunning, webhooks | Idempotent webhook replay test passes | 3–4 wk |
| **6. Feature flags** | `organization_features`, `<FeatureGate>`, `feature` on `sharedRoutes`, DB-level enforcement | Disabled module returns 0 rows via PostgREST | 1–2 wk |
| **7. White-label** | Branding table, runtime theming, sanitised templates, custom domains | XSS test suite on branding inputs passes | 2–3 wk |
| **8. Onboarding wizard** | Public signup → verify → org details → plan → automated provisioning | **New org fully usable in < 2 min, zero manual steps** | 2–3 wk |
| **9. Marketplace/extensibility** | Public API + keys, webhooks out, integration directory | — | 3–4 wk |
| **10. Scale & optimisation** | Partitioning, queue-driven cron fan-out, caching, full observability, load test | 10k orgs / 1M students simulated | 4–6 wk |

**Total: ~7–9 months** at current velocity, with Phase 2 as the critical path and the highest-risk work.

### Sequencing rules
1. **Phase 0 before anything.** S2 is potentially live today.
2. **Phase 2 is atomic in intent** — a partially isolated database is more dangerous than an un-isolated one, because it *looks* safe.
3. **Phases 3–8 can partly parallelise** across two developers once Phase 2's gate is green; Phase 5 depends on Phase 4; Phase 8 depends on 4, 6, 7.
4. **Do not start Phase 8 before Phase 2's gate is green.** Self-serve signup on an un-isolated database is the failure mode that ends the product.
5. **Onboard tenant #2 as a real (friendly, low-stakes) customer immediately after Phase 3.** Two tenants in production find more isolation bugs in a week than any test suite finds in a month.

---

## Decision Summary

| # | Decision |
|---|---|
| D1 | Shared schema + `organization_id` + RLS. Not schema-per-tenant, not DB-per-tenant. |
| D2 | Tenant resolved from a JWT `app_metadata` claim via a table-free `STABLE` function. |
| D3 | `DEFAULT current_org_id()` on the column so 1,243 call sites remain unmodified. |
| D4 | `organization_members` as the membership authority, not `profiles.organization_id`. |
| D5 | Platform admins are a separate principal with **no global RLS bypass**; support access is time-boxed, audited impersonation. |
| D6 | Isolation is enforced by a CI gate reading `pg_catalog`, never by review discipline. |
| D7 | Existing feature code (207 services, 26 modules) is **not** refactored. |
| D8 | Subdomain-primary tenant routing; the URL is a hint, the JWT is authoritative. |
| D9 | `feature_key` == RBAC `ModuleId` — one vocabulary, enforced in both UI and DB. |
| D10 | Every migration ships with a rollback; Stage 7 is the only irreversible step. |

---

## What I need from you before Phase 0

1. **Approval of D1–D10**, particularly D1 (isolation model) and D5 (no global platform bypass) — both are expensive to reverse later.
2. **Answer to the live-risk question:** is anon signup enabled on project `vxyshcucwdbpxrhddaeh`? I can check this if you grant Supabase access.
3. **Business inputs** that change the architecture, not just the copy: target markets (India-only vs. international changes the billing and residency design), whether custom domains are Phase 7 or Phase 10, and whether cross-tenant benchmarking is a product goal.
4. **Confirmation of the phasing budget** — specifically that Phase 2 gets its full 4–6 weeks. Compressing Phase 2 is the single decision most likely to produce a data-breach headline.

No code will be written until this document is approved.
