# Organization erasure (and hold)

Platform console → **Organization → Danger zone**.

## Hold — already worked, unchanged

`Hold`, `Suspend`, `Archive` and `Restore` all existed and all work today.
They go through `platform-admin → set_status`, which:

- requires the matching capability (`organizations.hold`, `organizations.archive`,
  `organizations.manage`)
- **requires a reason** for any of hold / suspend / archive / cancel — collected
  by `LifecycleDialog`, rejected with a 400 if missing
- writes the lifecycle timestamps and an audit row
- refuses to change a **protected** organization's status without an explicit
  acknowledgement (`app.protected_org_ack`, transaction-local)

`hold` is in the `organizations.status` CHECK constraint. Nothing needed doing.

Every one of these is reversible and removes no record.

## Erasure — new, and the only irreversible action in the product

### What it used to be

Phase 9A shipped an honest placeholder: request → 7-day cooling-off → approval
by someone other than the requester, and **approval deleted nothing**. The
header on that migration says erasure "is not a capability this platform has",
and the UI said so too. That was true and it is no longer.

### Five gates

| # | Gate | Where |
|---|---|---|
| 1 | `organizations.purge` capability — **owner only**, deliberately not admin | DB + edge function |
| 2 | An **approved** delete request for *this* organization | `platform_purge_organization` |
| 3 | Cooling-off + approval by a second person | `platform_review_delete_request` (unchanged) |
| 4 | Organization must be **archived or cancelled** | `platform_purge_organization` |
| 5 | Typed slug, re-verified server-side | `platform-admin` |

Three of the five are in the database, where a mistake in the console cannot
skip them. Because admin can open a request and support can approve one, but
neither can purge, **no single platform account can request, approve and
execute an erasure**.

A protected organization (ARK) is refused before anything is read, by the same
`is_protected_organization()` predicate the `organizations` trigger uses.

### How it deletes

211 foreign keys reference `organizations`: 30 CASCADE, 7 SET NULL and **174
RESTRICT**. A plain `DELETE FROM organizations` fails on the first of the 174.

Converting them all to CASCADE was the alternative and is rejected — RESTRICT
is what stops an accidental one-line delete taking a live tenant's fees and
payroll with it. The safety belongs in the schema; the deliberate path goes
around it.

So `platform_purge_organization` sweeps the **209 base tables carrying
`organization_id`**, discovered from the catalog rather than hardcoded:

1. delete what it can from each table
2. a table still blocked by a child row is skipped and retried next pass
3. repeat until nothing is left, or a whole pass makes no progress
4. if tables remain, **RAISE** — the transaction rolls back and names them

A half-purged tenant (no students but still billed) is worse than a refusal.

Then the `organizations` row goes, cascading the 30, and **every target table is
re-counted**. Anything still standing rolls the whole thing back.

> **Why row counts are not the proof.** The sweep reports what *it* deleted;
> more rows vanish underneath it by cascade from a parent it removed first. A
> real run counted **123** in the dry run and deleted **118**. That gap is
> expected. `verified_empty` is the completeness check — not the number.

### Dry run first

The dialog previews before it confirms: a per-table row count from the *same
function* that will do the deleting, so the number on screen cannot disagree
with what happens. The slug field stays disabled until the preview arrives —
you should not be able to type past a screen you have not been shown.

### Storage

Database first, files second. The DB purge is one transaction that either
completes or changes nothing; deleting files first would leave a live tenant
with its documents gone if that transaction then failed.

`listStoragePaths` walks each bucket recursively under `<organizationId>/`
(storage `list()` returns one level, and folders come back with a null `id`).
Failures are **reported, not thrown** — the tenant is already erased and a
storage error must not read as though the purge failed.

> **Honest limit.** Objects written before the Phase 1C storage-prefix
> migration sit at the bucket root with no organization in their path. They
> cannot be attributed to a tenant and are not deleted. `receipts` and
> `payslips` are entirely in that state.

### What survives, deliberately

`platform_audit_log`. Its `organization_id` FK is **dropped** by this migration
rather than the append-only trigger being weakened.

That trigger raises on every UPDATE and DELETE — and the FK's `ON DELETE SET
NULL` *is* an UPDATE, so deleting any organization that had ever been audited
(which is all of them; provisioning writes an audit row) aborted on the audit
table. Found by running the purge, not by reading the schema: the two
mechanisms are individually correct and only conflict at the moment of
deletion.

With the FK gone the column **keeps** the organization id after the tenant is
erased — more evidence, not less — and append-only stays absolute.

Two audit rows are written, under different actions:

| Action | Written by | Why separate |
|---|---|---|
| `organization.purged` | the RPC, inside the transaction | it is reachable with service-role credentials without the edge function |
| `organization.purge_storage` | the edge function, after commit | file cleanup happens later and can fail on its own |

Logging both under one action would double-log a single event — the trap the
entitlement history fell into.

## Verification

Proven against the live schema inside a `BEGIN … ROLLBACK` transaction, using
the `testing` organization. ARK was only read.

| # | Check | Result |
|---|---|---|
| 1 | purge ARK | refused — "protected and can never be purged" |
| 2 | no approved request | refused |
| 3 | live (trialing) tenant | refused — "archive it first" |
| 4 | another tenant's request id | refused |
| 5 | dry run | 123 rows across 39 tables, organization still present |
| 6 | purge | 118 rows, 1 pass |
| 7 | tenant gone | organizations / campuses / students / profiles all 0 |
| 8 | ARK + evidence | ARK intact, `organization.purged` audit row present |

Two defects were found by running it and fixed:

- **`ON COMMIT DROP` made the function non-re-entrant.** A dry run followed by
  a purge in the same transaction failed with "relation `_purge_targets`
  already exists" — the first table is still alive because the transaction has
  not committed. It now drops explicitly.
- **The append-only audit trigger blocked every organization delete** (above).

Gates: `src/test/security/organizationPurge.test.ts` (28 tests).
`phase9.test.ts` was updated rather than deleted — it now asserts that the
*request/review* path still deletes nothing, and that the console describes
erasure honestly.

## Deploying

The migration and the edge function must ship **together**. The console calls
`purge_organization`, which older `platform-admin` deployments do not know —
it would 400. This is the same coupling that bit Suspend.

1. apply `supabase/migrations/20261010_organization_purge.sql`
2. `npx supabase functions deploy platform-admin`
3. deploy the frontend
