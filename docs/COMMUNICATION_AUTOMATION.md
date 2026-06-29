# Communication Automation — Phase 1 (zero manual variable entry)

Makes the operational Send pages **auto-resolve every template variable from ERP data**. The
operator no longer types variable values — they confirm **"N recipients → Send → Done"**, with a
Smart-Send pre-flight and a live bulk delivery dashboard.

**Built entirely on the existing engine** — no new services, no new queue, no new tables, no data
migration. Lead CRM untouched.

---

## What changed

| Concern | Before | After |
|---|---|---|
| Variable values | Auto-resolved per recipient **and** a manual global-defaults editor was shown | Auto-resolved per recipient; manual editor **hidden** on automated pages |
| Recipient selection | Operator hand-picks recipients | **All** eligible recipients targeted automatically (subset still possible) |
| Validation | At enqueue time (toast) | **Pre-flight** Smart-Send summary before sending + at enqueue |
| Visibility | Generic KPI tiles | **Bulk dashboard**: valid / no-phone / missing-data / skipped + live queued/sent/delivered/read/retrying/failed |

### Automated pages (variables fully resolvable from the recipient list today)
`SendAbsentAttendancePage`, `SendBirthdayPage`, `SendFeeDueReminderPage`, `SendFeeStatusPage`.

### Left manual (by design)
- **Broadcast / marketing:** `SendStudentPage`, `SendStaffPage`, `SendInquiryPage`, Test Console,
  Deployment Manager — manual composer retained (per spec "keep manual mode only for…").
- **Exam marks / reminder** (`SendExamMarksPage`, `SendExamReminderPage`): need `marks`, `grade`,
  `exam_date`, `venue` etc. that exist only at exam-publish time — not on the student list. These
  belong to the **Phase-2 trigger** (Exam Published → Send), not a standalone auto-send page.
- **Credentials** (`SendStudentCredentialsPage`, `SendStaffCredentialsPage`): use the separate
  `CredentialSendPanel` with generated secrets + a verify-credentials gate — out of scope for the
  zero-variable broadcast flow.

---

## Flow (reuses the entire existing pipeline)

```
Operational ERP data (students / staff / fees / attendance / birthdays)
        │
        ▼
commsRecipientsService          ← recipients + their variables in meta
        │
        ▼
buildAutomatedBatch (NEW, pure) ── per recipient:
   • resolve vars  (page's perRecipientDefaults)
   • renderMessage (existing)              ← substitution + missing detection
   • validateEnqueue (existing)            ← Smart Send: phone? vars resolved? body?
        │  valid → EnqueueInput            invalid → counted + skipped (batch continues)
        ▼
aisensyService.enqueueBulk (existing) ──► message_queue
        ▼
send-aisensy edge fn (existing) ──► AiSensy / Brevo ──► aisensy-webhook ──► comms_audit / analytics
        ▲
BulkSendDashboard (NEW, presentation) ── reads enqueue result + live message_queue rows
```

**New code is only the thin orchestration + presentation:**
- `utils/commsAutomation.ts` — pure `buildAutomatedBatch` (renderMessage + validateEnqueue).
- `components/BulkSendDashboard.tsx` — pure presentation over existing data.
- `components/SendCampaignPanel.tsx` — `automated` mode; `MessageComposer` — `readOnly` mode.

---

## Migration / deployment notes
**None new.** This phase ships no SQL and no edge-function changes. It depends only on the already-
documented infrastructure (see `docs/COMMUNICATION_VERIFICATION.md`): apply the comms migrations,
`seedBuiltins()`, deploy `send-aisensy` / `send-email`, set provider secrets + cron + webhook.
Until then the pages render and the dashboard honestly shows "queue not configured / 0 sent".

---

## Phase 2 (deferred) — operational auto-send triggers

Wire each business action to the message engine **through that feature's existing messaging
service** (do not add new ones). Pattern: on a successful mutation, build recipients + variables
from the data already in hand → `aisensyService.enqueueBulk` (offer-to-send dialog, or auto for
credentials/payroll/admission).

| Trigger | Existing service to reuse | Template |
|---|---|---|
| Attendance saved | `attendance/automation` | attendance_absent / attendance_present |
| Fee due generated / paid | `fees/feeMessaging`, `fee/feeReminder` | fee_due_reminder / payment_received |
| Exam published | (exam feature) | exam_result |
| Birthday (daily) | comms recipients `birthdaysOn` + scheduler | birthday_wish |
| Live class created/cancelled | `live-classes/liveClassMessaging` | live_class_notification / class_cancelled |
| Admission completed | `leads/leadWhatsapp` | lead_admission_completed_v2 |
| Payroll approved | `payroll/payrollEmail` + aisensy | payroll_approved / salary_slip |
| Staff / student created | credentials service | staff_credentials / student_credentials |

---

## Build report

### PASS / FAIL
| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS (0 errors) |
| `eslint` (changed files) | ✅ PASS (0 errors/warnings) |
| `vitest` (communication) | ✅ PASS — 47/47 (5 new automation, 25 seed, 10 deployment, 7 credentials) |
| `vite build` | ✅ PASS (built in 1m 07s) |
| Reuses engine only — no new services/queue/tables | ✅ |
| No data migration | ✅ |
| Lead CRM untouched | ✅ |

### New files
- `src/features/communication/utils/commsAutomation.ts`
- `src/features/communication/components/BulkSendDashboard.tsx`
- `src/features/communication/testing/commsAutomation.test.ts`
- `docs/AISENSY_TEMPLATES.md`, `docs/COMMUNICATION_AUTOMATION.md`

### Modified files
- `src/features/communication/components/MessageComposer.tsx` (`readOnly`)
- `src/features/communication/components/SendCampaignPanel.tsx` (`automated` + dashboard)
- `src/features/communication/components/index.ts`, `utils/index.ts` (exports)
- `src/features/communication/pages/SendAbsentAttendancePage.tsx`
- `src/features/communication/pages/SendBirthdayPage.tsx`
- `src/features/communication/pages/SendFeeDueReminderPage.tsx`
- `src/features/communication/pages/SendFeeStatusPage.tsx`
