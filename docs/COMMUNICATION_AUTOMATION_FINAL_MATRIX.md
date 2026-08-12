# Communication Automation — Final Matrix

Audited and updated **2026-08-12** against the live project `vxyshcucwdbpxrhddaeh`.
Every "PASS" below was observed; every "BLOCKED" names the missing data source.

All 32 registered events appear. The registry is
`src/features/communication/constants/automationEvents.ts` — no second event
engine was created.

---

## What the audit found before any code changed

Five findings, each verified against production rather than inferred:

| # | Finding | Evidence |
|---|---|---|
| 1 | **The daily scheduler had never enqueued a single message.** | `select count(*) from message_queue where context_type in ('birthday_student','demo_reminder')` → **0**, for all time. |
| 2 | **No cron job exists for it.** | `cron.job` holds 6 jobs; `comms-scheduler-daily` is not among them. The `cron.schedule` call in `20260628_comms_automation.sql` is commented out. |
| 3 | **Its inserts could not succeed.** `message_queue.organization_id` is `NOT NULL DEFAULT current_org_id()`; the function runs as `service_role` with no JWT, so once a second organization existed `fallback_org_id()` returned NULL. | Probed in a rolled-back transaction: `null value in column "organization_id" … violates not-null constraint`. The old `enqueue()` returned 0 on error and the response still said `ok:true`. |
| 4 | **Ten Academics automations were switched ON but had no template.** `templateFor()` returned null → `empty(eventKey, "no template")`. | `comms_templates` holds 8 rows, all ABC's; none of `teacher_class_*`, `class_*` existed in `whatsappTemplates.ts` either. |
| 5 | **`demo_reminder` queried columns that do not exist.** It read `admission_calls.demo_date` / `.demo_time`. | `admission_calls` has `date`, `follow_up_date`, `status` — no demo columns. The real source is `demo_classes.scheduled_at`. |

Also: the scheduler collapsed **every tenant's** settings into one `Map` keyed by
`event_key`, so whichever organization sorted last decided whether the other's
automation ran; it used UTC for a wall-clock day; and it consulted neither quiet
hours nor communication preference.

---

## The matrix

Legend — **Status**: PASS (works end to end) · PARTIAL (works, with a stated
limit) · BLOCKED (missing data source) · MANUAL (operator-initiated only).

Columns marked `·` are not applicable to that event.

### Attendance

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Dedupe | Pref | Quiet | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `attendance_absent` | Submit Attendance | `resolveAbsent` | Parents | WhatsApp | Immediate | `attendance_absent` | ✓ | ✓ | ✓ | **PASS** |
| 2 | `attendance_corrected` | Absence → Present | `resolveAbsent` | Parents | WhatsApp | Immediate | `attendance_corrected` | ✓ | ✓ | ✓ | **PASS** |
| 3 | `attendance_present` | Submit Attendance | caller-supplied | Parents | WhatsApp | Immediate | `attendance_present` | ✓ | ✓ | ✓ | **PARTIAL** — no registry resolver; relies on the caller passing recipients |

### Fees

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 4 | `fee_due` | Scheduler | `fee_due` (rewritten) | Parents | WhatsApp | Scheduled | `fee_due_reminder` | **PARTIAL** — resolves 126 ARK recipients; **all 126 skip** because `student_fees.due_date` is NULL on every pending row. See "Data quality" below. |
| 5 | `fee_paid` | Payment collected | `feeReceiptDelivery.service` | Parents | Email + WhatsApp | Immediate | `fee_receipt` | **PASS** — 244 queued rows, most recent today. Legacy flow, deliberately not migrated. |

### Exams

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 6 | `exam_published` | `useExamMutations` | `resolveExam` | Parents | WhatsApp | Immediate | `exam_result` | **PASS** |
| 7 | `exam_scheduled` | Scheduler | `exam_scheduled` (new) | Parents | WhatsApp | Scheduled | `exam_reminder` | **PASS** — 0 due today (no exam dated tomorrow); query verified against `exams.title/exam_date/start_time/hall` |

### Birthday

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 8 | `birthday_student` | Scheduler | `birthday_student` (rewritten) | Parents | WhatsApp | Scheduled | `birthday_wish` | **PASS** — 0 birthdays today; day boundary now resolved in `Asia/Kolkata` |

### Admission

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 9 | `admission_completed` | Admission flow | caller-supplied | Parents | Email + WhatsApp | Immediate | `student_welcome` | **PARTIAL** — no registry resolver |
| 10 | `demo_scheduled` | Demo booked | caller-supplied | Prospect | WhatsApp | Immediate | `lead_demo_scheduled_v2` | **PARTIAL** — Lead CRM owns this path and is out of scope for modification |
| 11 | `demo_reminder` | Scheduler | `demo_reminder` (**rewritten onto `demo_classes`**) | Prospect | WhatsApp | Scheduled | `lead_demo_reminder_v2` | **PASS** — 0 demos tomorrow; previously queried non-existent columns |

### Payroll · Credentials · Tasks · Certificate

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 12 | `payroll_approved` | `usePayrollApproval` | caller-supplied | Staff | WhatsApp | Immediate | `payroll_approved` | **PASS** |
| 13 | `staff_credentials` | Account created | `resolveCredentials` | Staff | WhatsApp | Immediate | `staff_credentials` | **PARTIAL** — sends; the provider template is REJECTED by Meta. See `AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md`. |
| 14 | `student_credentials` | Student created | `resolveCredentials` | Parents | WhatsApp | Immediate | `student_credentials` | **PARTIAL** — same |
| 15 | `task_assigned` | Task assigned | `resolveTask` | Assignee | WhatsApp | Immediate | `task_assigned` | **PASS** |
| 16 | `task_due` | Scheduler | `task_due` (new) | Assignee | WhatsApp | Scheduled | `task_reminder` | **PASS** — 0 due tomorrow; variables corrected to `task_name`/`status`, which is what the body actually asks for |
| 17 | `certificate_ready` | Certificate generated | caller-supplied | Parents | WhatsApp | Immediate | `certificate_ready` | **PARTIAL** — Certificate pages are `localStorage`-backed, so there is no server-side certificate row to trigger from |

### Live class · Holiday

| # | Event | Trigger | Resolver | Recipient | Channel | Timing | Template | Status |
|---|---|---|---|---|---|---|---|---|
| 18 | `live_class_created` | Live class created | `resolveLiveClass` | Students | WhatsApp | Immediate | `live_class_notification` | **PASS** |
| 19 | `class_cancelled` | Class cancelled | `resolveLiveClass` | Students | WhatsApp | Immediate | `class_cancelled` | **PASS** |
| 20 | `holiday_notice` | Scheduler | — | All | WhatsApp | Scheduled | `holiday_notice` | **BLOCKED** — **there is no `holidays` table.** Nothing in the database defines which date is a holiday. The resolver reports this explicitly rather than resolving to a silent zero. |

### Academics / faculty — all eleven were dead before this phase

Every one dispatches correctly from `schedule.service.ts` /
`classReminder.service.ts`, but had **no template**, so every dispatch ended at
`"no template"`. Templates added in `whatsappTemplates.ts`; a build gate now
fails if any event points at a template that does not exist.

| # | Event | Recipient | Channel | Timing | Template (new) | Status |
|---|---|---|---|---|---|---|
| 21 | `teacher_class_scheduled` | Teacher | Email + WhatsApp | Immediate | `teacher_class_scheduled` | **PASS** |
| 22 | `teacher_class_rescheduled` | Teacher | Email + WhatsApp | Immediate | `teacher_class_rescheduled` | **PASS** |
| 23 | `teacher_class_cancelled` | Teacher | Email + WhatsApp | Immediate | `teacher_class_cancelled` | **PASS** |
| 24 | `teacher_extra_class` | Teacher | Email + WhatsApp | Immediate | `teacher_extra_class` | **PASS** |
| 25 | `teacher_substitute_assigned` | Teacher | Email + WhatsApp | Immediate | `teacher_substitute_assigned` | **PASS** |
| 26 | `class_reminder_faculty` | Teacher | Email + WhatsApp | 15 min before | `class_reminder_faculty` | **PASS** |
| 27 | `class_reminder_coordinator` | Coordinator | Email + WhatsApp | 5 min before if not started | `class_reminder_coordinator` | **PASS** |
| 28 | `class_started` | Coordinator + management | Email + WhatsApp | Immediate | `class_started` | **PASS** |
| 29 | `class_ended` | Coordinator + management | Email + WhatsApp | Immediate | `class_ended` — includes `{{duration}}` from actual start/end timestamps | **PASS** |
| 30 | `class_attendance_due` | Teacher | Email + WhatsApp | 10 min before end | `class_attendance_due` | **PASS** |
| 31 | `class_attendance_missing` | Teacher | Email + WhatsApp | After class ends | `class_attendance_missing` | **PASS** |
| 32 | `class_cancelled_students` | Students + parents | WhatsApp | Immediate | `class_cancelled` | **PASS** |

---

## Cross-cutting behaviour

| Concern | Where | State |
|---|---|---|
| **Organization variables** | `orgContext.service.ts` + the Deno twin in the scheduler | **15 of 15** required variables resolve. `org_city` / `org_pincode` are new nullable columns (migration `20261003_phase10a`), NULL for every organization, never inferred from the free-text address. |
| **Deduplication** | `partitionDuplicates` (immediate) · `(organization_id, context_type, context_id, created_at::date)` (scheduled) | Scoped **per organization** — one tenant's send can no longer suppress another's. The scheduled path also de-duplicates *within* a batch. |
| **Quiet hours** | `automationRules.isWithinQuietHours` · `inQuietHours` in the scheduler | Messages are **deferred** to `quiet_end` via `scheduled_at`, never dropped. |
| **Communication preference** | `decideChannel` (immediate) · `prefAllowsWhatsapp` (scheduled) | `NONE` and `EMAIL` both suppress WhatsApp. **0 ARK students currently have a preference set**, so every ARK student is on the legacy "allowed" default. |
| **Family grouping** | `familyGrouping.ts`, gated by `supportsFamilyGrouping(eventKey)` | Applied to attendance only. Exam marks, fees, credentials and payroll stay per-child/per-staff — grouping them would leak one child's record to another's parent. |
| **Missing data** | `render()` returns `missing[]`; the caller skips | A message with an unresolved variable is **skipped with a recorded reason**, never sent with a gap. One bad recipient never stops the batch. |
| **Dry run** | `POST { dryRun: true }` | Resolves, renders, reports counts and a sample body, writes nothing. `{ events: [...] }` force-resolves an automation without enabling it — accepted **only** with `dryRun`, so a request body can never override a school's decision to keep an automation off. |
| **Tenant isolation** | Every scheduler query filters `organization_id`; every inserted row sets it explicitly | Verified: a dry run across both organizations returns separate, correctly-scoped results. |

---

## Data quality findings (not code defects)

These are real conditions in ARK's data that limit what can be sent. None is
worked around by inventing a value.

1. **`student_fees.due_date` is NULL on all 126 pending rows.** `fee_due`
   resolves all 126 parents and skips all 126 with `unresolved: due_date`,
   because the template says "is due on {{due_date}}". Filling in due dates —
   or approving a template body that omits the date — makes this event live.
2. **0 students have `communication_preference` set.** Everyone falls to the
   legacy allow-all default. Nothing is broken; nobody has opted out either.
3. **No `holidays` table.** Event 20 stays BLOCKED.

---

## Not yet done — stated plainly

- **The cron job is still not scheduled.** The rewritten scheduler is deployed
  and dry-run verified, but nothing invokes it on a timer. Enabling it starts
  real WhatsApp traffic to real parents and is an explicit operator decision,
  not something to switch on at the end of a refactor.
- **Provider (Meta) templates are still `READY_FOR_SUBMISSION`.** Until they are
  approved and marked ACTIVE, `resolveCampaign()` returns the **legacy ARK
  campaign**, so a non-ARK tenant's WhatsApp message still renders ARK's name in
  the part Meta controls. Local bodies, previews and email are tenant-correct;
  the provider-rendered WhatsApp body is not, and cannot be until Meta approves
  the neutral templates.
