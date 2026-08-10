# Communication Automation Matrix

One row per canonical event in `src/features/communication/constants/automationEvents.ts`.

Generated from the registry rather than hand-maintained. If the registry gains an
event and this table does not list it, the table is stale — regenerate rather than
editing by hand.

**32 events · 12 fully automatic · 12 trigger-wired · 8 not automatable yet**

*Fully automatic* = `dispatch(eventKey, { entityId })` resolves both the audience
and every variable with no operator input.
*Trigger-wired* = fires automatically from a business action, but the caller still
supplies the recipients and variables.

| Event | Category | Template | Channel | Resolver | Recipient source | Trigger point | Automatic? |
|---|---|---|---|---|---|---|---|
| `attendance_absent` | Attendance | `attendance_absent` | whatsapp | `resolveAbsent` | student_attendance + students | Attendance submit (live) | **YES** |
| `attendance_corrected` | Attendance | `attendance_corrected` | whatsapp | `resolveAbsent` | student_attendance + students | Attendance correction (live) | **YES** |
| `attendance_present` | Attendance | `attendance_present` | whatsapp | — | — | none | **NOT YET** |
| `fee_due` | Fees | `fee_due_reminder` | whatsapp | `resolveFeeDue` | student_fees (pending) | Daily scheduler | **YES** |
| `fee_paid` | Fees | `fee_receipt` | both | — | — | none | **NOT YET** |
| `exam_published` | Exams | `exam_result` | whatsapp | `resolveExam` | exams + students by standard/batch | Results publish | **YES** |
| `exam_scheduled` | Exams | `exam_reminder` | whatsapp | `resolveExam` | exams + students by standard/batch | useCreateExam onSuccess | **YES** |
| `birthday_student` | Birthday | `birthday_wish` | whatsapp | `resolveBirthday` | students.date_of_birth | Daily scheduler | **YES** |
| `admission_completed` | Admission | `student_welcome` | both | — | — | none | **NOT YET** |
| `demo_scheduled` | Admission | `lead_demo_scheduled_v2` | whatsapp | — | — | none | **NOT YET** |
| `demo_reminder` | Admission | `lead_demo_reminder_v2` | whatsapp | — | — | none | **NOT YET** |
| `payroll_approved` | Payroll | `payroll_approved` | whatsapp | — | caller-supplied | `usePayrollApproval` | Trigger-wired |
| `staff_credentials` | Credentials | `staff_credentials` | whatsapp | `resolveCredentials` | profiles + triggerData | Account creation | **YES** |
| `student_credentials` | Credentials | `student_credentials` | whatsapp | `resolveCredentials` | students + triggerData | Account creation | **YES** |
| `task_assigned` | Tasks | `task_assigned` | whatsapp | `resolveTask` | tasks + profiles(assignee) | Task assignment | **YES** |
| `task_due` | Tasks | `task_reminder` | whatsapp | `resolveTask` | tasks + profiles(assignee) | Daily scheduler | **YES** |
| `certificate_ready` | Certificate | `certificate_ready` | whatsapp | — | — | none | **NOT YET** |
| `live_class_created` | Live Class | `live_class_notification` | whatsapp | `resolveLiveClass` | class_schedules + students | Class scheduled | **YES** |
| `class_cancelled` | Live Class | `class_cancelled` | whatsapp | — | — | none | **NOT YET** |
| `holiday_notice` | Holiday | `holiday_notice` | whatsapp | — | — | none | **NOT YET** |
| `teacher_class_scheduled` | Academics | `teacher_class_scheduled` | both | — | caller-supplied | `schedule.service` | Trigger-wired |
| `teacher_class_rescheduled` | Academics | `teacher_class_rescheduled` | both | — | caller-supplied | `schedule.service` | Trigger-wired |
| `teacher_class_cancelled` | Academics | `teacher_class_cancelled` | both | — | caller-supplied | `schedule.service` | Trigger-wired |
| `teacher_extra_class` | Academics | `teacher_extra_class` | both | — | caller-supplied | `schedule.service` | Trigger-wired |
| `teacher_substitute_assigned` | Academics | `teacher_substitute_assigned` | both | — | caller-supplied | `schedule.service` | Trigger-wired |
| `class_reminder_faculty` | Academics | `class_reminder_faculty` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_reminder_coordinator` | Academics | `class_reminder_coordinator` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_started` | Academics | `class_started` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_ended` | Academics | `class_ended` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_attendance_due` | Academics | `class_attendance_due` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_attendance_missing` | Academics | `class_attendance_missing` | both | — | caller-supplied | `classReminder.service` | Trigger-wired |
| `class_cancelled_students` | Academics | `class_cancelled` | whatsapp | `resolveLiveClass` | class_schedules + students | Class cancelled | **YES** |

---

## Not automatable yet — the exact blocker

No event below is faked or stubbed. Each names the specific missing data source.

**`attendance_present`** — Same source as absent, but sending to every present parent every day is an order of magnitude more volume. Needs an explicit opt-in audience before it is safe to automate.

**`fee_paid`** — Already sends, via `feeReceiptDelivery.service` — a SEPARATE path with its own delivery + PDF logic. Folding it into the dispatcher is a migration, not a new resolver, and would risk a working receipt flow.

**`admission_completed`** — The enquiry → student conversion mutation does not currently dispatch. Needs the trigger seam identified in the admissions flow.

**`demo_scheduled`** — Owned by Lead CRM (`leadWhatsapp.service`). The brief says do not rewrite Lead CRM, so this is intentionally left alone.

**`demo_reminder`** — Owned by Lead CRM. Scheduler seam lives in the lead module.

**`certificate_ready`** — Needs the certificates table plus a signed download URL; resolver not yet written.

**`class_cancelled`** — Superseded in practice by `class_cancelled_students`, which is already wired through `classReminder.service`.

**`holiday_notice`** — Needs a holidays sweep, and the audience is the entire school — that warrants an explicit confirmation step rather than a silent automation.

---

## Variables resolved with zero operator input

| Event | Variables resolved automatically |
|---|---|
| `attendance_absent` | student, parent, class, section, date |
| `attendance_corrected` | student, parent, date |
| `birthday_student` | student, parent, batch, campus |
| `fee_due` | pending, total, paid, due_date |
| `exam_scheduled` | exam, date, time, venue, subject, class |
| `exam_published` | exam, subject, class |
| `task_assigned` | task title, due date, priority |
| `task_due` | task title, due date, priority |
| `live_class_created` | subject, teacher, date, time, venue, link |
| `class_cancelled_students` | subject, date, time, reason |
| `staff_credentials` | role, login, password (trigger-bound) |
| `student_credentials` | login, password (trigger-bound) |

Plus the organization bag on **every** event, resolved by `orgContextService`:
`org_name`, `org_short_name`, `org_legal_name`, `org_phone`, `org_email`,
`org_website`, `org_address`.

---

## AiSensy parameter safety

Templates that declare an explicit `variables:` list — `attendance_absent`,
`attendance_corrected`, `staff_credentials`, `student_credentials`, `fee_receipt` —
use that list as the AiSensy positional-parameter order. `{{org_name}}` was added
to those template BODIES but deliberately **not** to their variable lists, so the
provider parameter mapping is unchanged and the approved templates still match.

Templates without an explicit list derive their parameters from the body via
`extractVariables()`. Adding a variable to one of those **would** shift the
provider's parameter order — which is why `exam_reminder` carries no organization
sign-off and must not be given one without re-approving the AiSensy template.
