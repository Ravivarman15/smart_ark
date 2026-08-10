# Communication Center — Enterprise Automation

Status: **Phases A–E implemented.**

| Phase | State |
|---|---|
| A — audit | Complete (§1) |
| B — resolver architecture | Complete — `dispatch(event, { entityId })` |
| C — resolvers + triggers | 12 of 32 events fully automatic (§7) |
| D — Communication Center | Built at `/management/communication` (§8) |
| E — multi-tenant templates | Family created, **awaiting Meta approval** (§9) |

See `COMMUNICATION_AUTOMATION_MATRIX.md` for the per-event table and
`AISENSY_MULTITENANT_TEMPLATE_SUBMISSION.md` for the copy-paste submission.

This document is written to be read by someone deciding what to build next, so
it leads with what already exists — because the single most expensive mistake
available here is rebuilding an engine that is already correct.

---

## 1. Phase A — audit of the existing engine

The brief asked for an inspection before any code. Here is what is actually in
the repository.

### 1.1 What exists and is sound (REUSE — do not rebuild)

| Piece | Location | Verdict |
|---|---|---|
| **Event registry** | `communication/constants/automationEvents.ts` | **33 events**, each with category, default template, channel, timing, kind, default-enabled. Already the canonical list the settings page renders from. This is the "registry → UI" the brief asks for; it exists. |
| **Dispatcher** | `communication/services/commsDispatcher.service.ts` | Orchestrates: settings gate → dedupe → quiet hours → channel resolve → render → enqueue → audit. Never throws into the caller's business mutation. |
| **Automation rules** | `communication/utils/automationRules.ts` | `shouldDispatch`, `resolveChannels`, `isWithinQuietHours`, `partitionDuplicates`. |
| **Batch builder** | `communication/utils/commsAutomation.ts` | Pure. Resolve → render → validate per recipient; a bad row is counted and skipped, the batch continues. |
| **Recipient resolvers** | `communication/services/commsRecipients.service.ts` | 6: `students`, `absentToday`, `birthdaysOn`, `staff`, `inquiries`, `studentsWithFeeStatus`. |
| **Queue + provider** | `aisensy.service.ts` → `message_queue` → `send-aisensy` | One queue, one provider path. |
| **Tables** | `comms_templates`, `comms_automation_settings`, `comms_audit`, `comms_campaigns`, `comms_campaign_recipients`, `message_queue` | Sufficient. **No new communication tables are required.** |
| **Supporting services** | timeline, analytics, health, audit, templates, campaigns | Present and wired. |

**Conclusion: there is no need for a second engine, a second queue, or new
communication tables.** The gap is not the engine — it is what the engine is
given.

### 1.2 The real gaps

**Gap 1 — organization identity did not exist. (FIXED, see §2.)**

`{{org_name}}` was not a supported variable anywhere. Instead:

- 5 canonical templates ended `"Thank you,\nARK Learning Arena"`
- `attendanceWhatsapp.service.ts` held `const ORG_NAME = "ARK Learning Arena"`,
  used for both the AiSensy sender name and the rendered variables
- `leadWhatsappTemplates.ts` named ARK in 5 lead/demo messages
- `payrollNotify.service.ts` signed 3 staff messages with it
- `feeReceiptDelivery.service.ts` had its own `ORG_NAME` constant
- 6 pages hardcoded `thearktuition.com` URLs

Absence alerts are the highest-volume automation in the product. With a second
organization now live, the first alert ABC Academi sends tells a parent
*"Thank you, ARK Learning Arena"* — a competitor's name, over WhatsApp, from a
number that parent trusts. Nothing throws, nothing logs.

**Gap 2 — the dispatcher cannot resolve its own recipients or variables.**

```ts
export interface DispatchContext {
  recipients: RecipientCandidate[];   // caller must resolve
  resolve?: VariableResolver;         // caller must resolve
}
```

Every trigger site supplies both. That is precisely why "Send Upcoming Exam"
asks an administrator to pick students and type `exam_name`, `exam_date`,
`exam_time`, `venue` by hand. The engine is capable; nothing gives it the data.

**The fix is a resolver layer, not a new engine** — see §3.

**Gap 3 — only 10 trigger sites are wired.**

Wired today: `exam_published`, `payroll_approved`, 5 allocation/class events,
plus the two scheduled jobs (`birthday_student`, `fee_due`).

Not wired to their business action: `exam_scheduled`, `fee_paid`,
`attendance_present`, `student_credentials`, `staff_credentials`,
`certificate_ready`, `holiday_notice`, `task_assigned`, `task_due`,
`demo_scheduled`, `demo_reminder`, `admission_completed`.

**Gap 4 — missing capabilities**

- No recipient resolver by class/batch (needed for exam reminders)
- No family grouping — a parent with three children gets three messages
- Dedupe key is `(context_type, context_id, today)`; no template version, no
  explicit organization column (RLS scopes it implicitly)
- Per-event scheduling offsets ("24 h before") are not modelled
- Quiet-hours deferral exists but only for immediate events

---

## 2. Phase E — organization identity (IMPLEMENTED)

### 2.1 What was built

`communication/services/orgContext.service.ts` resolves a variable bag from
`organizations` + `organization_branding`, cached per session:

| Variable | Source | Fallback chain |
|---|---|---|
| `{{org_name}}` | `organizations.display_name` | `branding.app_name` → `legal_name` → `slug` |
| `{{org_short_name}}` | `branding.portal_name` | `slug` → org name |
| `{{org_legal_name}}` | `organizations.legal_name` | org name |
| `{{org_phone}}` | `branding.support_phone` | `""` |
| `{{org_email}}` | `branding.support_email` | `""` |
| `{{org_website}}` | `branding.website_url` | `""` |
| `{{org_address}}` | `branding.support_address` | `""` |

No `organization_id` is passed. `current_org_id()` in RLS already filters both
tables; passing an id would be a second, weaker check that could disagree.

**A missing name renders blank, never a fallback tenant.** A bare sign-off is
acceptable; another institution's name is not.

### 2.2 How it reaches the message

`buildAutomatedBatch` gained an `orgVars` input, merged **first** in
`resolveVars` so a per-recipient resolver can still override a single field
(a branch with its own phone number) while nothing has to remember to supply
`{{org_name}}`.

The dispatcher resolves it **once per dispatch**, not once per recipient, and
passes the same bag to both the WhatsApp batch and the email path — so a
message and its email twin cannot disagree about who sent them.

`useOrgCommsVars()` exposes the same values to React for the synchronous call
sites (`perRecipientDefaults` closures, report subtitles).

### 2.3 Verified against live data

```
organization            {{org_name}} resolves to
ARK Learning Arena  →   ARK Learning Arena
ABC Academi         →   ABC Academi
```

Unit tests render one shared canonical template for two organizations and
assert the two bodies differ and each carries its own name.

### 2.4 What is still branded (tracked, not fixed)

The **document** surface has the same defect and a larger footprint:

- `components/ReceiptGenerator.tsx` — fee receipt header, footer, thank-you
- `features/fee/components/FeeReceiptDialog.tsx`
- `features/exams/services/reportCard.service.ts`, `resultSheet.service.ts`
- `features/payroll/components/SalarySlip.tsx`, `pages/SalaryRegisterPage.tsx`
- `features/students/services/student360.service.ts`
- `features/parent-portal/pages/ParentFeesPage.tsx`, `ParentReportsPage.tsx`
- `features/leads/utils/leadExport.ts`
- `features/enquiries/pages/PublicAdmissionFormPage.tsx`
- `features/leads/pages/PublicLeadFormPage.tsx`
- `pages/admin/StudentControl.tsx`
- `lib/aisensyApi.ts` (default `userName`)

Deliberately out of this pass and **not** folded into the gate: a message
reaches a stranger unprompted; a PDF is generated by staff who can see what it
says. Both matter — the messages were the bleeding edge.

The two public forms (`PublicLeadFormPage`, `PublicAdmissionFormPage`) are the
most urgent of these: they are unauthenticated pages a prospect of *any* tenant
can reach.

---

## 3. Phases B–D, F–L — specification

### 3.1 Phase B/C — central resolution (the core change)

Extend `DispatchContext` so a trigger site can pass an **entity** instead of a
recipient list:

```ts
dispatch("exam_scheduled", { entityId: examId });
```

New `commsResolvers.service.ts` maps `eventKey → (entityId) => { recipients, resolve }`
using the **existing** recipients service and ERP tables. The dispatcher falls
back to `ctx.recipients` when a resolver is not registered, so every current
call site keeps working unchanged.

### 3.2 Phase D — variable resolution

`resolveTemplateVariables({ eventKey, entityId, recipient })`, composed from
existing services (`examService`, `feeService`, `attendanceService`). Registry
entry declares `requiredVariables`; pre-flight reports any it cannot resolve
rather than sending a message with a hole in it.

### 3.3 Phase F — event wiring

12 unwired events, each a one-line `dispatch()` in the mutation that already
exists. Cheap once §3.1 lands.

### 3.4 Phase G–J — Communication Center at `/management/communication`

Ten sections per the brief. The Automation tab renders `AUTOMATION_EVENTS`
directly, so a new registry entry appears with no UI change — the auto-discovery
requirement is satisfied by the registry that already exists.

### 3.5 Phase K — family grouping

`parent_student_links` already models the relationship. Consolidated-vs-per-child
becomes a per-template flag.

### 3.6 Phase L — isolation tests

`comms_*` and `message_queue` are already `organization_id`-scoped under RLS;
the tests assert it end to end rather than introducing new policy.

---

## 4. Migration plan

**None required for Phase E.** No schema change, no new table, no data touched.
Later phases need at most:

- `comms_automation_settings`: `ADD COLUMN IF NOT EXISTS offset_minutes int`
- `comms_templates`: `ADD COLUMN IF NOT EXISTS consolidate_by_parent boolean DEFAULT false`

Both additive, idempotent, backward compatible.

---

## 5. Rollback

Phase E is code-only. Reverting `orgContext.service.ts`, the `orgVars`
parameter and the template bodies restores previous behaviour exactly — which
is why the templates were edited in place rather than versioned.

---

## 6. Gates

`features/communication/testing/orgBranding.test.ts` — 9 tests:

- no canonical template contains a tenant name
- ≥5 templates sign off with `{{org_name}}`
- attendance automation resolves the org rather than holding a constant
- no message-producing module embeds a tenant name or domain (scoped to
  `communication`, `attendance/automation`, lead templates and services,
  `payrollNotify`, `feeReceiptDelivery`, `auth-accounts`)
- the path list matches >20 files, so a renamed directory cannot empty the
  sweep and pass vacuously
- one template renders two different sign-offs for two organizations
- a per-recipient resolver can still override an org field
- a missing org name degrades to blank, never to a fallback tenant


---

## 7. Phase C — resolvers and triggers

`automationResolvers.ts` maps an event to `{ recipients, variablesByRecipient }`.
The dispatcher calls it **only when the caller supplies no recipients**, so every
pre-existing call site is unchanged.

**12 events resolve with zero operator input:** attendance absent/corrected,
birthday, fee due, exam scheduled/published, task assigned/due, live class
created/cancelled, staff/student credentials.

### 7.1 Trigger-bound credentials (C2)

The password is generated in memory at account creation and **never persisted**.
A resolver running later cannot re-derive it — attempting to would mean storing
plaintext or regenerating (a breach, or a lockout). So it arrives via
`triggerData`, is used once for rendering, and:

- never reaches `comms_audit` (the payload carries counts only)
- is **redacted from `message_queue.payload` once the message is sent**, along
  with `__body`, which contains the password in plain sight

`message_queue` is readable by every staff member with comms access; a password
sitting there after delivery is a standing breach. Redaction failure is logged
and never turns a successful send into an error.

### 7.2 Family grouping (C9)

`familyGrouping.ts` collapses siblings sharing a parent number into one message,
**per event**. Attendance groups; exam results, fees and credentials do not —
merging those is ambiguous at best and leaks one child's data into another's
context at worst.

Phone matching normalises to the last 10 digits, because the same parent's
number is stored three different ways across imports and without that the
grouping silently does nothing on real data.

### 7.3 Communication preference (C11)

`communicationPreference.ts` existed, was unit-tested, and was called by **no
send path** — a parent set to `NONE` was messaged anyway. Now enforced once in
the dispatcher. An *unset* preference stays unrestricted: most of the roster
predates the column and treating blank as blocked would switch off every
automation.

---

## 8. Phase D — Communication Center

Route `/management/communication`, registered in the RBAC catalog, menu config
and `sharedRoutes` as `whatsapp.center`.

**Registry-driven.** Every card derives from `AUTOMATION_EVENTS`; categories
from `AUTOMATION_CATEGORIES`; "fully automatic" from the resolver registry's own
key list. A gate asserts **no event key appears literally in the page** and no
`switch`/`===` branches on one — so a new registry entry renders with no UI
change. Mutation-tested: adding one `if (e.key === "attendance_absent")` fails
two gates.

A metric with no source renders as **—**, never 0: "0 delivered" and "we could
not read the count" are different facts.

The Templates tab shows the campaign **actually posted today** — pre-cutover that
is the legacy ARK campaign, and saying so is the point.

---

## 9. Phase E — multi-tenant templates

### 9.1 The correction that drove this

`send-aisensy` posts `{ campaignName, templateParams }`. **Meta renders its own
approved body.** The body in this repository never reaches WhatsApp for a
template with a positional spec.

So adding `{{org_name}}` to `attendance_absent` fixed the email, the queue
payload and the preview — and changed **nothing** about the WhatsApp message,
which still carries ARK's name from the approved template at Meta.

Templates *without* a positional spec send the whole rendered body as `{{1}}`
(`exam_reminder`, `birthday_wish`, `fee_due_reminder`, `exam_result`) — those
genuinely carry `{{org_name}}` to the parent today and need no re-approval.

### 9.2 Controlled rollout

```
READY_FOR_SUBMISSION → SUBMITTED → APPROVED → (test verified) → ACTIVE
```

`resolveCampaign()` returns the **legacy** campaign for every status except
`ACTIVE`, wired at the single point where the queue row's campaign is chosen.
Submitting and even approving changes nothing in production; cutover is one
status edit, and rollback is the same edit reversed.

`org_name` is **appended last** in every parameter list, so the existing
positional order is preserved verbatim.

### 9.3 Deployment

The Deno mirror in `send-aisensy` must be deployed for the new campaigns to
send correctly:

```
npx supabase functions deploy send-aisensy
```

A gate asserts the app and the mirror declare the **same parameter count** for
every campaign — a mismatch means Meta rejects the send at runtime, silently.

---

## 10. Remaining gaps

- **8 events not automatable** — each names its exact blocker in the matrix.
  `certificates` and `holidays` tables do not exist (verified against the live
  database); `admission_completed` needs a trigger seam; `demo_*` belong to Lead
  CRM and are deliberately untouched.
- **`fee_paid` is not migrated**, by instruction. `feeReceiptDelivery.service`
  remains its execution path. Its campaign is in the submission batch so it can
  be approved ahead of any future migration.
- **The document surface still carries ARK branding** — receipts, report cards,
  salary slips, student-360 exports, and the two public forms. Listed in §2.4.
- **No Communication Center analytics beyond the queue counters.** Per-template
  delivery rates and failure breakdowns need the analytics service extended.
