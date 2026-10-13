# Smart ARK — AiSensy Template Submission Catalog

Copy-ready template bodies, variable specifications, synthetic test examples, rendered message previews,
and Meta UTILITY classification rationales for operator submission into AiSensy.

Catalog Date: 2026-10-12  
Category Standard: Meta WhatsApp Business Platform UTILITY Category  
Language: English (`en`)  

---

## Meta WhatsApp Compliance Rules Enforced

Every template in this catalog strictly complies with Meta's official WhatsApp Business Platform rules:
1. **Never starts with a variable**: Begins with static greeting or title text (`Dear {{1}},`, `Notice:`, `Faculty Alert:`).
2. **Never ends with a variable (No Dangling Parameters)**: The trailing variable is always anchored by literal closing text (`{{n}} Team.`, `{{n}} Administration.`, `{{n}} Accounts Team.`).
3. **No repeated variables**: Every placeholder number `{{1}}`, `{{2}}`, ..., `{{n}}` appears **exactly once**.
4. **Strict ascending sequence**: Placeholders follow strict consecutive order `1, 2, 3, ..., n` without skips or inversions.
5. **Universal Multi-Tenancy**: The final placeholder `{{n}}` is always `org_name`, enabling identical templates to dynamically serve any school, academy, or coaching institute without modification.
6. **Zero authentication secrets**: No plaintext passwords or temporary PINs. All onboarding points to verified web portals.

---

## Group 1: Attendance Servicing

### 1.1 Student Marked Absent
> [!IMPORTANT]
> **EXISTING APPROVED & ACTIVE CAMPAIGN — DO NOT RESUBMIT OR MODIFY**  
> **Status:** `ACTIVE_VERIFIED` (Delivered across ARK and ABC Academi)  
> **Meta Approved Body:** Approved by Meta on 2026-08-13. Production verified. Do not alter or resubmit.

- **Internal Event Key:** `attendance_absent`
- **Human-Readable Name:** Student marked absent
- **Exact AiSensy Campaign Name:** `smartark_attendance_absent`
- **Recommended Category:** `UTILITY` (Direct attendance status update)
- **Status:** `ACTIVE_VERIFIED`
- **Exact Approved Template Body (Do NOT Resubmit):**
  ```text
  Dear {{1}},

  This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.

  If your child was present or if this attendance was marked incorrectly, please contact the school office.

  Thank you,
  {{6}}
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `parent_name` | Verified guardian record | Yes | Mr. Rajesh Sharma |
  | `{{2}}` | `student_name` | Verified student profile | Yes | Aarav Sharma |
  | `{{3}}` | `class` | Enrolled batch / standard | Yes | Class 10 |
  | `{{4}}` | `section` | Batch section | Yes | Section A |
  | `{{5}}` | `attendance_date` | Attendance calendar date | Yes | 12 Oct 2026 |
  | `{{6}}` | `org_name` | Authenticated tenant profile | Yes | ARK Learning Arena |
- **Rendered Example:**
  ```text
  Dear Mr. Rajesh Sharma,

  This is to inform you that Aarav Sharma (Class 10 - Section A) was marked ABSENT on 12 Oct 2026.

  If your child was present or if this attendance was marked incorrectly, please contact the school office.

  Thank you,
  ARK Learning Arena
  ```
- **Rollback:** Fallback to legacy `ark_attendance_absent`.

---

### 1.2 Attendance Corrected to Present
> [!IMPORTANT]
> **EXISTING APPROVED CAMPAIGN — DO NOT RESUBMIT OR MODIFY**  
> **Status:** `APPROVED_BUT_NOT_RUNTIME_VERIFIED` (Approved by Meta)  
> **Meta Approved Body:** Approved by Meta on 2026-08-13. Do not alter or resubmit.

- **Internal Event Key:** `attendance_corrected`
- **Human-Readable Name:** Attendance corrected to present
- **Exact AiSensy Campaign Name:** `smartark_attendance_corrected`
- **Recommended Category:** `UTILITY` (Correction of record)
- **Status:** `APPROVED_BUT_NOT_RUNTIME_VERIFIED`
- **Exact Approved Template Body (Do NOT Resubmit):**
  ```text
  Dear {{1}},

  This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.

  Thank you.

  {{4}}
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `parent_name` | Verified guardian record | Yes | Mrs. Sunita Patel |
  | `{{2}}` | `student_name` | Verified student profile | Yes | Rohan Patel |
  | `{{3}}` | `attendance_date` | Date of amended attendance | Yes | 12 Oct 2026 |
  | `{{4}}` | `org_name` | Authenticated tenant profile | Yes | ABC Academi |
- **Rendered Example:**
  ```text
  Dear Mrs. Sunita Patel,

  This is to inform you that the attendance for Rohan Patel on 12 Oct 2026 has been corrected to PRESENT.

  Thank you.

  ABC Academi
  ```
- **Rollback:** Fallback to legacy `ark_attendance_corrected`.

---

## Group 2: Fee Collections & Receipts

### 2.1 Fee Paid Receipt
> [!IMPORTANT]
> **EXISTING APPROVED & ACTIVE CAMPAIGN — DO NOT RESUBMIT OR MODIFY**  
> **Status:** `ACTIVE_VERIFIED` (Delivered 237+ legacy, 11+ multi-tenant)  
> **Meta Approved Body:** Approved by Meta on 2026-08-13. Production verified. Do not alter or resubmit.

- **Internal Event Key:** `fee_paid`
- **Human-Readable Name:** Fee paid receipt
- **Exact AiSensy Campaign Name:** `smartark_fee_receipt`
- **Recommended Category:** `UTILITY` (Financial payment receipt)
- **Status:** `ACTIVE_VERIFIED`
- **Exact Approved Template Body (Do NOT Resubmit):**
  ```text
  Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).
  Receipt No: {{4}}
  Amount Paid: ₹{{5}}
  Pending Balance: ₹{{6}}
  Thank you. — {{7}}
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `parent_name` | Payer guardian name | Yes | Mr. Anand Verma |
  | `{{2}}` | `student_name` | Enrolled student name | Yes | Sneha Verma |
  | `{{3}}` | `class` | Enrolled standard | Yes | Grade 9 |
  | `{{4}}` | `receipt_no` | System receipt identifier | Yes | RCP-2026-1042 |
  | `{{5}}` | `amount_paid` | Collected currency amount | Yes | 15,000 |
  | `{{6}}` | `pending_balance` | Remaining balance dues | Yes | 0 |
  | `{{7}}` | `org_name` | Authenticated tenant profile | Yes | ARK Learning Arena |
- **Rendered Example:**
  ```text
  Dear Mr. Anand Verma, we have received a fee payment for Sneha Verma (Class Grade 9).
  Receipt No: RCP-2026-1042
  Amount Paid: ₹15,000
  Pending Balance: ₹0
  Thank you. — ARK Learning Arena
  ```
- **Rollback:** Fallback to legacy `fee_receipt`.

---

### 2.2 Fee Due Reminder
- **Internal Event Key:** `fee_due`
- **Human-Readable Name:** Fee due reminder
- **Exact AiSensy Campaign Name:** `smartark_fee_due_reminder`
- **Recommended Category:** `UTILITY` (Account billing reminder)
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  This is a reminder that a fee payment of ₹{{2}} is due for {{3}} on or before {{4}}.

  Please contact our office if you have any questions regarding this balance.

  Thank you,
  {{5}} Accounts Team.
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `parent_name` | Guardian record | Yes | Mr. Vikram Nair |
  | `{{2}}` | `amount_due` | Pending fee ledger balance | Yes | 8,500 |
  | `{{3}}` | `student_name` | Enrolled student name | Yes | Ananya Nair |
  | `{{4}}` | `due_date` | Fee schedule due date | Yes | 25 Oct 2026 |
  | `{{5}}` | `org_name` | Authenticated tenant profile | Yes | ABC Academi |
- **Rendered Example:**
  ```text
  Dear Mr. Vikram Nair,

  This is a reminder that a fee payment of ₹8,500 is due for Ananya Nair on or before 25 Oct 2026.

  Please contact our office if you have any questions regarding this balance.

  Thank you,
  ABC Academi Accounts Team.
  ```

---

## Group 3: Secure Account Onboarding (Zero Passwords)

### 3.1 Staff Account Ready
- **Internal Event Key:** `staff_credentials`
- **Human-Readable Name:** Staff account ready
- **Exact AiSensy Campaign Name:** `smartark_staff_account_ready`
- **Recommended Category:** `UTILITY` (Neutral account onboarding notice)
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  Your staff portal account has been created successfully.

  Role: {{2}}
  Portal Link: {{3}}

  Please use the link above to set your password and access your account.

  Regards,
  {{4}} Administration.
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `staff_name` | Staff profile name | Yes | Priya Sundaram |
  | `{{2}}` | `role` | System designation/role | Yes | Mathematics Faculty |
  | `{{3}}` | `login_url` | Official secure login URL | Yes | https://portal.smartark.app/login |
  | `{{4}}` | `org_name` | Authenticated tenant profile | Yes | ABC Academi |
- **Rendered Example:**
  ```text
  Dear Priya Sundaram,

  Your staff portal account has been created successfully.

  Role: Mathematics Faculty
  Portal Link: https://portal.smartark.app/login

  Please use the link above to set your password and access your account.

  Regards,
  ABC Academi Administration.
  ```

---

### 3.2 Parent Portal Account Ready
- **Internal Event Key:** `student_credentials`
- **Human-Readable Name:** Parent Portal account ready
- **Exact AiSensy Campaign Name:** `smartark_parent_account_ready`
- **Recommended Category:** `UTILITY` (Neutral parent portal activation notice)
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  The Parent Portal account for {{2}} has been created.

  Portal Link: {{3}}

  Please use the link above to set your password and view academic updates.

  Regards,
  {{4}} Team.
  ```
- **Parameter Specification:**
  | Position | Variable Name | Actual Source | Required | Synthetic Example |
  |---|---|---|---|---|
  | `{{1}}` | `parent_name` | Guardian name | Yes | Mr. Deepak Mehta |
  | `{{2}}` | `student_name` | Enrolled student name | Yes | Aryan Mehta |
  | `{{3}}` | `login_url` | Official parent portal URL | Yes | https://parent.smartark.app/login |
  | `{{4}}` | `org_name` | Authenticated tenant profile | Yes | ARK Learning Arena |
- **Rendered Example:**
  ```text
  Dear Mr. Deepak Mehta,

  The Parent Portal account for Aryan Mehta has been created.

  Portal Link: https://parent.smartark.app/login

  Please use the link above to set your password and view academic updates.

  Regards,
  ARK Learning Arena Team.
  ```

---

## Group 4: Lead CRM & Enquiry Funnel (Multi-Tenant Replacements)

### 4.1 Lead Welcome / Enquiry Received
- **Internal Event Key:** `lead_enquiry_received`
- **Exact AiSensy Campaign Name:** `smartark_lead_enquiry_received`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  We have received your enquiry for {{2}}.

  Our admissions team will review your details and contact you shortly with the information you requested.

  Thank you,
  {{3}} Admissions Team.
  ```
- **Parameters:** `{{1}} student_name`, `{{2}} course_name`, `{{3}} org_name`
- **Rendered Example:**
  ```text
  Dear Rohan,

  We have received your enquiry for NEET Intensive Course.

  Our admissions team will review your details and contact you shortly with the information you requested.

  Thank you,
  ABC Academi Admissions Team.
  ```

### 4.2 Lead Assigned to Academic Counselor
- **Internal Event Key:** `lead_assigned`
- **Exact AiSensy Campaign Name:** `smartark_lead_assigned`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  A new enquiry has been assigned to you.

  Student: {{2}}
  Course: {{3}}
  Contact: {{4}}

  Please respond within your agreed follow-up window and update the enquiry record once you have made contact.

  Thank you,
  {{5}} Team.
  ```
- **Parameters:** `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`, `{{4}} mobile_number`, `{{5}} org_name`

### 4.3 Lead Follow-Up Due
- **Internal Event Key:** `lead_followup_due`
- **Exact AiSensy Campaign Name:** `smartark_lead_followup_due`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  A follow-up is pending on the enquiry from {{2}} for {{3}}.

  This enquiry is still awaiting your response. Please contact them and update the enquiry record.

  Thank you,
  {{4}} Team.
  ```
- **Parameters:** `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`, `{{4}} org_name`

### 4.4 Lead SLA Breach Alert
- **Internal Event Key:** `lead_sla_breach`
- **Exact AiSensy Campaign Name:** `smartark_lead_sla_breach`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  The enquiry from {{2}} for {{3}} has passed its agreed response time.

  Please contact them at the earliest and record the outcome against the enquiry.

  Thank you,
  {{4}} Team.
  ```
- **Parameters:** `{{1}} counselor_name`, `{{2}} student_name`, `{{3}} course_name`, `{{4}} org_name`

### 4.5 Demo Class Scheduled
- **Internal Event Key:** `demo_scheduled`
- **Exact AiSensy Campaign Name:** `smartark_lead_demo_scheduled`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  Your demo session for {{2}} is confirmed.

  Date: {{3}}
  Time: {{4}}
  Faculty: {{5}}

  Please arrive ten minutes before the scheduled time. To reschedule, reply to this message or contact the office.

  Thank you,
  {{6}} Admissions Team.
  ```
- **Parameters:** `{{1}} student_name`, `{{2}} course_name`, `{{3}} demo_date`, `{{4}} demo_time`, `{{5}} faculty_name`, `{{6}} org_name`

### 4.6 Demo Class 24h Reminder
- **Internal Event Key:** `demo_reminder`
- **Exact AiSensy Campaign Name:** `smartark_lead_demo_reminder`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  This is a reminder of your demo session for {{2}}.

  Date: {{3}}
  Time: {{4}}

  To reschedule, reply to this message or contact the office.

  Thank you,
  {{5}} Admissions Team.
  ```
- **Parameters:** `{{1}} student_name`, `{{2}} course_name`, `{{3}} demo_date`, `{{4}} demo_time`, `{{5}} org_name`

### 4.7 Admission Confirmed
- **Internal Event Key:** `admission_completed`
- **Exact AiSensy Campaign Name:** `smartark_lead_admission_confirmed`
- **Recommended Category:** `UTILITY`
- **Status:** `READY_FOR_SUBMISSION`
- **Exact Copy-Ready Template Body:**
  ```text
  Dear {{1}},

  The admission of {{2}} for {{3}} is now complete.

  The enrolment record has been created. Fee and schedule details will be shared with you separately.

  Thank you,
  {{4}} Administration.
  ```
- **Parameters:** `{{1}} parent_name`, `{{2}} student_name`, `{{3}} course_name`, `{{4}} org_name`

---

## Group 5: Academic & Operations Notifications

| Event Key | Campaign Name | Category | Exact Copy-Ready Body | Ordered Parameters |
|---|---|---|---|---|
| `teacher_class_scheduled` | `smartark_teacher_class_scheduled` | UTILITY | `Dear {{1}},\n\nA class for {{2}} has been scheduled on {{3}} from {{4}} to {{5}} in Room {{6}}.\n\nRegards,\n{{7}} Academic Office.` | `faculty_name`, `subject`, `date`, `start_time`, `end_time`, `room`, `org_name` |
| `teacher_class_rescheduled` | `smartark_teacher_class_rescheduled` | UTILITY | `Dear {{1}},\n\nYour class for {{2}} has been rescheduled to {{3}} from {{4}} to {{5}} in Room {{6}}.\n\nRegards,\n{{7}} Academic Office.` | `faculty_name`, `subject`, `date`, `start_time`, `end_time`, `room`, `org_name` |
| `teacher_class_cancelled` | `smartark_teacher_class_cancelled` | UTILITY | `Dear {{1}},\n\nYour class for {{2}} on {{3}} ({{4}}) has been cancelled.\n\nRegards,\n{{5}} Academic Office.` | `faculty_name`, `subject`, `date`, `time`, `org_name` |
| `teacher_extra_class` | `smartark_teacher_extra_class` | UTILITY | `Dear {{1}},\n\nAn extra class for {{2}} has been assigned to you on {{3}} at {{4}} in {{5}}.\n\nRegards,\n{{6}} Academic Office.` | `faculty_name`, `subject`, `date`, `time`, `room`, `org_name` |
| `teacher_substitute_assigned` | `smartark_teacher_substitute_assigned` | UTILITY | `Dear {{1}},\n\nYou have been assigned as substitute faculty for {{2}} on {{3}} at {{4}} in {{5}}.\n\nRegards,\n{{6}} Academic Office.` | `faculty_name`, `subject`, `date`, `time`, `room`, `org_name` |
| `class_reminder_faculty` | `smartark_class_reminder_faculty` | UTILITY | `Dear {{1}},\n\nYour class for {{2}} starts in 15 minutes at {{3}} in {{4}}.\n\nRegards,\n{{5}} Academic Office.` | `faculty_name`, `subject`, `time`, `room`, `org_name` |
| `class_reminder_coordinator` | `smartark_class_reminder_coordinator` | UTILITY | `Coordinator Alert:\n\nThe class for {{1}} (Faculty: {{2}}) has not started and is due at {{3}} in {{4}}.\n\nRegards,\n{{5}} Academic Office.` | `subject`, `faculty_name`, `time`, `room`, `org_name` |
| `class_started` | `smartark_class_started` | UTILITY | `Academic Notice:\n\nClass for {{1}} (Faculty: {{2}}) went live at {{3}} in {{4}}.\n\nRegards,\n{{5}} Academic Office.` | `subject`, `faculty_name`, `time`, `room`, `org_name` |
| `class_ended` | `smartark_class_ended` | UTILITY | `Academic Notice:\n\nClass for {{1}} (Faculty: {{2}}) concluded at {{3}}. Duration: {{4}} hrs.\n\nRegards,\n{{5}} Academic Office.` | `subject`, `faculty_name`, `time`, `duration`, `org_name` |
| `class_attendance_due` | `smartark_class_attendance_due` | UTILITY | `Attendance Reminder:\n\n10 minutes remain in the session for {{1}}. Please complete and submit student attendance.\n\nThank you,\n{{2}} Academic Office.` | `subject`, `org_name` |
| `class_attendance_missing` | `smartark_class_attendance_missing` | UTILITY | `Attendance Alert:\n\nThe session for {{1}} has ended, but student attendance has not been submitted. Please record attendance immediately.\n\nThank you,\n{{2}} Academic Office.` | `subject`, `org_name` |
| `class_cancelled_students` | `smartark_class_cancelled_students` | UTILITY | `Notice to Students and Parents:\n\nThe scheduled class for {{1}} on {{2}} at {{3}} has been cancelled. Please contact the academic office for rescheduled timings.\n\nRegards,\n{{4}} Administration.` | `subject`, `date`, `time`, `org_name` |

---

## Group 6: Academic Milestones & Staff Payroll

| Event Key | Campaign Name | Category | Exact Copy-Ready Body | Ordered Parameters |
|---|---|---|---|---|
| `exam_published` | `smartark_exam_result` | UTILITY | `Dear {{1}},\n\nThe exam results for {{2}} in {{3}} are now published.\n\nMarks Obtained: {{4}} / {{5}}\nGrade: {{6}}\n\nThank you,\n{{7}} Academic Team.` | `parent_name`, `student_name`, `exam_title`, `marks_obtained`, `total_marks`, `grade`, `org_name` |
| `exam_scheduled` | `smartark_exam_reminder` | UTILITY | `Dear {{1}},\n\nThis is a reminder for {{2}} regarding the upcoming exam {{3}} scheduled on {{4}} at {{5}}.\n\nThank you,\n{{6}} Examination Cell.` | `parent_name`, `student_name`, `exam_title`, `exam_date`, `exam_time`, `org_name` |
| `birthday_student` | `smartark_birthday_wish` | UTILITY | `Dear {{1}},\n\nWe wish {{2}} a very happy birthday and a wonderful year ahead filled with learning and success.\n\nWarm regards,\n{{3}} Team.` | `parent_name`, `student_name`, `org_name` |
| `payroll_approved` | `smartark_payroll_approved` | UTILITY | `Dear {{1}},\n\nYour payroll for {{2}} has been approved and processed. Your payslip is available on the staff portal.\n\nRegards,\n{{3}} Accounts Team.` | `staff_name`, `month_year`, `org_name` |
| `task_assigned` | `smartark_task_assigned` | UTILITY | `Dear {{1}},\n\nA new task has been assigned to you.\n\nTask: {{2}}\nDue Date: {{3}}\nPriority: {{4}}\n\nRegards,\n{{5}} Team.` | `assignee_name`, `task_title`, `due_date`, `priority`, `org_name` |
| `task_due` | `smartark_task_reminder` | UTILITY | `Dear {{1}},\n\nThis is a reminder that your assigned task is due soon.\n\nTask: {{2}}\nDue Date: {{3}}\n\nRegards,\n{{4}} Team.` | `assignee_name`, `task_title`, `due_date`, `org_name` |
