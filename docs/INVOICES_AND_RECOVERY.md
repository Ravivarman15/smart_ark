# Invoices & Disaster Recovery

Two platform-console pages that were reserved placeholders. Both said something
true and then could not act on it.

---

## Invoices

### The blurb was stale, not the feature

The page read: *"the `invoices` and `invoice_lines` tables exist with full RLS so
Phase 5 is additive, but nothing writes them yet."*

Phase 5 shipped. The live database already has:

| | |
|---|---|
| `next_invoice_number(org, date)` | Gapless counter — one row per (org, financial year), `ON CONFLICT DO UPDATE` under a row lock |
| `compute_gst(org, taxable, rate)` | CGST+SGST vs IGST vs export / SEZ / reverse charge, decided by **state code** |
| `issue_invoice(...)` | Draws the number, writes invoice + line, audits |
| `invoice_sequences` | The counter, with no tenant-facing policy at all |
| Razorpay webhook | Issues on capture |

What never existed was anywhere to **look at the result** — which is why the
page went on describing the tables as unwritten long after they were being
written. This builds that.

### The console proves the sequence

Gapless numbering is a GST requirement, guaranteed by construction — but only
for numbers drawn through `issue_invoice()`. Three things break it silently:

- a row inserted by hand,
- a number edited,
- a restore that replayed the invoices but not the counter.

An auditor finding the gap first is the expensive way to learn about any of
them. So `checkInvoiceIntegrity()` recomputes the check on every page load and
reports five distinct failures — gap, duplicate, numbered-past-counter,
unparseable, and a series with no counter at all (the worst: the next issuance
restarts at 0001 and collides).

Two rules inside it are easy to get backwards:

- **A voided invoice counts as issued.** Voiding is the correct way to cancel
  precisely *because* the number stays. Treating it as a gap would flag the
  compliant procedure as a violation and push an operator toward deleting,
  which is what actually breaks the law.
- **Drafts are ignored.** They have no number yet by design, so counting them
  would manufacture a gap out of correct behaviour.

### What the page will not do

No form that accepts a number. No delete. Numbers come from the database or not
at all, and the correction for a wrong invoice is **void + reissue**, leaving
both numbers in the series where GST needs them.

`Mark paid` records a receipt; it does not collect money. The page says so.

### The PDF (Phase 5 carry-over #1)

`invoices.pdf_path` existed, the tenant's Billing page rendered a Download
button only when it was populated, and nothing ever populated it — so the
button was permanently invisible and customers had no way to obtain the
document they need for input tax credit.

The PDF is now **drawn with jsPDF text primitives, not rasterised**. Receipts
and payslips go through html2canvas because they mirror an on-screen component;
an invoice must not. It is filed by a customer, read by an accountant and may
be parsed by a portal, so the amounts, the GSTIN and the invoice number have to
be selectable text. It is also ~40 KB instead of the ~4.8 MB that stopped
emailed receipts sending at all.

**One renderer, one fetch path, two audiences.** The console holds the full row
and could render from memory; it deliberately does not. The tenant's billing
summary carries a *reduced* invoice shape with none of the GST detail, so
rendering from whatever each caller happened to have would produce two
different documents under one invoice number — and the customer's copy
disagreeing with ours is the failure that costs money. Both pass an id to
`invoiceDownloadService.download()`.

Nothing is uploaded. No bucket, no signed URL, no stored copy that can drift
from the record. `pdf_path` stays on the table for a provider-hosted copy.

Amounts are spelled in **lakh and crore**. "One hundred thousand" on an Indian
tax invoice is wrong.

---

## Backups & Disaster Recovery

### What it still will not do

There is no "Back up now" button. Backups and PITR are managed by Supabase at
the project level and are not controllable from SQL; a button that appeared to
take a backup and did nothing would be worse than the honest absence.

### Prose does not know what month it is

The page stated a standard — *a restore that has not been tested is not a
backup*, verify PITR monthly, RPO 5 min, RTO 4 h — and nothing recorded whether
a rehearsal had ever happened. The platform could be eleven months out of
compliance with its own printed standard and the page would look identical.

| Now | |
|---|---|
| **Policy** | RPO, RTO, PITR window, rehearsal interval, export retention — stored and editable, defaulting to the values the page used to hardcode |
| **Register** | Every rehearsal: who, when, restored-to, outcome, minutes. Append-only from the screen |
| **Posture** | `recoveryPosture()` computes verified / due soon / overdue / **failing** |
| **RTO** | Reported from the worst *measured* restore alongside the target, not the target alone |

Three rules that carry the weight:

- **A failed rehearsal is its own level.** Folding it into "overdue" would
  describe a scheduling slip and an outage-in-waiting in the same words. The
  second is the finding the whole ritual exists to produce.
- **A failure does not reset the clock.** Compliance dates from the last
  rehearsal that actually worked.
- **Untimed is not "within target".** A rehearsal with no duration is reported
  as unmeasured, never as a pass.

Policy and register live in `platform_settings`. A dozen records a year did not
justify a table, and a table would have shipped as an unapplied migration —
i.e. a register that did not work. The append is a read-modify-write on a jsonb
array and is *not* concurrency-safe; that is written down in the service,
because a monthly single-operator ritual is exactly where that trade is
acceptable and nowhere else.

### Per-organization export

`supabase/migrations/20261011_organization_export.sql` — **applied live
2026-08-19**, with `platform-admin` redeployed alongside it (v7). The 501 path
remains in the edge function for any project where it has not been applied.

- **Same predicate as the purge**: every BASE TABLE in `public` carrying
  `organization_id`. Not a curated list. Drift there would be asymmetric and
  silent — export would omit a table that purge still erases, so a customer's
  "complete" export would be missing records that were then destroyed.
- **Read-only by construction**: `SECURITY DEFINER` *and* `STABLE`, so Postgres
  itself rejects any write executed inside it.
- **Unreachable by a tenant**: `CREATE FUNCTION` grants EXECUTE to PUBLIC by
  default. That is revoked, along with anon and authenticated; only
  `service_role` is granted, so the sole path is the edge function.
- **Owner-gated and audited**: `organizations.purge`, the same bar as erasure —
  every row of a tenant in one file is the same disclosure that erasing them is
  a destruction. The manifest preview is audited too; it is reconnaissance for
  the real thing.

Two operational uses justify it: a departing customer owed their records before
the tenant is archived, and a restore rehearsal — a PITR restore you cannot
compare against a known snapshot has not been verified, only performed.

Verified after applying:

| Check | Result |
|---|---|
| Both functions | `STABLE` + `SECURITY DEFINER` |
| ACL | `postgres \| service_role` — no PUBLIC, anon or authenticated |
| Anon RPC call | `42501 permission denied for function` |
| Edge function, no auth | `401` |
| Edge function, tenant JWT | `403 Platform access denied` |
| Manifest, live | abc-academi 793 rows / 83 tables; testing 180 / 53 |

**Do not run `supabase db push` on this project.** `20261001`–`20261011` all
report unapplied while their objects demonstrably exist live, so push would
re-run eleven migrations, several of them not idempotent. Apply one file at a
time with `db query --linked --file`.

---

## Gates

`src/features/platform/testing/billingAndRecovery.test.ts` — 36 tests.

Pure functions carry the load because the interesting cases (a gap, a failed
restore, eleven months of silence) are the ones nobody can conveniently
reproduce against a real system. The build gates then pin: invoices are never
inserted or deleted from the client; a status write proves it happened; the
export migration keeps its REVOKEs and its shared predicate; the export action
stays owner-gated; the PDF stays vector; both audiences render through one path.

### Two existing gates were corrected, not weakened

Both fired on *correct* code, and in each case the check was made more faithful
to its own claim:

- **`phase1e`** flagged a doc comment that explained why a call site avoids a
  named upsert. A gate that cannot tell code from the note about the code
  punishes documenting the decision, and the fix people reach for is deleting
  the explanation. It now strips comments before scanning.
- **`phase2`** counted only `if (!data?.length)`. An update-then-insert
  inspects both writes — the update's zero-row case falls through to the
  insert, the insert's throws — and the old name-matching regex read that
  correct shape as two unguarded writes. It now accepts a named result. The
  assertion strength is unchanged, and the mutation test confirms it still
  fails when a guard is removed.
