# Communication Automation — Final Matrix

<!-- GENERATED FILE — do not edit by hand.
     Regenerate: node scripts/comms-matrix.mjs
     Verified in CI:  node scripts/comms-matrix.mjs --check
     Source of truth: src/features/communication/constants/automationEvents.ts
                      src/features/communication/utils/automationState.ts -->

Generated **2026-08-14** from the registry, not from memory.

All **32** registered events appear below. There is one registry and one
state model; this table, the Communication Center and the CI gate
(`src/test/security/automationRegistryAudit.test.ts`) all read them, so a status
here cannot drift from what the system actually does.

## Summary

| State | Count | Meaning |
|---|---|---|
| **READY** | 23 | dispatchable; whether it is switched on is per tenant — see the tenant columns |
| **MISSING_TRIGGER** | 4 | registered, but nothing in the application dispatches it |
| **ACTIVE** | 2 | enabled and able to send |
| **BLOCKED** | 2 | structurally impossible until the named source exists |
| **PROVIDER_MISSING** | 1 | CANNOT SEND — the AiSensy campaign it posts to does not exist, or Meta rejected it. The switch may read ON; nothing is delivered. See docs/AISENSY_CAMPAIGN_STATE.md |

> **Reading this table.** `State` is CAPABILITY — what the system can do at
> all — evaluated against the REGISTRY DEFAULTS, not against any one tenant's
> switches. `ACTIVE`, `READY` and `PROVIDER_PENDING` are all dispatchable;
> the rest are not. Whether a given school has an event switched on is the
> per-tenant column at the right, read live from `comms_automation_settings`.
>
> The two are deliberately separate. An event can be switched ON and still be
> `MISSING_TRIGGER` — that combination is the defect this work exists to
> surface, and the Communication Center renders it in red rather than as a
> green toggle.


## Attendance

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `attendance_absent` | **ACTIVE** | yes | yes | `attendance_absent` | ACTIVE | whatsapp | immediate | on | off |
| `attendance_corrected` | **ACTIVE** | yes | yes | `attendance_corrected` | ACTIVE | whatsapp | immediate | on | — |
| `attendance_present` | **MISSING_TRIGGER** | no | yes | `attendance_present` | NONE | whatsapp | immediate | off | — |

## Fees

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `fee_due` | **READY** | yes | yes | `fee_due_reminder` | NONE | whatsapp | scheduled | off | off |
| `fee_paid` | **READY** | yes | yes | `fee_receipt` | ACTIVE | both | immediate | on | off |

## Exams

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `exam_published` | **READY** | yes | yes | `exam_result` | NONE | whatsapp | immediate | on | — |
| `exam_scheduled` | **READY** | yes | yes | `exam_reminder` | NONE | whatsapp | scheduled | off | — |

## Birthday

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `birthday_student` | **READY** | yes | yes | `birthday_wish` | NONE | whatsapp | scheduled | off | — |

## Admission

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `admission_completed` | **MISSING_TRIGGER** | no | yes | `student_welcome` | NONE | both | immediate | on | — |
| `demo_scheduled` | **READY** | yes | yes | `lead_demo_scheduled_v2` | PENDING | whatsapp | immediate | on | — |
| `demo_reminder` | **READY** | yes | yes | `lead_demo_reminder_v2` | PENDING | whatsapp | scheduled | off | — |

## Payroll

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `payroll_approved` | **READY** | yes | yes | `payroll_approved` | NONE | whatsapp | immediate | on | — |

## Credentials

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `staff_credentials` | **PROVIDER_MISSING** | yes | yes | `staff_credentials` | PENDING | whatsapp | immediate | on | — |
| `student_credentials` | **READY** | yes | yes | `student_credentials` | PENDING | whatsapp | immediate | on | — |

## Tasks

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `task_assigned` | **READY** | yes | yes | `task_assigned` | NONE | whatsapp | immediate | off | — |
| `task_due` | **READY** | yes | yes | `task_reminder` | NONE | whatsapp | scheduled | off | — |

## Certificate

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `certificate_ready` | **BLOCKED** | no | yes | `certificate_ready` | NONE | whatsapp | immediate | off | — |

## Live Class

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `live_class_created` | **MISSING_TRIGGER** | no | yes | `live_class_notification` | NONE | whatsapp | immediate | off | — |
| `class_cancelled` | **MISSING_TRIGGER** | no | yes | `class_cancelled` | NONE | whatsapp | immediate | off | off |

## Holiday

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `holiday_notice` | **BLOCKED** | no | no | `holiday_notice` | NONE | whatsapp | scheduled | off | — |

## Academics

| Event | State | Trigger | Resolver | Template | Provider | Channel | Timing | ark | abc-academi |
|---|---|---|---|---|---|---|---|---|---|
| `teacher_class_scheduled` | **READY** | yes | yes | `teacher_class_scheduled` | NONE | both | immediate | on | — |
| `teacher_class_rescheduled` | **READY** | yes | yes | `teacher_class_rescheduled` | NONE | both | immediate | on | — |
| `teacher_class_cancelled` | **READY** | yes | yes | `teacher_class_cancelled` | NONE | both | immediate | on | — |
| `teacher_extra_class` | **READY** | yes | yes | `teacher_extra_class` | NONE | both | immediate | on | — |
| `teacher_substitute_assigned` | **READY** | yes | yes | `teacher_substitute_assigned` | NONE | both | immediate | on | — |
| `class_reminder_faculty` | **READY** | yes | yes | `class_reminder_faculty` | NONE | both | immediate | on | — |
| `class_reminder_coordinator` | **READY** | yes | yes | `class_reminder_coordinator` | NONE | both | immediate | on | — |
| `class_started` | **READY** | yes | yes | `class_started` | NONE | both | immediate | on | — |
| `class_ended` | **READY** | yes | yes | `class_ended` | NONE | both | immediate | on | — |
| `class_attendance_due` | **READY** | yes | yes | `class_attendance_due` | NONE | both | immediate | on | — |
| `class_attendance_missing` | **READY** | yes | yes | `class_attendance_missing` | NONE | both | immediate | — | — |
| `class_cancelled_students` | **READY** | yes | yes | `class_cancelled` | NONE | whatsapp | immediate | on | — |

## Why the 7 non-dispatchable events cannot send

Each row names the missing thing. "Not ready" without a cause is a shrug,
and a shrug is what let ten switches sit green for months.

| Event | State | Reason |
|---|---|---|
| `attendance_present` | MISSING_TRIGGER | Registered as an optional present-confirmation, but Submit Attendance only dispatches attendance_absent and attendance_corrected. Nothing calls it. |
| `admission_completed` | MISSING_TRIGGER | The admission flow completes without dispatching. Lead CRM sends its own lead_admission_completed_v2 on a separate path. |
| `staff_credentials` | PROVIDER_MISSING | The WhatsApp campaign "staff_credentials" does not exist at the provider. HTTP 400 "Campaign does not exist." — 6 occurrences across both tenants, 2026-07-31 through 2026-08-12. Not one staff credential has EVER been delivered over WhatsApp. The Brevo welcome email is the only channel that has ever worked for this flow. Create and approve it in AiSensy, or the message cannot be sent on any channel but email. |
| `certificate_ready` | BLOCKED | Certificate pages are localStorage-backed (ModuleStarterPage, storageKey "certificates"), so no server-side certificate row exists to trigger from. |
| `live_class_created` | MISSING_TRIGGER | A resolver exists (resolveLiveClass) but no live-class creation path dispatches the event. |
| `class_cancelled` | MISSING_TRIGGER | Superseded by class_cancelled_students, which is what classReminder.service.ts dispatches. This key remains in the registry with no caller. |
| `holiday_notice` | BLOCKED | No holidays table exists. Nothing in the database defines which date is a holiday, and inventing a festival list would send confident, wrong messages to every parent. |

## Switches that read ON but cannot send

None, by registry default.

Per-tenant, this is computed live: the Communication Center counts them at
the top of the page, and `automationRegistryAudit.test.ts` fails the build
if any of them is a CODE defect (a missing template or resolver) rather than
a documented configuration one.
