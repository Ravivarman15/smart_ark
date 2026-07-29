# ARK ERP — AiSensy WhatsApp Templates (used after Phase 2)

All templates are **Utility** category. **Variable order is the source of truth** — it is the order
each placeholder first appears in the ERP body, so AiSensy positional params `{{1}}, {{2}}, …` line
up with what the ERP sends through `renderMessage`.

Sources of truth in code:
- Automation event → template map: `src/features/communication/constants/automationEvents.ts`.
- Core bodies: `BUILTIN_TEMPLATES` in `src/features/communication/utils/whatsappTemplates.ts`.
- Lead bodies: `LEAD_TEMPLATES` in `src/features/leads/utils/leadWhatsappTemplates.ts`.

This doc lists **only templates the ERP actually enqueues after Phase 2**: the 19 automation-event
templates, the Lead CRM funnel templates, and (flagged for reconciliation) the legacy keys still
written by per-feature services. Button CTA URLs are dynamic URL-button variables, shown as
*(button)* and not numbered in the body.

---

## A. Automation-event templates (driven by Communication Automation)

Each maps to an event key in the registry. *Channel* is the seeded default (configurable per event).

### Attendance

**attendance_absent** — event `attendance_absent` · WhatsApp
- Vars: `{{1}} parent_name`, `{{2}} student_name`, `{{3}} batch_name`, `{{4}} date`
- Body: `Hi {{1}}, {{2}} was marked ABSENT for {{3}} on {{4}}. If this was unintended, please contact the office.`
- Example: *Hi Mr. Sharma, Aarav was marked ABSENT for Grade 8 - A on 08 Jun 2026…*

**attendance_present** — event `attendance_present` · WhatsApp
- Vars: `{{1}} parent_name`, `{{2}} student_name`, `{{3}} batch_name`, `{{4}} date`
- Body: `Hi {{1}}, {{2}} was marked PRESENT for {{3}} on {{4}}. Thank you.`

### Fees

**fee_due_reminder** — event `fee_due` (scheduled) · WhatsApp
- Vars: `{{1}} amount_pending`, `{{2}} student_name`, `{{3}} batch_name`, `{{4}} due_date` · *(button)* `pay_url`
- Body: `Reminder: fee of {{1}} for {{2}} ({{3}}) is due on {{4}}. Please pay to avoid late fee.`

**payment_received** — event `fee_paid` · WhatsApp/Email
- Vars: `{{1}} parent_name`, `{{2}} amount`, `{{3}} student_name`, `{{4}} batch_name`, `{{5}} receipt_no` · *(button)* `receipt_url`
- Body: `Thank you {{1}}! We have received {{2}} for {{3}} ({{4}}). Receipt: {{5}}.`

### Exams

**exam_reminder** — event `exam_scheduled` (scheduled) · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} exam_name`, `{{3}} exam_date`, `{{4}} exam_time`, `{{5}} venue`
- Body: `Reminder: {{1}} has {{2}} on {{3}} at {{4}}. Venue: {{5}}. All the best!`

**exam_result** — event `exam_published` · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} exam_name`, `{{3}} marks`, `{{4}} total`, `{{5}} percentage`, `{{6}} grade` · *(button)* `report_url`
- Body: `{{1}}'s result for {{2}} is now published. Score: {{3}}/{{4}} ({{5}}%). Grade: {{6}}.`

### Birthday

**birthday_wish** — event `birthday_student` (scheduled, 08:00) · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} branch_name`
- Body: `Wishing {{1}} a very happy birthday! 🎂 May the year ahead bring joy, growth and success. — Team {{2}}`

### Admission / Demo

**student_welcome** — event `admission_completed` · WhatsApp/Email
- Vars: `{{1}} branch_name`, `{{2}} student_name`, `{{3}} batch_name`
- Body: `Welcome to {{1}}, {{2}}! Your admission is confirmed for {{3}}. We look forward to a successful journey together.`

**lead_demo_scheduled_v2** — event `demo_scheduled` · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} course_name`, `{{3}} demo_date`, `{{4}} demo_time`, `{{5}} faculty_name`
- Body: `Hi {{1}}, Your demo session for {{2}} is confirmed. Date: {{3}} Time: {{4}} Faculty: {{5}} …`

**lead_demo_reminder_v2** — event `demo_reminder` (scheduled, T-1 day) · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} course_name`, `{{3}} demo_date`, `{{4}} demo_time`
- Body: `Hi {{1}}, This is a reminder for your upcoming demo session for {{2}}. Date: {{3}} Time: {{4}} …`

### Payroll

**payroll_approved** — event `payroll_approved` · WhatsApp *(payslip emails are sent by the payroll flow)*
- Vars: `{{1}} staff_name`, `{{2}} salary_month`, `{{3}} net_salary`, `{{4}} pay_date`
- Body: `Hi {{1}}, payroll for {{2}} has been approved. Net Salary: {{3}} will be credited to your account on {{4}}.`

### Credentials

**staff_credentials** — staff account created / welcome resent / password reset · WhatsApp
- Enqueued by `staffCredentialsService.sendWhatsapp` (Create Staff sheet + Manage Staff → Resend /
  Reset), **alongside** the Brevo welcome email that `invite-staff` already sends. The same password
  the email carries — never a second one.
- Also used by the gated Send Staff Credentials page (`CredentialSendPanel`), which composes with a
  login-proven `username`; the positional spec aliases that onto `{{3}}`.
- Vars: `{{1}} staff_name`, `{{2}} role`, `{{3}} login_email`, `{{4}} password`, `{{5}} login_url`
- Body:
  ```
  Dear {{1}},

  Your ARK Learning Arena staff portal account has been created.

  Role: {{2}}
  Login Email: {{3}}
  Temporary Password: {{4}}
  Portal: {{5}}

  Please sign in and change your password after the first login. Keep these details confidential.

  Thank you,
  ARK Learning Arena
  ```
- Deliberately the **same shape** as `parent_credentials` — name, who they are, login, password,
  link — so the two credential templates cannot drift into different orders.

**student_credentials** — event `student_credentials` · WhatsApp
- Vars: `{{1}} parent_name`, `{{2}} branch_name`, `{{3}} student_name`, `{{4}} username`, `{{5}} password` · *(button)* `login_url`
- Body: `Hi {{1}}, the {{2}} parent app credentials for {{3}} are: User: {{4}} Temp Password: {{5}}`

**parent_credentials** — Parent Portal provisioning / password reset / resend · WhatsApp
- Enqueued by `parentCredentialsService.sendWhatsapp` (auth-accounts → Parent accounts), alongside
  the credential email. Drained immediately — credentials never wait for a cron tick.
- Vars: `{{1}} parent_name`, `{{2}} student_name`, `{{3}} login_email`, `{{4}} password`, `{{5}} login_url`
- Body:
  ```
  Dear {{1}},

  The ARK Learning Arena Parent Portal account for {{2}} has been created.

  Login Email: {{3}}
  Temporary Password: {{4}}
  Portal: {{5}}

  Please sign in and change your password after the first login. Keep these details confidential.

  Thank you,
  ARK Learning Arena
  ```
- The portal link is a **body variable, not a URL button**: a missing button config would still send
  the message, minus the address the parent needs. As a body param it is validated — a credential
  message with no link is refused, never delivered half-useless.
- The org name is **static text**, not a variable, so no positional param can shift behind it.
- `{{2}}` carries every linked child (`"Ravi test, Meera test"`) — the login is per parent, not per
  child.

### Tasks

**task_assigned** — event `task_assigned` · WhatsApp
- Vars: `{{1}} staff_name`, `{{2}} task_name`, `{{3}} assigned_by`, `{{4}} due_date` · *(button)* `task_url`
- Body: `Hi {{1}}, a new task '{{2}}' has been assigned to you by {{3}}. Due: {{4}}.`

**task_reminder** — event `task_due` (scheduled, T-1 day) · WhatsApp
- Vars: `{{1}} task_name`, `{{2}} due_date`, `{{3}} status` · *(button)* `task_url`
- Body: `Reminder: task '{{1}}' is due on {{2}}. Current status: {{3}}. Please update or complete it.`

### Certificate

**certificate_ready** — event `certificate_ready` · WhatsApp
- Vars: `{{1}} recipient_name`, `{{2}} certificate_name`, `{{3}} student_name` · *(button)* `certificate_url`
- Body: `Hi {{1}}, the {{2}} for {{3}} is ready. You can download it using the link below.`

### Live class & announcements

**live_class_notification** — event `live_class_created` · WhatsApp
- Vars: `{{1}} student_name`, `{{2}} subject_name`, `{{3}} teacher_name`, `{{4}} start_time`, `{{5}} start_date` · *(button)* `meeting_link`
- Body: `Hi {{1}}, your {{2}} live class with {{3}} starts at {{4}} on {{5}}. Join via the link below.`

**class_cancelled** — event `class_cancelled` · WhatsApp
- Vars: `{{1}} subject_name`, `{{2}} class_date`, `{{3}} class_time`, `{{4}} branch_name`
- Body: `Notice: the {{1}} class scheduled for {{2}} at {{3}} has been CANCELLED. A reschedule will be communicated shortly. — Team {{4}}`

**holiday_notice** — event `holiday_notice` (scheduled) · WhatsApp
- Vars: `{{1}} recipient_name`, `{{2}} branch_name`, `{{3}} holiday_date`, `{{4}} holiday_name`, `{{5}} resume_date`
- Body: `Dear {{1}}, {{2}} will remain closed on {{3}} for {{4}}. Regular schedule resumes on {{5}}.`

---

## B. Lead CRM funnel templates (leadWhatsappService)

**lead_welcome** — Vars `{{1}} student_name`, `{{2}} course_name` — `Hi {{1}} … received your enquiry for {{2}}.`
**lead_assigned_counselor** — `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`, `{{4}} mobile_number`
**lead_followup_reminder** — `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`
**sla_breach_alert** — `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`
**lead_admission_completed_v2** — `{{1}} parent_name`, `{{2}} student_name`, `{{3}} course_name`

(Full bodies in `leadWhatsappTemplates.ts`; the two demo templates are listed in section A.)

---

## C. Legacy template keys still enqueued by per-feature services — RECONCILE

These keys are written directly to `message_queue` by older per-feature services and differ from the
canonical keys above. Either create matching AiSensy templates, or migrate the service to the
canonical key. Until reconciled, the canonical automation event and the legacy service may use
different AiSensy templates for the same intent.

| Legacy key | Written by | Canonical equivalent | Action |
|---|---|---|---|
| `fee_due` | `fees/feeMessaging.service.ts` | `fee_due_reminder` | align AiSensy or migrate service |
| `fee_overdue` | `fees/feeMessaging.service.ts` | `fee_due_reminder` (overdue variant) | create or fold in |
| `fee_installment` | `fees/feeMessaging.service.ts` | — | create if used |
| `fee_receipt` | `fees/feeMessaging.service.ts` | `payment_received` | align AiSensy or migrate service |
| `live_class` | `live-classes/liveClassMessaging.service.ts` | `live_class_notification` | align AiSensy or migrate service |
| `attendance_defaulter`, `attendance_improvement`, `consecutive_absence`, `monthly_attendance_warning` | `attendance/automation` | — | dedicated alert templates (keep) |

---

## Summary table (used after Phase 2)

| Template | Variables (in order) | Category | Used by | Ready |
|---|---|---|---|---|
| attendance_absent | parent_name, student_name, batch_name, date | Utility | event attendance_absent | ✅ |
| attendance_present | parent_name, student_name, batch_name, date | Utility | event attendance_present | ✅ |
| fee_due_reminder | amount_pending, student_name, batch_name, due_date (+pay_url) | Utility | event fee_due | ✅ |
| payment_received | parent_name, amount, student_name, batch_name, receipt_no (+receipt_url) | Utility | event fee_paid | ✅ |
| exam_reminder | student_name, exam_name, exam_date, exam_time, venue | Utility | event exam_scheduled | ✅ |
| exam_result | student_name, exam_name, marks, total, percentage, grade (+report_url) | Utility | event exam_published | ✅ |
| birthday_wish | student_name, branch_name | Utility | event birthday_student | ✅ |
| student_welcome | branch_name, student_name, batch_name | Utility | event admission_completed | ✅ |
| lead_demo_scheduled_v2 | student_name, course_name, demo_date, demo_time, faculty_name | Utility | event demo_scheduled / Lead CRM | ✅ |
| lead_demo_reminder_v2 | student_name, course_name, demo_date, demo_time | Utility | event demo_reminder / Lead CRM | ✅ |
| payroll_approved | staff_name, salary_month, net_salary, pay_date | Utility | event payroll_approved | ✅ |
| staff_credentials | staff_name, role, login_email, password, login_url | Utility | Staff creation / resend / reset + Send Staff Credentials | ✅ |
| student_credentials | parent_name, branch_name, student_name, username, password (+login_url) | Utility | event student_credentials | ✅ |
| parent_credentials | parent_name, student_name, login_email, password, login_url | Utility | Parent Portal provisioning / reset / resend | ✅ |
| task_assigned | staff_name, task_name, assigned_by, due_date (+task_url) | Utility | event task_assigned | ✅ |
| task_reminder | task_name, due_date, status (+task_url) | Utility | event task_due | ✅ |
| certificate_ready | recipient_name, certificate_name, student_name (+certificate_url) | Utility | event certificate_ready | ✅ |
| live_class_notification | student_name, subject_name, teacher_name, start_time, start_date (+meeting_link) | Utility | event live_class_created | ✅ |
| class_cancelled | subject_name, class_date, class_time, branch_name | Utility | event class_cancelled | ✅ |
| holiday_notice | recipient_name, branch_name, holiday_date, holiday_name, resume_date | Utility | event holiday_notice | ✅ |
| lead_welcome | student_name, course_name | Utility | Lead CRM | ✅ |
| lead_assigned_counselor | counselor_name, student_name, course_name, mobile_number | Utility | Lead CRM | ✅ |
| lead_followup_reminder | counselor_name, student_name, course_name | Utility | Lead CRM | ✅ |
| sla_breach_alert | counselor_name, student_name, course_name | Utility | Lead CRM | ✅ |
| lead_admission_completed_v2 | parent_name, student_name, course_name | Utility | Lead CRM | ✅ |

> **`parent_credentials` re-added** (2026-07-29): the Parent Portal now enqueues it on every login
> provisioned, password reset and resend, so it is a live template again — see the Credentials
> section above for the exact body and parameter order.
>
> **Removed from this doc vs Phase 1:** `birthday_staff` (never seeded — no code path),
> `inquiry_followup`, `password_reset`, `account_activated`,
> `account_disabled` (present in `BUILTIN_TEMPLATES` but not referenced by any Phase-2 automation
> event or active service path — re-add here only if a feature starts enqueuing them).
