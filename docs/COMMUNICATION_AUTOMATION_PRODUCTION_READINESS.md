# Communication Automation — Production Readiness

Project `vxyshcucwdbpxrhddaeh` · reference tenant **ARK Learning Arena** (`ark`) ·
second tenant **ABC Academi** (`abc-academi`) · written **2026-08-13**.

> **The scheduler is NOT running in production.** Everything below is deployed
> and dry-run verified against real data, and nothing invokes it on a schedule.
> Enabling it is a deliberate operator action — see §16.

Every claim here was executed. Where something was only read and not run, it
says so. "Inconclusive" appears where it is the truth; it is not rounded up to
a pass.

---

## 1. What the audit found

Ten findings, each verified against the live database rather than inferred.

| # | Finding | How it was established |
|---|---|---|
| A | **The daily scheduler had never enqueued a single message, ever.** | `select count(*) from message_queue where context_type in ('birthday_student','demo_reminder')` → **0**, for all time. |
| B | **Nothing invokes it.** | `cron.job` holds 6 jobs; `comms-scheduler-daily` is not among them. The `cron.schedule` call in `20260628_comms_automation.sql` is commented out. |
| C | **Its inserts could not have succeeded anyway.** `message_queue.organization_id` is `NOT NULL DEFAULT current_org_id()`; the function runs as `service_role` with no JWT, so once a second organization existed `fallback_org_id()` returned NULL. | Probed in a rolled-back transaction: `null value in column "organization_id" … violates not-null constraint`. The old `enqueue()` returned 0 on error and still reported `ok: true`. |
| D | **Ten Academics automations were switched ON with no template.** `templateFor()` returned null → `empty(eventKey, "no template")`. | `comms_templates` held 8 rows, all ABC's; none of `teacher_class_*` / `class_*` existed in `whatsappTemplates.ts` either. |
| E | **`demo_reminder` queried columns that do not exist.** It read `admission_calls.demo_date` / `.demo_time`. | `admission_calls` has `date`, `follow_up_date`, `status`. The real source is `demo_classes.scheduled_at`. |
| F | **All tenants' settings were collapsed into one `Map` keyed by `event_key`.** | Whichever organization sorted last decided whether the *other* organization's automation ran. |
| G | **The day boundary was UTC**, not the tenant's timezone — wrong for 5.5 hours a day in `Asia/Kolkata`. | A birthday greeting is a wall-clock concept; anyone born on the 1st was looked up on the last day of the previous month. |
| H | **Quiet hours and communication preference were stored but never consulted.** | The columns existed for months with no send path reading them. |
| I | **Fee-due data quality: every one of ARK's 126 pending fee rows has `due_date` NULL.** | See §9. |
| J | **Four registered events have no trigger anywhere in the codebase.** | Found by the new audit gate, not by reading. See §5. |

Two further defects were introduced by, and then found during, **this** phase —
both recorded in §12 rather than hidden, because an audit that only lists other
people's mistakes is not an audit.

---

## 2. What was changed

All changes are additive, tenant-scoped and reversible. No ARK business data was
created, modified or deleted; no ARK automation setting was changed.

| Area | Change |
|---|---|
| Scheduler | `supabase/functions/comms-scheduler/index.ts` rewritten: per-tenant pass, tenant-local dates, quiet hours, preference, deterministic idempotency, error classification, enriched dry run, caller-identity gate. |
| State model | `src/features/communication/utils/automationState.ts` — new. Capability, separate from the operator's switch. |
| CI gate | `src/test/security/automationRegistryAudit.test.ts` — new (101 assertions). |
| Comms gate | `src/test/security/commsAutomation.test.ts` — extended to 153 assertions, including the new auth gate. |
| Communication Center | `AutomationSettingsPage.tsx` rewritten around the state model, with real delivery history and a per-event dry test. |
| Health | `automationHealth.service.ts` — new. Real metrics, or `—`. |
| Org identity | `orgContext.service.ts` expanded from 7 to 15 organization variables. |
| Templates | 11 Academics templates added; `attendance_absent` variable gap fixed. |
| Tooling | `comms-dry-run.mjs`, `comms-isolation-proof.mjs`, `comms-matrix.mjs`, `comms-baseline.mjs`. |
| Migration | `20261003_phase10a_org_locality_columns.sql` — adds `organizations.city` / `.pincode`. No backfill. |

**No new communication tables were created and no second event registry
exists.** The engine remains `comms_*` + `message_queue`; the scheduler writes
rows in exactly the shape `aisensyService` writes, and the existing
`send-aisensy` drainer, retry and webhook do the rest.

---

## 3. The automation state model

`comms_automation_settings.enabled` is a boolean, and the old page rendered it
as a green switch. That boolean cannot express the difference between *"the
operator wants this on"* and *"this can actually run"* — and collapsing them is
how a school believes it is notifying parents while nothing leaves the building.

```
ACTIVE            enabled, dispatchable, provider template approved
ENABLED           enabled and dispatchable, provider template not yet ACTIVE
READY             dispatchable; the organization has it switched off
DISABLED          switched off and not fully configured
MISSING_TEMPLATE  no template body resolves            ← code defect
MISSING_RESOLVER  nothing derives the audience         ← code defect
MISSING_TRIGGER   nothing dispatches it                ← code defect
MISSING_DATA_SOURCE  the data it reads does not exist
PROVIDER_PENDING  dispatchable, but sending via the legacy provider campaign
BLOCKED           structurally impossible until something is built
ERROR             last run failed
```

`diagnoseAutomation()` is pure and synchronous — no service imports, no I/O — so
the UI, the CI gate and the generated matrix call it on the same inputs and
**cannot disagree**. The derived flag `misleading` (`enabled && !dispatchable`)
is the one the Communication Center counts at the top of the page.

---

## 4. Registry audit gate

`src/test/security/automationRegistryAudit.test.ts` fails the build on:

- a registered event with no template, no resolver, or no trigger;
- a declared trigger whose named file no longer references the event key
  (it greps the file — a renamed dispatch call breaks the build);
- `RESOLVER_EVENTS` drifting from the real registry in `automationResolvers.ts`;
- `KNOWN_UNTRIGGERED` not being *exactly* the untriggered set — **both
  directions**, so an event that gains a trigger must be removed from the list
  rather than accumulating as a stale excuse;
- an enabled automation that cannot dispatch — read from the live
  `COMMS_BASELINE.json`, so it tracks production rather than an assumption;
- the published matrix disagreeing with the registry.

The declarations in `automationState.ts` are hand-maintained. This gate is what
makes that safe.

---

## 5. The four untriggered events

Found by the gate, not by reading. Each is registered, has a template, and
appears in the Communication Center as something a school can switch on — and
nothing anywhere dispatches it.

| Event | Why |
|---|---|
| `attendance_present` | Submit Attendance dispatches only `attendance_absent` and `attendance_corrected`. |
| `live_class_created` | A resolver exists (`resolveLiveClass`); no live-class creation path dispatches. |
| `admission_completed` | The admission flow completes without dispatching. Lead CRM sends its own `lead_admission_completed_v2` on a separate path. |
| `class_cancelled` | Superseded by `class_cancelled_students`. The key remains with no caller. |

**ARK has `admission_completed` switched ON.** Changing a live tenant's
automation settings is out of scope for this phase, so the remedy is that the
Communication Center now renders it as *Not configured — no trigger* in red,
with the reason on the row. The gate asserts this is detected; it does not
silently pass it.

---

## 6. Two BLOCKED events

Neither is a gap to be closed with a plausible guess.

- **`holiday_notice`** — there is **no `holidays` table**. Nothing in the
  database defines which date is a holiday. Hardcoding a festival list, or
  treating a day with no classes as a holiday, would send confident, wrong
  messages to every parent in the school. The scheduler *throws* here
  (`BLOCKED: no holidays table exists…`) rather than resolving to a silent zero,
  so a dry run reports it as a `CONFIGURATION_ERROR` instead of "0 due".
- **`certificate_ready`** — certificate pages are `localStorage`-backed
  (`ModuleStarterPage`, storageKey `"certificates"`). No server-side certificate
  row exists to trigger from.

---

## 7. Tenant-aware scheduler architecture

One explicit pass **per organization**. Every query filters on that
organization's id; every inserted row carries it explicitly; the tenant's own
timezone decides what "today" means.

```
for each organization with status in (active, trialing, past_due):
    tz      = organizations.timezone  (default Asia/Kolkata)
    today   = local date in tz                     ← not toISOString()
    settings = comms_automation_settings WHERE organization_id = org.id
    orgVars  = 15 variables from organizations + organization_branding
    for each enabled scheduled event:
        drafts  = resolve(event, org)              ← scoped to org.id
        drafts  = drafts filtered by communication_preference
        drafts  = drafts minus already-queued-today  (org-scoped dedupe)
        render(body, vars) → skip with a STRUCTURED reason if any var is missing
        insert message_queue rows carrying organization_id explicitly
```

**Per-organization failure isolation**: one tenant's failure never stops the
others. A thrown error used to abort the whole run, so a single malformed
setting row could silence every school on the platform. Failures are counted
into `organizationsFailed`, and `ok` is `failedOrgs === 0 && eventErrors === 0`.

---

## 8. Idempotency

```
key = (organization_id, context_type, context_id)
context_id = <entity uuid>:<tenant-local ISO date>
```

`organization_id` is the row's own column, so one tenant's send can never
suppress another's. The **tenant-local** date is part of the key rather than
left to a `created_at::date` filter, because those two disagree for 5.5 hours a
day in `Asia/Kolkata`: a run at 02:00 IST and one at 08:00 IST are the same
local day but different UTC days, and would each send.

A **failed** dedupe lookup fails the event rather than being read as "nothing
sent yet" — the latter would re-message every parent on the next run.

Verified live: `be6787c2-…:2026-01-06`, `651afb4b-…:2026-09-25`.

---

## 9. Fee-due data quality — `MISSING_DUE_DATE`

All **126** of ARK's pending fee rows have `due_date` NULL. The fee-due template
says *"due on {{due_date}}"*, so there are three options: invent a date, send
"due on ", or skip truthfully. The scheduler skips, with a **structured** code:

```
fee_due   candidates 126   eligible 126   wouldQueue 0
          MISSING_DUE_DATE × 126
```

The reason is a code, not prose, because the Communication Center groups by it:
`MISSING_DUE_DATE × 126` is a fixable afternoon's work, whereas 126 lines of
prose is noise.

**No ARK row was modified.** Populating `due_date` is a business decision about
what those dates actually are — not something to derive from a fee structure and
hope.

---

## 10. Error classification

Every failure lands in one bucket, attached to the organization and event it
belongs to, and never changes the response into a false success.

`VALIDATION_ERROR` · `TENANT_CONTEXT_ERROR` · `TEMPLATE_ERROR` ·
`RECIPIENT_ERROR` · `PROVIDER_ERROR` · `DATABASE_ERROR` ·
`CONFIGURATION_ERROR` · `RATE_LIMIT` · `UNKNOWN`

Classification is deliberately conservative: anything unrecognised stays
`UNKNOWN` rather than being filed under a plausible-looking category. A misfiled
error is harder to debug than an unfiled one.

Observed live during this phase:
`DATABASE_ERROR — demo_classes: column leads_1.name does not exist` (§12),
`CONFIGURATION_ERROR — BLOCKED: no holidays table exists`.

---

## 11. Security: the caller-identity gate

**Found while wiring the Communication Center's dry test.** The function queries
as `service_role` (RLS bypassed) and took its target tenant from
`organizationId` **in the request body**, while the gateway accepted the anon
key — which is compiled into the shipped frontend bundle.

Two live consequences: an authenticated ABC admin could post ARK's organization
id and read ARK parents' names out of the dry-run output; and the leak was not
even limited to customers, because anyone with the public bundle holds that key.

Now:

| Caller | May do |
|---|---|
| Service role key (cron, operator tooling) | Anything, any tenant |
| Signed-in user | **Dry run of their own organization only** |
| Anonymous / publishable key | **Nothing — HTTP 401** |

The tenant is resolved by `resolveCaller()` from `_shared/auth.ts`, which
verifies the token against GoTrue and derives the organization from
`organization_users` membership. A body-supplied id may only *agree* with it —
a mismatch is a 403, not a silent correction. A user token can never start a
live run.

The first implementation of this gate decoded the JWT payload locally with
`atob`. The **Phase 0 S6 gate caught it and failed the build** — correctly: that
would put the safety in `config.toml` rather than in the code. The gate was not
weakened; the code was fixed.

Verified live: anon → **HTTP 401**; service role → **HTTP 200**.

---

## 12. Defects introduced and fixed during this phase

- **`leads.name` does not exist.** My rewritten `demo_reminder` embedded
  `leads!inner(id, name, phone, …)`. The table has `student_name` /
  `parent_name`. PostgREST 42703s the whole embed, so the event failed outright
  — which the dry run surfaced as a `DATABASE_ERROR` rather than as "0 due".
  Fixed, and the message now greets the parent where one is recorded.
- **A UTC window applied to a tenant-local day.** The same resolver asked for
  `>= tomorrowT00:00:00Z`, which in `Asia/Kolkata` selects 05:30 tomorrow
  through 05:30 the day after — reminding some parents a day early and missing
  early-morning demos entirely. Now the fetch is deliberately wider and the day
  is narrowed in TypeScript by the tenant's local date.

Both were found by *running* the thing, not by reading it. That is the argument
for the dry run being part of the deliverable rather than a debugging aid.

---

## 13. Verification performed

### Dry runs (nothing written, nothing sent)

```
ark          fee_due          candidates 126  eligible 126  wouldQueue 0  MISSING_DUE_DATE × 126
             birthday_student candidates 0
             exam_scheduled   candidates 0
             task_due         candidates 0
             demo_reminder    candidates 0
abc-academi  fee_due          candidates 3    eligible 1    wouldQueue 0  MISSING_DUE_DATE × 1
                              (2 skipped: no phone number)
```

Forced to a date on which each tenant genuinely has a birthday, so a message
actually renders:

```
ark          2026-01-06  →  "Wishing Viday Vinayak C a very happy birthday! 🎂 … — Team ARK Learning Arena"
abc-academi  2026-09-25  →  "Wishing Abishek a very happy birthday! 🎂 … — Team ABC Academi"
```

### Multi-tenant isolation proof — 17/17

`node scripts/comms-isolation-proof.mjs` → `docs/generated/COMMS_ISOLATION_PROOF.json`

- the anon key is refused (HTTP 401);
- a run scoped to one tenant returns exactly that tenant;
- `fee_due` resolves 126 for ARK and 3 for ABC — each matching that tenant's own
  `student_fees` count, and differing from each other;
- ARK's rendered body carries **ARK Learning Arena** and **not** ABC Academi;
  ABC's carries **ABC Academi** and **not** ARK — in both directions;
- no unsubstituted `{{variable}}` reaches a recipient;
- idempotency keys carry the tenant-local date;
- `message_queue` count unchanged across a dry run (354 → 354).

### Test suite

`1826 passed` before this phase's additions; `automationRegistryAudit` 101
assertions and `commsAutomation` 153 assertions pass. `npm run build` succeeds.
`npm run lint` reports 15 errors, **all pre-existing and in unrelated files**
(estudy, fee comms, finance, help, reports, settings) — none in any file touched
here.

### Baselines

```
node scripts/comms-baseline.mjs --compare
  PASS — no row lost, and no automation setting changed, in any organization.

node scripts/ark-baseline.mjs --compare
  teacher_attendance: 30 → 31  (+1, normal activity)
  PASS — no ARK row was lost, and no ARK entitlement or plan changed.
```

---

## 14. Communication Center

`/admin/communication/automation`. Per automation: state badge with the reason
on hover, provider status, channel, timing, template key, quiet hours, priority,
last run, last success, last failure with the provider's own error text,
recipients / delivered / failed over 30 days, the enable switch, and **Dry test**.

Two rules the page keeps:

- **A metric with no rows behind it renders `—`, never `0`.** "Sent 0" and
  "never ran" call for opposite responses from an operator, and conflating them
  is how a school concludes its parents were notified. A failed history read
  also returns "no data", not zeros.
- **Never a green state for something that cannot send.** The badge tone comes
  from capability. An automation switched ON but undispatchable shows red, says
  so in words on the row, and is counted at the top of the page.

**Dry test** calls the deployed scheduler with `dryRun: true` for that one
event, scoped by the server to the caller's own organization, and shows
candidates / eligible / would-send, the skip breakdown, the structured missing-
data codes, and the rendered sample message.

The manual **Send** pages are unchanged and remain the exception/override path:
they are operator-initiated, one-off, and audited separately from automation.

---

## 15. What is NOT done

Stated plainly rather than left for someone to discover.

1. **The production cron is not enabled.** See §16.
2. **`fee_due` would send 0 messages today** — all 126 ARK rows lack `due_date`.
   Populating those dates is a business decision, not a code change.
3. **`holiday_notice` and `certificate_ready` remain BLOCKED.** No fake data was
   created to unblock them.
4. **Four events remain untriggered** (§5). Wiring them is a separate change.
5. **Provider templates are not ACTIVE.** The organization-neutral `smartark_*`
   templates are not submitted or approved at Meta, so events showing
   `PROVIDER_PENDING` still send through the legacy campaigns, whose bodies
   carry the original tenant's sign-off. Nothing was auto-marked ACTIVE.
6. **`fee_paid` was deliberately not migrated** into the central dispatcher. It
   is a working legacy automation and was left alone.
7. **No live WhatsApp message was sent during this phase.** Everything is
   dry-run evidence. The end-to-end provider path is therefore **inconclusive**,
   not passed — it can only be established by one controlled live send.

---

## 16. Enabling the scheduler — the operator's decision

Do **not** run this until the items in §15 you care about are resolved.
It starts real WhatsApp traffic to real parents.

**Step 1 — one controlled live run, one tenant, one event, watched.**

```bash
# From the project root, with the service role key in the environment only.
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/comms-dry-run.mjs --org=ark --events=birthday_student
```

Read the breakdown. If `wouldQueue` is larger than you are willing to send by
hand, stop and narrow it first.

**Step 2 — schedule it.** In the Supabase SQL editor:

```sql
select cron.schedule(
  'comms-scheduler-daily',
  '30 3 * * *',                       -- 09:00 Asia/Kolkata; pg_cron runs in UTC
  $$
  select net.http_post(
    url     := 'https://vxyshcucwdbpxrhddaeh.supabase.co/functions/v1/comms-scheduler',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
               ),
    body    := '{}'::jsonb
  );
  $$
);
```

The service role key must reach the job without being written into the job
definition in plain text — set it once as a database setting held outside
`cron.job`, or use Supabase Vault, and confirm it resolves before scheduling.

**Step 3 — confirm and watch.**

```sql
select jobname, schedule, active from cron.job where jobname = 'comms-scheduler-daily';
select context_type, status, count(*) from public.message_queue
 where created_at > now() - interval '1 day' group by 1, 2 order by 1;
```

**To stop it:** `select cron.unschedule('comms-scheduler-daily');`

---

## 17. Rollback

| To undo | How |
|---|---|
| The scheduler | Redeploy the previous function revision from the Supabase dashboard. It writes nothing new until invoked, and nothing invokes it. |
| The locality columns | `supabase/rollback/20261003_phase10a_org_locality_columns_rollback.sql` — drops only if every value is NULL. |
| The UI | Revert `AutomationSettingsPage.tsx`; nothing else depends on the new components. |
| Anything queued | Nothing was queued. `message_queue` is unchanged at 354 rows. |

No migration in this phase writes to a business table, and none backfills.

---

## 18. Commands

```bash
# Dry run — resolve, render, report. Writes nothing, sends nothing.
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/comms-dry-run.mjs --org=ark
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/comms-dry-run.mjs --org=ark --events=fee_due --date=2026-09-01

# Multi-tenant isolation proof (17 assertions, dry run only)
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/comms-isolation-proof.mjs

# Configuration baselines
node scripts/comms-baseline.mjs             # capture
node scripts/comms-baseline.mjs --compare   # diff, exit 1 on loss
node scripts/ark-baseline.mjs --compare

# Documentation and template drift
node scripts/comms-matrix.mjs               # regenerate the matrix
node scripts/comms-matrix.mjs --check       # fail if stale
node scripts/sync-comms-templates.mjs       # regenerate the Deno template mirror
node scripts/sync-comms-templates.mjs --check

# Gates
npm test && npm run build && npm run lint
```

Related: [`COMMUNICATION_AUTOMATION_FINAL_MATRIX.md`](./COMMUNICATION_AUTOMATION_FINAL_MATRIX.md) ·
[`AISENSY_MULTITENANT_TEMPLATE_CATALOG.md`](./AISENSY_MULTITENANT_TEMPLATE_CATALOG.md) ·
[`AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md`](./AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md)
