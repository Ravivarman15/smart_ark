# Smart ARK — WhatsApp Automation Operational Readiness Matrix

Comprehensive event-by-event operational readiness matrix across all 31 automation events,
reflecting live database baseline inspection, multi-tenant branding, parameter contracts, and provider status.

Matrix Date: 2026-10-12  
Audit Baseline: ARK (Live Production Reference: `126a6dd8-6f7e-4b81-9b82-58a9a3b77674`), ABC Academi (`12028704-0344-4900-af41-2f71b2372627`)  

---

## Operational Readiness Classifications

- **READY_TO_DISPATCH**: Setting ON, verified campaign exists, multi-tenant branding ready, parameter contract valid, recipient resolver functional.
- **OPERATIONAL_ON_APPROVAL**: Setting configured, trigger and resolvers functional, but blocked from sending until Meta approves the proposed multi-tenant campaign.
- **LEGACY_OPERATIONAL_BRANDED**: Operating on legacy ARK campaign. Sends reliably, but leaks ARK branding for non-ARK tenants.
- **PROVIDER_BLOCKED**: Blocked due to missing, rejected, or unverified provider campaign.
- **STRUCTURALLY_BLOCKED**: Missing database tables or untriggered client-side code paths.

---

## Master Event-by-Event Matrix

| Event Key | Event Label | Category | Default | ARK Setting | ABC Setting | Channel | Campaign | Provider Status | Trigger Source | Recipient Resolver | Operational State |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `attendance_absent` | Student marked absent | Attendance | ON | ON | ON | whatsapp | `smartark_attendance_absent` | ACTIVE_VERIFIED | `attendanceWhatsapp.service.ts` | `automationResolvers.ts` | **READY_TO_DISPATCH** |
| `attendance_corrected` | Attendance corrected | Attendance | ON | ON | OFF | whatsapp | `smartark_attendance_corrected` | APPROVED_NOT_RUNTIME_VERIFIED | `attendanceWhatsapp.service.ts` | `automationResolvers.ts` | **READY_TO_DISPATCH** |
| `attendance_present` | Student marked present | Attendance | OFF | OFF | OFF | whatsapp | `attendance_present` | UNVERIFIED | None | `automationResolvers.ts` | **STRUCTURALLY_BLOCKED** (Untriggered) |
| `fee_paid` | Fee paid receipt | Fees | OFF | ON | OFF | both | `smartark_fee_receipt` | ACTIVE_VERIFIED | `feeReceiptDelivery.service.ts` | Caller Supplied | **READY_TO_DISPATCH** |
| `fee_due` | Fee due reminder | Fees | OFF | ON | OFF | whatsapp | `fee_due` (Proposed `smartark_fee_due_reminder`) | UNVERIFIED | `comms-scheduler/index.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `exam_published` | Exam marks published | Exams | OFF | ON | OFF | whatsapp | `exam_result` (Proposed `smartark_exam_result`) | UNVERIFIED | `useExamMutations.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `exam_scheduled` | Exam reminder | Exams | OFF | ON | OFF | whatsapp | `exam_reminder` (Proposed `smartark_exam_reminder`) | UNVERIFIED | `comms-scheduler/index.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `birthday_student` | Student birthday | Birthday | OFF | ON | OFF | whatsapp | `birthday_wish` (Proposed `smartark_birthday_wish`) | UNVERIFIED | `comms-scheduler/index.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `admission_completed` | Admission completed | Admission | OFF | ON | OFF | both | `lead_admission_completed_v2` | UNVERIFIED | None | Caller Supplied | **STRUCTURALLY_BLOCKED** (Untriggered) |
| `demo_scheduled` | Demo scheduled | Admission | OFF | ON | OFF | whatsapp | `lead_demo_scheduled_v2` | ACTIVE_VERIFIED (Branded) | `leadActions.service.ts` | Caller Supplied | **LEGACY_OPERATIONAL_BRANDED** |
| `demo_reminder` | Demo reminder | Admission | OFF | ON | OFF | whatsapp | `lead_demo_reminder_v2` | UNVERIFIED | `comms-scheduler/index.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `payroll_approved` | Payroll approved | Payroll | OFF | ON | OFF | whatsapp | `payroll_approved` (Proposed `smartark_payroll_approved`) | UNVERIFIED | `usePayrollApproval.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `staff_credentials` | Staff account ready | Credentials | OFF | ON | OFF | whatsapp | `smartark_staff_account_ready` | READY_FOR_SUBMISSION | `staffCredentials.service.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** (Legacy `staff_credentials` is PROVIDER_BLOCKED) |
| `student_credentials` | Parent Portal ready | Credentials | OFF | ON | OFF | whatsapp | `smartark_parent_account_ready` | READY_FOR_SUBMISSION | `SendStudentCredentialsPage.tsx` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** (Legacy `parent_credentials` UNVERIFIED) |
| `task_assigned` | Task assigned | Tasks | OFF | ON | OFF | whatsapp | `task_assigned` | UNVERIFIED | `taskNotifications.service.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `task_due` | Task due reminder | Tasks | OFF | ON | OFF | whatsapp | `task_reminder` | UNVERIFIED | `comms-scheduler/index.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |
| `certificate_ready` | Certificate ready | Certificate | OFF | OFF | OFF | whatsapp | `certificate_ready` | UNVERIFIED | None (localStorage) | Caller Supplied | **STRUCTURALLY_BLOCKED** (Client-only) |
| `live_class_created` | Live class created | Live Class | OFF | OFF | OFF | whatsapp | `live_class_notification` | UNVERIFIED | None | `automationResolvers.ts` | **STRUCTURALLY_BLOCKED** (Untriggered) |
| `class_cancelled` | Class cancelled | Live Class | OFF | OFF | OFF | whatsapp | `class_cancelled` | UNVERIFIED | None | Caller Supplied | **STRUCTURALLY_BLOCKED** (Superseded) |
| `holiday_notice` | Holiday notice | Holiday | OFF | OFF | OFF | whatsapp | `holiday_notice` | UNVERIFIED | None | Caller Supplied | **STRUCTURALLY_BLOCKED** (No holidays table) |
| `teacher_class_scheduled` | Class scheduled (teacher) | Academics | OFF | ON | OFF | both | `teacher_class_scheduled` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `teacher_class_rescheduled` | Class rescheduled (teacher) | Academics | OFF | ON | OFF | both | `teacher_class_rescheduled` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `teacher_class_cancelled` | Class cancelled (teacher) | Academics | OFF | ON | OFF | both | `teacher_class_cancelled` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `teacher_extra_class` | Extra class assigned | Academics | OFF | ON | OFF | both | `teacher_extra_class` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `teacher_substitute_assigned` | Substitute assigned | Academics | OFF | ON | OFF | both | `teacher_substitute_assigned` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_reminder_faculty` | Faculty class reminder | Academics | OFF | ON | OFF | both | `class_reminder_faculty` | UNVERIFIED | `classReminder.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_reminder_coordinator` | Coordinator class reminder | Academics | OFF | ON | OFF | both | `class_reminder_coordinator` | UNVERIFIED | `classReminder.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_started` | Class started | Academics | OFF | ON | OFF | both | `schedule.service.ts` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_ended` | Class ended | Academics | OFF | ON | OFF | both | `schedule.service.ts` | UNVERIFIED | `schedule.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_attendance_due` | Attendance due (10 min) | Academics | OFF | ON | OFF | both | `class_attendance_due` | UNVERIFIED | `classReminder.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_attendance_missing` | Attendance missing | Academics | OFF | ON | OFF | both | `class_attendance_missing` | UNVERIFIED | `classReminder.service.ts` | Caller Supplied | **OPERATIONAL_ON_APPROVAL** |
| `class_cancelled_students` | Class cancelled (students) | Academics | OFF | ON | OFF | whatsapp | `class_cancelled` | UNVERIFIED | `classReminder.service.ts` | `automationResolvers.ts` | **OPERATIONAL_ON_APPROVAL** |

---

## Detailed Findings

1. **Active Multi-Tenant Campaigns in Production**:
   - `smartark_attendance_absent` is live and verified across multiple tenants.
   - `smartark_fee_receipt` is live and verified across multiple tenants.
   - `smartark_attendance_corrected` is approved by Meta; awaits live operational trigger.

2. **Lead CRM Active Legacy Campaigns (Tenant-Branded)**:
   - `lead_welcome`, `lead_assigned_counselor`, `lead_demo_scheduled_v2`, `demo_scheduled` are functioning in production, but hardcode ARK Learning Arena. Replacing them with the ready `smartark_lead_*` family will eliminate cross-tenant branding leakage.

3. **Dead / Refused Campaigns**:
   - `staff_credentials` (legacy) does not exist at AiSensy (HTTP 400).
   - `inquiry_followup` (legacy) does not exist at AiSensy (HTTP 400).
   - `smartark_staff_credentials1` and `smartark_student_credentials1` were rejected by Meta due to plaintext passwords. They are now permanently blocked via `DEAD_CAMPAIGNS` in `send-aisensy`.

4. **Queue Drain Safety**:
   - `send-aisensy` Edge Function now re-checks `comms_automation_settings` before dispatching. If an organization disables an event after enqueue, the queue row is transitioned to `cancelled` and logged as `skip` in `comms_audit`.
