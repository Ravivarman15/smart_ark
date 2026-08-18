# Branch Management

Setup → **Manage Branches** (`/admin/setup/branches`, `/management/setup/branches`).

## Why this exists

The pricing page sells a branch allowance — Professional lists **Branches: 5** —
and the whole enforcement chain was already built and working:

| Piece | State before this feature |
|---|---|
| `plans.max_branches` | populated per plan |
| `plan_limit(org,'branches')` | works |
| `usage_status()` → `branches.used` | counts `public.campuses` |
| `trg_enforce_plan_limit` on `campuses` | blocks the insert past the limit |
| Billing page usage bar | renders the number |
| **A way to create the second branch** | **did not exist** |

`public.campuses` has RLS enabled and its only policies are `SELECT`
("Anyone can read campuses", "parent_read campuses"). With no INSERT policy,
no client could ever add one. On the live database every organization had
exactly **one** campus — the row `provision_step_branch()` created at signup.

## The data model: one branch, two rows

| Table | Holds | Who points at it |
|---|---|---|
| `campuses` | id, name, address, geo | **20 tables** carry a `campus_id`: students, profiles, batches, exams, fee/expense transactions, live classes, alerts, KPI snapshots, support tickets… and `usage_status()` counts these rows as "branches" |
| `organization_branches` | code, address, geofence radius, maps URL, `is_primary`, `is_active`, `is_checkin_location` | the branch UI and Settings → Check-in & Check-out |

They are linked by `organization_branches.campus_id`.

**Both rows must exist for a branch to work.** A campus with no descriptor is
invisible in every branch UI while still consuming a paid plan slot — and
nobody could work out why "3 of 5" showed with two branches on screen. That is
why `campuses` keeps its read-only policy set and all writes go through RPCs
that own both rows in a single statement.

## The RPCs

`supabase/migrations/20261009_branch_management.sql` — additive and idempotent;
it creates functions and grants, and touches no table, policy or row.

| Function | Notes |
|---|---|
| `branch_directory()` | Every branch with live student / staff / class counts. Staff-readable; returns `[]` (not an error) for a parent or a session with no membership. |
| `create_branch(name, code, address, lat, lng, is_primary)` | Writes both rows. The first branch becomes primary whether or not the flag was set. |
| `update_branch(id, …)` | `NULL` argument = leave alone. Renames sync to `campuses.name`, because that is the row every campus dropdown in the product reads. |
| `delete_branch(id)` | Removes both rows, freeing a plan slot. |
| `assert_can_manage_branches()` | The single definition of who may write. Not granted to anyone. |

### Security

Every function is `SECURITY DEFINER`, which bypasses RLS, so each one
re-establishes by hand what the policies would have enforced:

- the organization comes from `current_org_id()` and is **never a parameter** —
  a browser must not be able to name the tenant it writes into
- `is_org_suspended()` is checked explicitly, because RLS is what normally
  applies it and RLS is not running inside the function
- writes require `has_any_role(ARRAY['admin','management'])`, matching the
  existing `organization_branches_write` policy
- `search_path` is pinned to `public`
- `EXECUTE` is **revoked** from `PUBLIC` and `anon` before being granted to
  `authenticated`

> **Revoking is the part that matters.** Supabase ships
> `ALTER DEFAULT PRIVILEGES` granting `EXECUTE` on every new function in
> `public` to `anon`, `authenticated` and `service_role`. A migration that only
> writes `GRANT … TO authenticated` changes nothing — anon already had it. This
> was caught by reading the ACL back after the first apply, where all five
> functions returned `anon=X/postgres`. Nothing could actually be written
> (`current_org_id()` is NULL without a JWT, so the guard raises), but four
> functions whose purpose is writing tenant data were reachable
> unauthenticated, and the source read as though they were not.
>
> `assert_can_manage_branches()` additionally loses `authenticated`: nothing
> outside the database calls it. The three writers still can, because a
> `SECURITY DEFINER` function runs as its owner.
>
> The migration's verification block now asserts the resulting ACL rather than
> assuming the statements achieved it.

### Plan limits are not re-implemented

`create_branch` inserts into `campuses`, which fires `trg_enforce_plan_limit`.
Its message — *"Plan limit reached: 5 of 5 branches allowed on your current
plan. Upgrade from Billing to add more."* — propagates to the toast unchanged.

The allowance shown on the page is **advisory**, read from `usage_status()`,
and **fails open**: a slow or failed usage read leaves the Add button enabled
and lets the database refuse. A UI that guesses should guess permissive.

## Viewing

Every row has a **View** button, and clicking the row opens the same read-only
dialog — not the edit form. A stray click on a table should not put a live
branch into an editable state, and "how many students are at North Campus?" is
the most-asked question about a branch.

The dialog shows the counts, the code/address/coordinates, whether geofenced
check-in is on, and — the part that stops a support ticket — **why Delete is
absent** when records are still assigned.

View is deliberately **not** gated on `setup.branch.edit`. Read-only access to
the branch list is a real permission state.

## Filtering

| Where | Control | Applied |
|---|---|---|
| Manage Branches | search (name / code / address) + Active / Inactive / All | client-side; the directory is a handful of rows |
| Manage Students | Branch dropdown | **server-side** — `toServerParams` has mapped `campusId` to SQL since before the page could set it |
| Manage Staff | Branch dropdown | **server-side** — `useStaff({ campusId })`, so paging and counts stay honest |
| Manage Classes / Batches | Branch dropdown | in `batchesService.list`, beside the existing standard/course filters |

One component, `setup/components/BranchFilter.tsx`, backs all three dropdowns.
It reads `campuses` rather than the branch directory on purpose: `campus_id` is
the column being filtered, so the options are exactly the values that can
appear there — and a deactivated branch stays selectable, because you still
need to find the records attached to one.

**It renders nothing while the organization has fewer than two branches.** Most
tenants have exactly one, and a dropdown whose only option is "All branches" is
furniture on three toolbars at once. It appears by itself the day a second
branch is created.

> Filtering the branch list never changes what is safe to do on it. "Is this
> the last branch?" and "is this the first?" read the **unfiltered** set —
> otherwise hiding the others behind a search would offer Delete on the only
> branch an organization has.

## Deleting

A branch is deletable only while nothing points at its campus. Nine foreign
keys block a delete today (`students`, `profiles`, `batches`,
`fee_transactions`, `expense_transactions`, `kpi_snapshots`, `alerts`,
`ihi_trend`, `fee_trend`). `delete_branch` **discovers** them from
`pg_constraint` rather than carrying a hand-written list, so the tenth table
someone adds is covered the day it is created — and the error names each table
with its row count instead of surfacing a raw `23503`.

The row shows those counts, and the Delete action is simply absent until all
three are zero. Two further rules:

- an organization must keep **at least one** branch
- deleting the **primary** branch promotes the next one, so a tenant is never
  left without a default location

> **Deactivating is not deleting.** An inactive branch is hidden from new
> assignments but keeps its `campuses` row, so it still counts against the plan.
> Only a delete frees a slot. The form says so.

## RBAC

Registered in all four registries — a new module missing from any of them is
invisible in *Manage Staff Role*, which is what a build gate in
`registryAudit.test.ts` exists to catch.

| Registry | Entries |
|---|---|
| `catalog.ts` | `setup.add_branch`, `setup.manage_branch` |
| `actionCatalog.ts` | `setup.branch.create`, `setup.branch.edit`, `setup.branch.delete` |
| `menu.config.ts` | Setup group, admin + management |
| `sharedRoutes.tsx` | `setup/branches`, mounted under every allowed role layout |

No `legacyAction`: this surface never existed under the old
`staff_action_rights` system, so there is nothing to stay compatible with and a
legacy key would only make the resolver fall back.

Create / edit / delete are separately grantable on purpose. A plan sells a
fixed number of branches, so "who may spend one" — and "who may delete one,
freeing a paid slot" — are decisions an organization should be able to make
independently of who may look at the list.

## Reach

`invalidateSetupLookups()` fans a branch change out to every namespace that
renders a campus — students, fees, exams, live classes, comms recipients,
reports. Without it a new branch is missing from every dropdown until a hard
reload. `campuses` is already in `SETUP_REALTIME_TABLES`, so other signed-in
users pick it up too.

## Verification

Proven against the live schema inside a `BEGIN … ROLLBACK` transaction, using
the `testing` organization's admin identity (ARK untouched, asserted at the
end of the probe):

| # | Check | Result |
|---|---|---|
| 0 | admin identity resolves | `current_org_id` matches, `has_any_role` true |
| 2–4 | create writes both rows, directory sees it | 1 campus + 1 descriptor |
| 5 | duplicate name, case-insensitively | refused |
| 6 | rename reaches `campuses` | synced |
| 7 | delete an empty branch | both rows gone |
| 8 | delete the primary | flag handed on, exactly 1 primary |
| 9 | delete the last branch | refused |
| 10 | a teacher tries to create | refused |
| 11 | no session | refused |
| 12 | ARK rows | unchanged |

Step 8 was a real defect the first run found: an empty branch **is** deletable
and may well be the primary, and the delete succeeded leaving the tenant with
no primary at all. Nothing downstream would have complained.

Unit + gate coverage: `src/features/setup/testing/branchManagement.test.ts`
(40 tests) and `src/test/security/routeMounts.test.ts` (5).

## Mounting the route (the 404 trap)

`renderSharedRoutes()` is called for **teacher and coordinator only**. The
admin and management layouts declare their routes natively in `App.tsx`, so a
`SHARED_ROUTES` row buys those two layouts **nothing**.

The first cut of this feature had two registry rows, all four RBAC
registrations, a page component and 40 passing tests — and both sidebar entries
404'd, because no `<Route path="setup/branches">` existed under `/admin` or
`/management`.

Nothing caught it: `rbacRouteAudit` decides reachability with
`getNativeSubmoduleClaims()`, which reads `NAV_CONFIG`. The menu is treated as
*evidence* a route exists, so a menu entry pointing at a route nobody mounted
proves itself.

`src/test/security/routeMounts.test.ts` now reads `App.tsx` and fails when a
sidebar destination is mounted nowhere. It found a second live 404 the same
way: **Communication Center** (`/admin/communication`,
`/management/communication`) — whose `SHARED_ROUTES` row is scoped
`layouts: ["coordinator","teacher"]` and whose native mount was never added.
Both are fixed.

**Adding a page for admin or management means adding it to `App.tsx`.** The
registry alone is not enough.
