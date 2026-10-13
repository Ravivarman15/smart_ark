# Smart ARK — Master WhatsApp Template Inventory

Comprehensive repository audit of all WhatsApp communication templates, campaign mappings,
runtime send paths, multi-tenant branding variables, automation settings, and delivery mechanics.

Audit Date: 2026-10-12  
Platform: Smart ARK Multi-Tenant SaaS  
SMS / WhatsApp Provider: AiSensy (Campaign API v2)  
Database: PostgreSQL / Supabase  

---

## Executive Summary

| Category | Total Count | ACTIVE_VERIFIED | APPROVED_NOT_RUNTIME_VERIFIED | READY_FOR_SUBMISSION | PROVIDER_CAMPAIGN_MISSING | REJECTED (Burned) | BLOCKED |
|---|---|---|---|---|---|---|---|
| **Attendance** | 3 | 1 (`smartark_attendance_absent`) | 1 (`smartark_attendance_corrected`) | 1 (`attendance_present`) | 0 | 0 | 0 |
| **Fees** | 2 | 1 (`smartark_fee_receipt`) | 0 | 1 (`fee_due`) | 0 | 0 | 0 |
| **Credentials** | 2 | 0 | 0 | 2 (`smartark_staff_account_ready`, `smartark_parent_account_ready`) | 1 legacy (`staff_credentials`) | 2 (`smartark_staff_credentials1`, `smartark_student_credentials1`) | 0 |
| **Exams** | 2 | 0 | 0 | 2 (`smartark_exam_result`, `smartark_exam_reminder`) | 0 | 0 | 0 |
| **Birthday** | 1 | 0 | 0 | 1 (`smartark_birthday_wish`) | 0 | 0 | 0 |
| **Admission & Leads** | 10 | 4 legacy (`lead_welcome`, `lead_assigned_counselor`, `lead_demo_scheduled_v2`, `demo_scheduled`) | 0 | 7 (`smartark_lead_*`) | 1 (`inquiry_followup`) | 0 | 1 (`admission_completed` missing trigger) |
| **Payroll** | 1 | 0 | 0 | 1 (`smartark_payroll_approved`) | 0 | 0 | 0 |
| **Tasks** | 2 | 0 | 0 | 2 (`smartark_task_assigned`, `smartark_task_reminder`) | 0 | 0 | 0 |
| **Certificates** | 1 | 0 | 0 | 0 | 0 | 0 | 1 (`certificate_ready` client-only) |
| **Live Classes & Holidays** | 3 | 0 | 0 | 1 (`live_class_created`) | 0 | 0 | 2 (`holiday_notice` no table, `class_cancelled` superseded) |
| **Academics & Faculty** | 12 | 0 | 0 | 12 (`smartark_academic_*`) | 0 | 0 | 0 |
| **Public Website Forms** | 2 | 0 | 0 | 2 (`smartark_platform_lead_alert`, `smartark_public_form_ack`) | 0 | 0 | 0 |
| **Total** | **41** | **6** | **1** | **32** | **2** | **2** | **4** |

---

## Template Status Definitions

- **ACTIVE_VERIFIED**: Meta approved, AiSensy campaign active, runtime delivery confirmed with provider message ID and actual recipient delivery evidence.
- **APPROVED_BUT_NOT_RUNTIME_VERIFIED**: Meta approved alongside active campaigns, but has not yet processed a live runtime delivery in production.
- **READY_FOR_SUBMISSION**: Fully designed with positional multi-tenant parameter contract (`org_name` trailing), pure UTILITY classification, and ready for operator AiSensy submission.
- **PROVIDER_CAMPAIGN_MISSING**: The campaign was configured or referenced, but AiSensy returns `HTTP 400: Campaign does not exist`. Dispatches are permanently blocked to prevent burning quotas.
- **REJECTED**: Meta rejected the template design (e.g. plaintext passwords). Campaign name is permanently burned by Meta and cannot be reused.
- **BLOCKED_BY_CONFIGURATION / BLOCKED**: Missing core database tables (e.g. `holidays`), client-side localStorage backing (e.g. `certificates`), or untriggered code path.

---

## 1. Attendance Templates

### 1.1 Student Marked Absent
- **Internal Event Key:** `attendance_absent`
- **Human-Readable Event Name:** Student marked absent
- **Internal Template Key:** `attendance_absent`
- **Provider Campaign Name:** `smartark_attendance_absent`
- **Legacy Campaign Name:** `ark_attendance_absent`
- **Current Application Status:** `ACTIVE_VERIFIED`
- **Provider Evidence:** 13 delivered via `ark_attendance_absent` (ARK); 1+ delivered via `smartark_attendance_absent` (abc-academi on 2026-08-13). Message ID confirmed.
- **Current Message Body:**
  ```text
  Dear {{1}},

  This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.

  If your child was present or if this attendance was marked incorrectly, please contact the school office.

  Thank you,
  {{6}}
  ```
- **Declared Parameter Names:** `["parent_name", "student_name", "class", "section", "attendance_date", "org_name"]`
- **Positional Order:** `{{1}} parent_name`, `{{2}} student_name`, `{{3}} class`, `{{4}} section`, `{{5}} attendance_date`, `{{6}} org_name`
- **Builder Implementation:** `attendanceWhatsapp.service.ts` + `templateParams.ts:smartark_attendance_absent`
- **Send Call Sites:** `src/features/attendance/automation/services/attendanceWhatsapp.service.ts` -> `Submit Attendance` flow -> `send-aisensy [DIRECT]`
- **Branding Source:** Authenticated organization context (`org_name` resolved from `organization_id` via `orgContextService`)
- **Channel Configuration:** `whatsapp` (Immediate)
- **Per-Organization Setting:** `comms_automation_settings.enabled` (default `true`)
- **Quiet-Hours Behaviour:** Real-time event; deferred to `quiet_end` if within quiet window, never dropped.
- **Communication Preference:** Honours student/parent `communication_preferences` where present.
- **Recipient Resolution:** Synchronously resolved from student attendance records (`guardian_phone` / `emergency_contact_phone`).
- **Queue Insertion Behaviour:** Sent direct synchronously via `send-aisensy direct`.
- **Provider Dispatch Behaviour:** Synchronous POST to AiSensy Campaign API v2.
- **Retry / Idempotency:** Managed by caller using `safeInsert` / idempotency check.
- **Delivery Audit:** Audited in `comms_audit` under `entity_type: "attendance"`.
- **Tests Covering:** `providerTemplates.test.ts`, `orgBranding.test.ts`, `whatsappMasterReadiness.test.ts`.
- **Defects / Limitations:** None. Fully operational.
- **Recommended Action:** Preserve active status byte-for-byte.

### 1.2 Attendance Corrected
- **Internal Event Key:** `attendance_corrected`
- **Human-Readable Event Name:** Attendance corrected to present
- **Internal Template Key:** `attendance_corrected`
- **Provider Campaign Name:** `smartark_attendance_corrected`
- **Legacy Campaign Name:** `ark_attendance_corrected`
- **Current Application Status:** `APPROVED_BUT_NOT_RUNTIME_VERIFIED`
- **Provider Evidence:** Approved alongside `smartark_attendance_absent`. No correction has yet been submitted in production.
- **Current Message Body:**
  ```text
  Dear {{1}},

  This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.

  Thank you.

  {{4}}
  ```
- **Declared Parameter Names:** `["parent_name", "student_name", "attendance_date", "org_name"]`
- **Positional Order:** `{{1}} parent_name`, `{{2}} student_name`, `{{3}} attendance_date`, `{{4}} org_name`
- **Builder Implementation:** `attendanceWhatsapp.service.ts` + `templateParams.ts:smartark_attendance_corrected`
- **Send Call Sites:** `src/features/attendance/automation/services/attendanceWhatsapp.service.ts` -> Correction button
- **Branding Source:** Authenticated tenant context (`org_name`)
- **Channel Configuration:** `whatsapp` (Immediate)
- **Per-Organization Setting:** `comms_automation_settings.enabled` (default `true`)
- **Quiet-Hours Behaviour:** Evaluated per organization.
- **Recipient Resolution:** Resolved from attendance record parent phone.
- **Queue Insertion Behaviour:** Direct synchronous dispatch via `send-aisensy`.
- **Delivery Audit:** Audited in `comms_audit`.
- **Tests Covering:** `providerTemplates.test.ts`, `providerCampaigns.test.ts`.
- **Recommended Action:** Ready for live operator verification on test correction.

### 1.3 Student Marked Present
- **Internal Event Key:** `attendance_present`
- **Human-Readable Event Name:** Student marked present
- **Internal Template Key:** `attendance_present`
- **Provider Campaign Name:** `attendance_present`
- **Current Application Status:** `BLOCKED` (Untriggered in code)
- **Provider Evidence:** HTTP 400 "Template params does not match the campaign" on 2026-07-14.
- **Current Message Body:** Builtin single-body broadcast.
- **Missing Functionality:** Submit Attendance only dispatches `absent` and `corrected`. Nothing in application calls `attendance_present`.
- **Recommended Action:** Keep disabled by default until institute requests present notifications.

---

## 2. Fee Management Templates

### 2.1 Fee Paid Receipt
- **Internal Event Key:** `fee_paid`
- **Human-Readable Event Name:** Fee paid receipt
- **Internal Template Key:** `fee_receipt`
- **Provider Campaign Name:** `smartark_fee_receipt`
- **Legacy Campaign Name:** `fee_receipt`
- **Current Application Status:** `ACTIVE_VERIFIED`
- **Provider Evidence:** 237 delivered via legacy `fee_receipt`; 11 delivered via `smartark_fee_receipt` across both live tenants.
- **Current Message Body:**
  ```text
  Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).
  Receipt No: {{4}}
  Amount Paid: ₹{{5}}
  Pending Balance: ₹{{6}}
  Thank you. — {{7}}
  ```
- **Declared Parameter Names:** `["parent_name", "student_name", "class", "receipt_no", "amount_paid", "pending_balance", "org_name"]`
- **Positional Order:** `{{1}} parent_name`, `{{2}} student_name`, `{{3}} class`, `{{4}} receipt_no`, `{{5}} amount_paid`, `{{6}} pending_balance`, `{{7}} org_name`
- **Builder Implementation:** `feeReceiptDelivery.service.ts` + `templateParams.ts:smartark_fee_receipt`
- **Send Call Sites:** `src/features/fee/services/feeReceiptDelivery.service.ts` -> Payment collection
- **Branding Source:** Authenticated tenant context (`org_name`)
- **Channel Configuration:** `both` (WhatsApp + Email)
- **Per-Organization Setting:** `comms_automation_settings.enabled`
- **Queue Insertion Behaviour:** Enqueued in `message_queue` and drained by `send-aisensy`.
- **Delivery Audit:** Audited in `comms_audit` and `fee_receipt_logs`.
- **Tests Covering:** `providerCampaigns.test.ts`, `providerTemplates.test.ts`.
- **Recommended Action:** Preserve active status.

### 2.2 Fee Due Reminder
- **Internal Event Key:** `fee_due`
- **Human-Readable Event Name:** Fee due reminder
- **Internal Template Key:** `fee_due_reminder`
- **Provider Campaign Name:** `fee_due` (Proposed: `smartark_fee_due_reminder`)
- **Current Application Status:** `READY_FOR_SUBMISSION`
- **Provider Evidence:** 25 historical queue attempts failed at validation ("no destination phone"). Campaign never verified at provider.
- **Recommended Action:** Submit `smartark_fee_due_reminder` as UTILITY.

---

## 3. Credential Templates & Secure Replacements

### 3.1 Staff Credentials (Legacy & Rejected)
- **Internal Event Key:** `staff_credentials`
- **Human-Readable Event Name:** Staff account ready
- **Legacy Campaign Name:** `staff_credentials` -> `PROVIDER_CAMPAIGN_MISSING` (HTTP 400 "Campaign does not exist" across all 6 production attempts).
- **Previous Attempt:** `smartark_staff_credentials1` -> `REJECTED` by Meta (2026-08-13) due to plaintext passwords in utility category.
- **Secure Replacement Campaign:** `smartark_staff_account_ready`
- **Status:** `READY_FOR_SUBMISSION`
- **Category:** `UTILITY`
- **Body:**
  ```text
  Dear {{1}},

  Your staff portal account for {{4}} is now ready.

  Role: {{2}}
  Sign-in URL: {{3}}

  Please visit the link above to verify your account and set your secure password. For security reasons, your organization will never send your password in a message.

  Regards,
  {{4}}
  ```
- **Ordered Parameters:** `{{1}} staff_name`, `{{2}} role`, `{{3}} login_url`, `{{4}} org_name`
- **Security Rule:** Zero passwords in WhatsApp body, message queue payload, or audit logs.

### 3.2 Student / Parent Credentials (Legacy & Rejected)
- **Internal Event Key:** `student_credentials`
- **Human-Readable Event Name:** Parent Portal account ready
- **Legacy Campaign Name:** `parent_credentials` -> `UNVERIFIED`
- **Previous Attempt:** `smartark_student_credentials1` -> `REJECTED` by Meta (2026-08-13) due to plaintext passwords.
- **Secure Replacement Campaign:** `smartark_parent_account_ready`
- **Status:** `READY_FOR_SUBMISSION`
- **Category:** `UTILITY`
- **Body:**
  ```text
  Dear {{1}},

  The Parent Portal account for {{2}} at {{4}} is now ready.

  Sign-in URL: {{3}}

  Please visit the link above to access the portal and set your password. Never share your security credentials with anyone.

  Regards,
  {{4}}
  ```
- **Ordered Parameters:** `{{1}} parent_name`, `{{2}} student_name`, `{{3}} login_url`, `{{4}} org_name`

---

## 4. Lead CRM & Admission Funnel

| Internal Key | Human Name | Legacy Campaign | Proposed AiSensy Campaign | Category | Variables Order | Status |
|---|---|---|---|---|---|---|
| `lead_enquiry_received` | Lead welcome | `lead_welcome` (VERIFIED, branded) | `smartark_lead_enquiry_received` | UTILITY | `student_name`, `course_name`, `org_name` | READY_FOR_SUBMISSION |
| `lead_assigned` | Counselor assigned | `lead_assigned_counselor` (VERIFIED, branded) | `smartark_lead_assigned` | UTILITY | `counselor_name`, `student_name`, `course_name`, `mobile_number`, `org_name` | READY_FOR_SUBMISSION |
| `lead_followup_due` | Follow-up due | `lead_followup_reminder` (UNVERIFIED) | `smartark_lead_followup_due` | UTILITY | `counselor_name`, `student_name`, `course_name`, `org_name` | READY_FOR_SUBMISSION |
| `lead_sla_breach` | SLA breach alert | `sla_breach_alert` (UNVERIFIED) | `smartark_lead_sla_breach` | UTILITY | `counselor_name`, `student_name`, `course_name`, `org_name` | READY_FOR_SUBMISSION |
| `demo_scheduled` | Demo scheduled | `lead_demo_scheduled_v2` (VERIFIED, branded) | `smartark_lead_demo_scheduled` | UTILITY | `student_name`, `course_name`, `demo_date`, `demo_time`, `faculty_name`, `org_name` | READY_FOR_SUBMISSION |
| `demo_reminder` | Demo reminder | `lead_demo_reminder_v2` (UNVERIFIED) | `smartark_lead_demo_reminder` | UTILITY | `student_name`, `course_name`, `demo_date`, `demo_time`, `org_name` | READY_FOR_SUBMISSION |
| `admission_completed` | Admission completed | `lead_admission_completed_v2` (UNVERIFIED) | `smartark_lead_admission_confirmed` | UTILITY | `parent_name`, `student_name`, `course_name`, `org_name` | READY_FOR_SUBMISSION |
| `inquiry_followup` | Enquiry follow-up | `inquiry_followup` (MISSING - HTTP 400) | Superseded by `smartark_lead_followup_due` | UTILITY | N/A | DEAD_CAMPAIGN |

---

## 5. Academics, Allocation & Operations

All academic notifications notify teachers (staff kind) or coordinators.
All 12 templates are defined in `whatsappTemplates.ts` with `{{org_name}}` sign-off and are ready for AiSensy creation:

1. `teacher_class_scheduled`: Class scheduled notification for faculty.
2. `teacher_class_rescheduled`: Class rescheduled notification for faculty.
3. `teacher_class_cancelled`: Class cancellation alert for faculty.
4. `teacher_extra_class`: Extra class assignment alert.
5. `teacher_substitute_assigned`: Substitute teacher assignment alert.
6. `class_reminder_faculty`: 15-minute class start alert for faculty.
7. `class_reminder_coordinator`: 5-minute unstarted class alert for coordinator.
8. `class_started`: Real-time class go-live alert.
9. `class_ended`: Real-time class wrap-up alert with recorded teaching duration.
10. `class_attendance_due`: 10-minute warning before class end if attendance is missing.
11. `class_attendance_missing`: Post-class alert if attendance was never submitted.
12. `class_cancelled_students`: Urgent cancellation alert sent to students and parents.

---

## 6. Blocked Events & Root Causes

1. **`holiday_notice`**: Blocked (`BLOCKED`). No `holidays` table exists in Supabase schema. Code explicitly refuses to invent festival schedules.
2. **`certificate_ready`**: Blocked (`BLOCKED`). Certificates are currently localStorage-backed in frontend (`ModuleStarterPage`). No server-side trigger event exists.
3. **`admission_completed`**: Untriggered (`KNOWN_UNTRIGGERED`). The student admission wizard completes without triggering `commsDispatcher.dispatch("admission_completed")`. Lead CRM handles its own admission messaging on a separate path.
4. **`class_cancelled`**: Superseded (`KNOWN_UNTRIGGERED`). Superseded by `class_cancelled_students`.
