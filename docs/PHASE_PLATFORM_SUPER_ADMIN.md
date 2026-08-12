# Phase 9A — Platform Super Admin Control Center

**Date:** 2026-10-01 (migration), implemented 2026-08-12
**Migration:** `supabase/migrations/20261001_phase9a_platform_control_center.sql`
**Rollback:** `supabase/rollback/20261001_phase9a_platform_control_center_rollback.sql`
**Tests:** `src/test/security/phase9.test.ts` — 74 assertions

> **ARK production data was not deleted, migrated, reset, or modified by this implementation.**
> The migration contains no `UPDATE public.organizations`, no `DELETE` and no `TRUNCATE`
> against any tenant table. Two assertions in the test suite enforce this permanently.

---

## 1. What this phase actually fixed

The audit that opened this phase found something more serious than a missing feature.

```
$ grep -rn "organization_features" src/features/rbac src/core src/contexts
(no matches)
```

`organization_features` shipped in Phase 2C. The control plane had been writing to it
ever since, and **nothing ever read it**. Every entitlement toggle on the organization
detail page was decorative: the switch moved, a row was written, and the customer's
sidebar was completely unaffected.

So the headline deliverable of Phase 9A is not the new screens. It is that entitlement
is now a real constraint, resolved by one algorithm that both the platform console and
the tenant's own permission layer execute.

The rest — lifecycle states, dependency rules, governance, bulk operations, protection —
exists because an entitlement system that is actually enforced needs all of them to be
safe to operate.

---

## 2. Architecture

### 2.1 What was reused, not rebuilt

Everything below already existed and was extended in place:

| Existing | How Phase 9A uses it |
|---|---|
| `platform_users`, `platform_role_capabilities` | New capabilities inserted as rows; no new role system |
| `platform_audit_log` (append-only) | Every new action writes here |
| `organization_features` | Now the override layer, and finally read |
| `feature_flag_assignments` | Now the entitlement history; gained `expires_at`, `source`, `batch_id` |
| `plan_features` | The plan layer of the resolver |
| `organizations.status` | Widened, not replaced |
| `platform-admin` edge function | New actions added to the existing capability-checked handler |
| Phase 2 impersonation | Untouched. No second path to tenant data was created |
| `MODULE_CATALOG` (TypeScript) | Still the single source of module truth |

No second control plane, no second module list, no second suspension system, no second
impersonation mechanism.

### 2.2 New objects

**Tables**

| Table | Purpose |
|---|---|
| `organization_protections` | Reference tenants that must not change by accident |
| `platform_module_governance` | Platform-wide withdrawals. **Exceptions only** — absence means available |
| `organization_delete_requests` | Reviewed deletion requests. Deletes nothing |

**Columns on `organizations`** (all nullable, all additive)
`held_at`, `archived_at`, `status_reason`, `status_changed_at`, `status_changed_by`,
`contact_name`, `contact_email`, `contact_phone`, `website`, `state`, `support_email`,
`support_notes`

**Functions**

| Function | Executable by | Purpose |
|---|---|---|
| `entitlement_layers(uuid)` | *service_role only* | Raw layers. No authorization of its own |
| `my_module_entitlements()` | authenticated | Tenant-facing. **Takes no argument** |
| `platform_entitlement_layers(uuid)` | authenticated | Console-facing, `organizations.read` |
| `platform_module_matrix()` | authenticated | Entitlement grid, `organizations.read` |
| `is_protected_organization(uuid)` | any | Trigger + RPC helper |
| `guard_protected_organization()` | trigger | Blocks unacknowledged lifecycle change |
| `expire_organization_features()` | service_role | Retires lapsed overrides |
| `platform_set_organization_status(...)` | service_role | Lifecycle write |
| `platform_update_organization_profile(...)` | service_role | Platform metadata write |
| `platform_set_module_entitlement(...)` | service_role | Grant / revoke |
| `platform_clear_module_override(...)` | service_role | Return to plan default |
| `platform_set_module_governance(...)` | service_role | Global availability |
| `platform_request_organization_delete(...)` | service_role | Open a request |
| `platform_review_delete_request(...)` | service_role | Two-person review |

### 2.3 Why SQL returns layers and TypeScript decides

`entitlement_layers()` returns the raw inputs — governance, status, plan, overrides —
and does not resolve them. One pure function,
`src/features/platform/modules/entitlements.ts → resolveEntitlements()`, decides
precedence, and **both** callers run it:

```
                    entitlement_layers(org)
                      │
        ┌─────────────┴─────────────┐
   my_module_entitlements()   platform_entitlement_layers(org)
        │                            │
   tenant sidebar               platform console
        └────────► resolveEntitlements() ◄────────┘
```

The alternative — resolving in SQL for tenants and in TypeScript for the console —
guarantees eventual drift, and the symptom is the worst kind of support call: the
customer sees a module the platform believes they do not have, and nobody can say which
side is wrong.

Being pure also makes precedence exhaustively unit-testable without a database, which is
what sections 2 and 3 of the test suite exercise.

---

## 3. Data model — entitlement precedence

Most authoritative first:

| # | Layer | Beats | Source label |
|---|---|---|---|
| 1 | Global governance | everything | `global_governance` |
| 2 | Organization status | plan, override | `organization_status` |
| 3 | Essential (core module) | plan, override | `essential` |
| 4 | Super Admin override (unexpired) | plan | `override` |
| 5 | Plan entitlement | default | `plan` |
| 6 | Default | — | `default` |

Then, **inside** the tenant, the ordinary RBAC layers apply: an entitled module is still
subject to role grants and user overrides. Entitlement answers *"did this school buy
it"*; RBAC answers *"may this person see it"*.

### The default that mattered most

A module nothing mentions resolves to **included**.

`plan_features` is sparsely populated in production. Defaulting to *excluded* would have
switched every module off for every existing customer at the instant this shipped — a
total outage dressed up as a feature launch. Plans in this product differ by capacity and
support, not by withheld modules, so silence means yes.

### Lifecycle states

| Status | What stays reachable |
|---|---|
| `active` / `trialing` / `past_due` | everything the plan allows |
| `hold` | settings, authentication, staff, students, **fees**, **reports**, help |
| `suspended` | settings, authentication, fees, help |
| `archived` / `cancelled` | nothing |

Reports survives a hold deliberately. Taking export away from a customer you have just
paused is how a billing dispute becomes a data-hostage complaint.

`past_due` closes nothing — overdue invoices are the billing lifecycle's grace period
(Phase 5), not this gate's business.

### Expiry

An override with a past `expires_at` is ignored by `resolveEntitlements` **and** filtered
out by `entitlement_layers`. Correctness never depends on the sweeper having run;
`expire_organization_features()` only makes the stored state match the effective state so
the console does not display a stale "expires 3 weeks ago" pill.

The sweeper **deletes** rather than setting `enabled = false`. The row said "enabled until
X"; after X it says nothing and the plan takes over. Flipping it would silently convert an
expired *grant* into an active *denial*.

---

## 4. Security model

### 4.1 The rule that did not change

**No platform administrator has an RLS bypass on any tenant table.** Not one policy on
any of the 167 tenant tables mentions `is_platform_admin()`.

Phase 9A adds none, and adds two enforcement points so it stays true:

- **CI:** `phase9.test.ts` walks every `CREATE POLICY` in every migration and fails the
  build if a tenant business table's policy references `is_platform_admin()`. The fix on
  failure is to delete the policy, **not** to add the table to an allow-list.
- **Deploy time:** a `DO` block at the end of the migration raises if such a policy
  exists, so a hand-applied SQL file is checked too.

### 4.2 Why privileged functions are service-role-only

Every mutating function is `SECURITY DEFINER` and revoked from `anon` and `authenticated`.
None of them checks `platform_can()`.

That is deliberate. The caller is always the `platform-admin` edge function, which runs
under the service role — where `auth.uid()` is `NULL` and `platform_can()` would return
false for everyone. A capability check in SQL would therefore either block every legitimate
call or be written to pass unconditionally. The check belongs where the caller's platform
identity is actually resolvable: `resolvePlatformActor()` in the edge function, which also
requires MFA.

### 4.3 Capability separation

Extends the **existing** vocabulary (`organizations.manage`, `feature_flags.manage`, …)
rather than introducing a parallel `platform.*` namespace. Two spellings of one concept
means every guard has to be checked against both, forever.

| Capability | owner | admin | finance | support | sales | CS | auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `organizations.hold` | ✓ | ✓ | ✓ | | | | |
| `organizations.archive` | ✓ | ✓ | | | | | |
| `organizations.delete_request` | ✓ | ✓ | | | | | |
| `organizations.review_delete` | ✓ | | | ✓ | | | |
| `modules.grant` | ✓ | ✓ | | | | ✓ | |
| `modules.revoke` | ✓ | ✓ | | | | ✓ | |
| `modules.bulk` | ✓ | ✓ | | | | | |
| `modules.govern` | ✓ | ✓ | | | | | |

Notable choices: finance may pause a non-payer but may not archive one or touch
entitlements — those are product decisions, not billing ones. Customer success may grant a
single module but never in bulk; a CS operator should not be able to change forty customers
at once. Auditor and sales gain nothing.

### 4.4 ARK protection

Enforced by a **database trigger**, not by UI copy. UI-only protection is protection that a
direct service-role call walks past — and every platform mutation in this system *is* a
service-role call.

```sql
IF NEW.status IS DISTINCT FROM OLD.status
   AND NEW.status IN ('suspended','hold','archived','cancelled')
   AND public.is_protected_organization(OLD.id)
THEN
  _ack := current_setting('app.protected_org_ack', true);
  IF _ack IS NULL OR _ack <> OLD.id::text THEN RAISE EXCEPTION …
```

Acknowledgement travels as a **transaction-local** GUC (`set_config(..., true)`), so it
cannot leak onto the next statement on a pooled connection — the failure mode that would
make this guard worthless under PgBouncer.

ARK is located **once**, by its stable slug, at install time. Protection is keyed on the
uuid thereafter, so a later rename cannot unprotect it. The seeding block reads
`organizations` and writes `organization_protections`; it never updates ARK's row.

Further protections: excluded from all bulk operations (`block_bulk`); delete requests
refused outright; `DELETE` on the row blocked by a second trigger; and
`organization_protections` has **no write policy for `authenticated` at all** — protection
that the protected party could switch off from the browser is decoration.

---

## 5. Deletion — the honest answer

**Smart ARK cannot erase a tenant on one click, and the console says so.**

Phase 1B made every `organization_id` foreign key `ON DELETE RESTRICT`. A hard `DELETE` of
an organization row is therefore not dangerous — it *fails*, with a foreign-key violation
naming one arbitrary child table out of 167. A real erasure would additionally have to
reach storage objects, billing records, and the audit log that proves what happened.

What shipped instead:

1. **Archive** — the terminal state the platform genuinely supports. Closes access,
   retains everything, reversible. This is what most deletion requests actually want.
2. **Delete request** — typed-slug confirmation (verified server-side), a written reason,
   a 7-day cooling-off period, and a review by **someone other than the requester**.
   Without that last rule, request-then-approve is a two-click delete button in a costume.
3. Approval marks the request ready for a manual, out-of-band erasure procedure. **It
   deletes nothing.**

The Danger zone states this in those words rather than implying a capability the platform
does not have.

---

## 6. Bulk operations

Never one statement across many organizations. Each tenant is applied individually so that:

- a protected organization can be refused without aborting the other 22;
- a per-organization failure returns a reason instead of rolling everything back;
- **every affected customer gets its own audit row** — "we changed 23 schools" is not an
  auditable record of anything.

A `batch_id` groups the rows so a bulk decision can be reviewed, and reversed, as the single
decision it was. Impact is previewed **before** the confirm button (eligible / blocked, with
blocked organizations named), a reason note is mandatory, and the call is capped at 200
organizations rather than silently truncating.

---

## 7. Idempotency and concurrency

| Action twice | Result |
|---|---|
| Grant module | One row. `ON CONFLICT (organization_id, feature_key) DO UPDATE` |
| Revoke module | Same — one row, flipped |
| Clear override | `{removed: false}`, not an error |
| Hold / suspend / restore | `{changed: false}`, **no second audit row** |
| Delete request | Returns the open request; a partial unique index enforces one |
| Bulk grant | Safe to retry; per-organization outcomes returned |

**Concurrency:** `platform_update_organization_profile` takes `_expected_updated_at` and
raises `stale_write` if the row moved. Two support agents on one customer is an ordinary
Tuesday; the second silently discarding the first's work is not acceptable. The edge
function turns that into a 409 and a sentence an operator can act on.

---

## 8. Tenant enforcement

`useModuleEntitlements` → `my_module_entitlements()` → `resolveEntitlements()` →
`resolveAccess({ moduleEntitlements })`.

Two properties of the resolver integration matter:

**The entitlement gate sits ABOVE the super-role bypass.** `management` is the most
powerful role a tenant has, but it is still a tenant role: it can hand out permissions the
organization already owns; it cannot buy Payroll. A per-user override cannot resurrect an
unentitled module either — the denial is applied to modules, submodules and actions
directly rather than left to inheritance, because `decide()` would let an explicit
`user_override` outrank the parent.

**It fails open.** An RPC error, an unapplied migration or a network blip resolves to
`undefined`, which the resolver reads as "no entitlement information" and allows
everything. Denying instead would black out a paying school's portal mid-lesson on one
failed request. The trade is explicit: a customer might briefly see a module they have not
paid for, versus an outage. The RLS that protects the *data* is unaffected either way —
entitlement gates the UI, never the rows.

Entitlements are also excluded from `isLoading`, so a slow lookup never renders a spinner
over an otherwise usable portal.

---

## 9. Testing

`src/test/security/phase9.test.ts` — **74 assertions**, all passing.

| Section | Covers |
|---|---|
| 1 | Registry derives from the catalog; no cycles; no phantom dependencies |
| 2 | Precedence, lifecycle policy, expiry |
| 3 | Dependencies enforced in the direction that matters |
| 4 | **The read path exists end to end** — the regression this phase fixed |
| 5 | Revoking never destroys; migration touches no tenant table; no ARK `UPDATE` |
| 6 | ARK protection: trigger, transaction-local ack, bulk exclusion, no write policy |
| 7 | Idempotency and stale-write refusal |
| 8 | Deletion is a reviewed request; server-side slug check; honest UI copy |
| 9 | Capability separation and audit coverage |
| 10 | **Mutation gate** — no tenant RLS bypass, anywhere |
| 11 | Migration is additive, idempotent, only widens the CHECK, has a rollback |
| 12 | UI honesty: no fabricated zeros, no-ops reported as no-ops |

### The mutation gate

Section 10 is the one that must never be softened. It walks every `CREATE POLICY` in every
migration file and fails if a tenant business table's policy references
`is_platform_admin()`:

```
expect(offenders, `platform RLS bypass introduced:\n…`).toEqual([]);
```

Adding `OR is_platform_admin()` to a tenant policy is one line, "just works", and converts
one compromised support account into a simultaneous breach of every customer's data. If
this gate fails, the fix is to delete the policy.

### Two pre-existing gates that caught my own work

- **`phase0` — deploy tooling.** The new migration was not registered in
  `scripts/deploy-migrations.mjs`, and its rollback was in `supabase/migrations/` rather
  than `supabase/rollback/`. Both fixed; neither gate weakened.
- **`docsCoverage` — permission vocabulary.** The new platform articles named capabilities
  like `modules.grant`, which are not RBAC catalog submodules. Rather than exempting them,
  the gate now parses `platform_role_capabilities` from the migrations and validates
  platform-category articles against **that** vocabulary — so an invented capability is
  still a failure.

---

## 10. Deployment

```bash
node scripts/deploy-migrations.mjs --dry-run     # review
node scripts/deploy-migrations.mjs               # apply
supabase functions deploy platform-admin         # required — new actions
npm run build && <frontend deploy>
```

Optional: schedule `expire_organization_features()` daily. Not required for correctness —
expired overrides already stop applying — only for console tidiness.

**Order matters.** The migration must follow Phase 2C (`organization_features`,
`plan_features`) and Phase 5A (`subscriptions`). It is registered accordingly in the deploy
runner.

**Deploying the frontend without the migration** is safe: `my_module_entitlements()` will
404, `useModuleEntitlements` logs a warning and returns `undefined`, and every module stays
visible. **Deploying the migration without the edge function** breaks the new console
actions with "Unknown action" — deploy the function.

---

## 11. Rollback

`supabase/rollback/20261001_phase9a_platform_control_center_rollback.sql` drops the
triggers, functions, new tables and new capability rows.

It deliberately **does not drop the columns** added to `organizations`. `status_reason` and
`held_at` may hold the only record of why a customer was paused; "roll back the feature"
must not mean "lose the operational history the feature captured". They are nullable and
unread once the app code is reverted.

The status CHECK is narrowed back **only if no row is currently in `hold` or `archived`** —
otherwise narrowing would fail validation and block writes to the organizations table.

---

## 12. Known limitations

1. **Erasure is not automated.** By design — see §5. The request workflow is the paper
   trail, not the mechanism.
2. **Scheduled enable/disable is not implemented.** The master prompt listed
   `SCHEDULE ENABLE` / `SCHEDULE DISABLE`. What shipped is *timed grants* (14/30/90 days),
   which cover the actual use case — a trial that ends by itself. Scheduling a change to
   *start* later needs a job runner; the existing provisioning worker could host it, but
   half a scheduler is worse than none.
3. **No hard limit enforcement.** Usage against plan limits is displayed. Nothing blocks a
   201st student on a 200-student plan. Enforcement is a billing-lifecycle decision that
   belongs with Phase 5, and guessing at it would be worse than showing the number.
4. **`resolve` is UI-side.** Entitlement gates the interface. A determined tenant user with
   a token could still call an RPC for a module that is switched off — RLS protects the
   data, and that has not changed, but entitlement is not a data boundary and should not be
   described as one.
5. **Metrics may be stale.** Usage reads the nightly rollup. An uncomputed metric prints an
   em dash rather than a fabricated zero, but "—" is common on a freshly provisioned tenant.
6. **The migration has not been applied to the live database.** Written, gated and reviewed
   — not deployed.

---

## 13. PASS / FAIL

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | Super Admin can view all organizations | **PASS** | `/platform/organizations`, search/filter/sort |
| 2 | Can edit platform organization metadata | **PASS** | Overview → Edit; named-column RPC |
| 3 | Can hold organizations | **PASS** | `organizations.hold` + reason + audit |
| 4 | Can suspend organizations | **PASS** | Existing lifecycle, reason now required |
| 5 | Can restore organizations | **PASS** | Restore clears hold/suspend/archive stamps |
| 6 | Can archive organizations | **PASS** | New `archived` status; all data retained |
| 7 | Hard deletion protected behind a safe workflow | **PASS** | Request + cooling-off + two-person review; **erasure not automated, stated plainly** |
| 8 | Can view all modules | **PASS** | `/platform/modules` catalog + matrix |
| 9 | Can grant modules | **PASS** | `modules.grant`, idempotent, audited |
| 10 | Can revoke modules | **PASS** | Data untouched; asserted by test |
| 11 | Can override plan entitlements | **PASS** | Override beats plan; "Overrides plan" badge |
| 12 | Can set temporary overrides | **PASS** | 14/30/90-day grants, self-expiring |
| 13 | Can manage feature flags | **PASS** | Modules tab supersedes the old flat list |
| 14 | Bulk entitlement changes, safely | **PASS** | Per-org apply, preview, protection exclusion, batch id |
| 15 | Dependencies enforced | **PASS** | Hard block on dependants; warning on missing deps |
| 16 | Plan limits visible | **PASS** | Usage tab; "—" when uncomputed |
| 17 | Organization usage visible | **PASS** | Usage tab from the metrics rollup |
| 18 | Every action audited | **PASS** | Append-only log; per-org rows for bulk |
| 19 | No global tenant RLS bypass | **PASS** | Mutation gate (CI) + `DO` block (deploy) |
| 20 | Existing impersonation still secure | **PASS** | Untouched; no second path added |
| 21 | ARK data untouched | **PASS** | No `UPDATE`/`DELETE`/`TRUNCATE`; asserted twice |
| 22 | ARK functionality unchanged | **PARTIAL** | Static + test verification only — see below |
| 23 | Existing organizations functional | **PASS** | Default-included resolution; fail-open |
| 24 | Billing / provisioning / white-label / comms / parent portal / check-in unchanged | **PASS** | No file in those modules modified |
| 25 | Tests pass | **PASS** | 1569 tests, 93 files, 0 failures |
| 26 | Build passes | **PASS** | see §14 |
| 27 | Security gates pass | **PASS** | phases 0–9 all green |

### On criterion 22 — stated precisely

ARK's runtime behaviour was **not** verified by signing in as an ARK user and exercising
the four portals. That requires the migration to be applied and a live session, neither of
which happened here.

What *was* verified: the migration performs no write against any ARK row; the entitlement
resolver returns "included" for every module when no plan rule and no override exist, which
is ARK's current state; the tenant path fails open, so an unapplied migration leaves ARK's
sidebar exactly as it is today; and no file under `src/features/{billing,provisioning,
branding,comms,parent,attendance}` was modified.

That is strong static evidence. It is not the same as having run it, and this document will
not call it verified.

---

## 14. Verification log (pre-deployment)

```
npx tsc --noEmit                    0 errors
npx vitest run                      93 files, 1569 passed, 0 failed
  └─ phase9.test.ts                 74 passed
  └─ phase0.test.ts                 38 passed  (deploy tooling)
  └─ docsCoverage.test.ts           25 passed
npx eslint src/features/platform src/features/rbac
                                    0 errors, 14 warnings (pre-existing baseline)
```

---

## 15. Production Verification — 2026-08-12

Project `vxyshcucwdbpxrhddaeh`. Baseline in `docs/generated/ARK_BASELINE.json`,
re-read via `node scripts/ark-baseline.mjs --compare`.

### 🔴 BLOCKER — activation held

**The migration is applied. The frontend is NOT deployed, and must not be until
the finding below is resolved.**

Resolving ARK's *real* entitlement layers through the *shipped* resolver returns
**18 of 19 modules ON and `certificate` OFF**:

```
OFF  certificate   plan   Not included in the internal plan.
```

ARK's plan is `internal`, which has 21 `plan_features` rows; three are `false`
(`certificate`, `website`, `ai`). Only `certificate` is a real `ModuleId`, so
only it resolves. ARK has **zero** feature overrides to countermand it.

This is not a bug in the resolver — it is the Phase 2C seed finally taking
effect. That seed reads:

> `certificate / website / ai` are seeded FALSE on every tier, including
> enterprise: they are not built … Selling them would be a refund event.

It was written when `plan_features` was decorative. Phase 9A makes it real.

**Certificate is currently live for ARK.** It is not aspirational: routes are
mounted at `sharedRoutes.tsx:1198` (`certificates`, `certificates/add`) and it
is in `menu.config.ts:467` for admin and management. Shipping the frontend today
removes a working, navigable module from a live school.

> The generated documentation inventory labels `certificate.*` ASPIRATIONAL.
> That label is wrong: the classifier looks for a `route:` property on the
> catalog entry, and these submodules have none even though the app mounts them.
> Worth correcting separately; it is not evidence of anything here.

**Two options, both the operator's call — I have taken neither:**

| | Action | Consequence |
|---|---|---|
| A | Add an override enabling `certificate` for ARK | ARK's module set is preserved exactly. One row in `organization_features`. |
| B | Accept the loss | The Phase 2C intent applies; ARK loses a module it can currently reach. |

I did not pick one. Option A modifies ARK's entitlements, which this phase's
rules forbid me doing unilaterally; option B removes a module from production.

### Verified against production

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Migration contains no destructive tenant operation | **PASS** | Executed-vs-stored scan: 0 row writes to tenant tables at migration time. Every `UPDATE`/`DELETE` is inside a stored function body, not a `DO` block. |
| 2 | ARK baseline captured | **PASS** | 15 tables + plan + overrides + org identity |
| 3 | Migration applied | **PASS** | version `2026100128`; re-applied a second time with no error (idempotency proven **against production**, not just asserted) |
| 4 | Objects created | **PASS** | 14 functions · 3 tables · 2 triggers · 5 indexes · 4 policies · 12 columns · CHECK widened |
| 5 | ARK identity unchanged | **PASS** | same id `126a6dd8-…`, slug `ark`, status `active`, plan `internal` |
| 6 | ARK data unchanged | **PASS** | `--compare` → no decrease in any of 15 counts; students 134, attendance 6590, exam_results 1479 |
| 7 | ARK protection is real | **PASS** | live `UPDATE organizations SET status='hold'` on ARK was **refused** by the trigger: *"Organization ark is the protected production reference tenant…"* (attempted inside a savepoint; ARK's row never changed) |
| 8 | Post-deploy assertions | **PASS** | 13/13 in `deploy-migrations.mjs --verify` |
| 9 | `organization_features` drives resolution | **PASS** | live round-trip on `abc-academi`: plan says ON → override written → layer returns `enabled:false` |
| 10 | Idempotency | **PASS** | second identical grant → `changed:false`, `organization_features` row count stays 1 |
| 11 | Temporary override expiry | **PASS** | expiry backdated 1h → resolver reports the override `ABSENT` **without** the sweeper running |
| 12 | Revoke does not delete data | **PASS** | ABC students/staff counts identical while the module was revoked |
| 13 | Restore is exact | **PASS** | `platform_clear_module_override` → back to 0 overrides, matching pre-test state |
| 14 | Entitlement history | **PASS** | 24 rows in `feature_flag_assignments` incl. `first assignment`, `re-applied (no change)`, `Override removed…` |
| 15 | No tenant RLS bypass — **live catalog** | **PASS** | 0 policies on 16 tenant tables reference `is_platform_admin()` |
| 16 | RLS gate mutation-tested | **PASS** | injected `OR is_platform_admin()` on `students` → gate **failed**; removed → passed |
| 17 | Entitlement cannot grant DB access | **PASS** | 0 policies reference `organization_features`; it is not an RLS input anywhere |
| 18 | Tests / build / types / lint | **PASS** | 1609 tests · build 1m11s · tsc 0 · ESLint 15 errors, all pre-existing and none in files this phase touched |

### Fixed during deployment

`deploy-migrations.mjs --verify` failed **1/13** immediately after the first
apply: *every tenant table carries organization_id* → `n=1`. The offender was
`platform_module_governance`, which is global by design and has no tenant column
to carry. Every prior phase extends `is_tenant_scoped_table()` when it adds a
control-plane table; Phase 9A had not.

Fixed by adding all three new tables to the classifier — and the other two
matter more than tidiness. `organization_protections` and
`organization_delete_requests` *do* carry `organization_id`, so the column check
would have passed either way, but Phase 1C's RLS loop grants every
tenant-scoped table a generic `USING (organization_id = current_org_id())`
policy. On `organization_protections` that would let a tenant's own admin
**delete the row protecting them**. Latent, and now closed.

### INCONCLUSIVE — not verified, and not claimed

None of these failed. They were **not run**, because they need a browser session
and credentials I do not have.

| Item | Why | What would settle it |
|---|---|---|
| ARK real login; management / teacher / coordinator / parent portals | No ARK credentials | Sign in and confirm the module set matches §15's snapshot |
| Sidebar hides a revoked module; direct navigation blocked | Needs a logged-in tenant session | Steps 4–6 of the master prompt's §8 |
| `/platform` routes render | Frontend not deployed | Deploy, then visit |
| Non-platform roles denied `/platform` | Same | Attempt with a tenant login |
| Hold / suspend / archive / restore end to end | Deliberately not run on a live tenant; the **SQL layer** is proven (#7) but the **edge-function + UI path** is not | Run against a throwaway org after activation |
| Delete-request workflow | Same | Same |
| Bulk entitlement across ≥2 orgs | Only one non-ARK org exists | Provision a second test org |
| Dependency refusal in the UI | Unit-tested only (`checkDisable`), not clicked | Try disabling Students in the console |
| `platform_audit_log` entries | Written by the **edge function**, which was not invoked — the RPCs I exercised write `feature_flag_assignments` only | Perform one action through the deployed console |
| Entitlement fail-open in a live portal | Resolver logic unit-tested; not observed under a real RPC failure | Block the RPC and load a portal |

### Deployment ordering — a coupling that will break the console

**Do not deploy `platform-admin` without the frontend.** Its `set_status` action
now requires a reason for destructive states and routes through
`platform_set_organization_status`. The **currently deployed** console calls it
with no reason (old `changeStatus`), so deploying the function alone turns the
existing Suspend button into a 400.

Correct order once the certificate decision is made:

```
1. resolve certificate (option A or B)
2. supabase functions deploy platform-admin
3. deploy frontend
4. re-run: node scripts/ark-baseline.mjs --compare
5. ARK login + module snapshot vs §15
```

---

## 16. Files

**New**
```
supabase/migrations/20261001_phase9a_platform_control_center.sql
supabase/rollback/20261001_phase9a_platform_control_center_rollback.sql
src/features/platform/modules/moduleRegistry.ts
src/features/platform/modules/entitlements.ts
src/features/platform/components/LifecycleDialog.tsx
src/features/platform/components/ModuleEntitlementsPanel.tsx
src/features/platform/pages/ModulesPage.tsx
src/features/rbac/hooks/useModuleEntitlements.ts
src/features/docs/content/platform.ts
src/test/security/phase9.test.ts
docs/PHASE_PLATFORM_SUPER_ADMIN.md
```

**Modified**
```
supabase/functions/platform-admin/index.ts      8 new actions
scripts/deploy-migrations.mjs                   migration registered
src/features/platform/services/platform.service.ts
src/features/platform/hooks/usePlatform.ts
src/features/platform/providers/PlatformRealtimeProvider.tsx
src/features/platform/context/PlatformAuthContext.tsx
src/features/platform/components/PlatformShell.tsx
src/features/platform/routes.tsx
src/features/platform/pages/OrganizationsPage.tsx
src/features/platform/pages/OrganizationDetailPage.tsx
src/features/rbac/resolver/rbacResolver.ts      entitlement gate
src/features/rbac/resolver/types.ts
src/features/rbac/hooks/useEffectiveAccess.ts
src/features/rbac/hooks/index.ts
src/features/docs/content/index.ts
src/test/security/docsCoverage.test.ts          second permission vocabulary
```

No file under `src/features/{students,fees,payroll,exam,attendance,leads,comms,parent}`
was modified.
