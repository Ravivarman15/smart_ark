# Smart ARK — Multi-Tenant Verification & Brand Isolation Report

## 1. Multi-Tenant Architectural Principle

Smart ARK serves multiple educational institutions from a single deployment (e.g. **ARK Learning Arena**, **ABC Academi**, **Zenith International Academy**).

Under Meta WhatsApp Business rules, template messages delivered to a parent must accurately represent the institution the parent's child attends. Sending a message ending in `"Thank you, ARK Learning Arena"` to parents of ABC Academi is a critical privacy and brand leakage defect.

---

## 2. Dynamic Organization Isolation (`{{org_name}}`)

### Anchored Sign-Off Design
Every approved Meta template in the `smartark_` family designates its trailing positional variable `{{n}}` as `org_name`:
- **Absent Notice (`smartark_attendance_absent`)**:
  `... Thank you,\n{{6}}` where `{{6}} = org_name`
- **Attendance Corrected (`smartark_attendance_corrected`)**:
  `... Thank you.\n\n{{4}}` where `{{4}} = org_name`
- **Fee Receipt (`smartark_fee_receipt`)**:
  `... Thank you. — {{7}}` where `{{7}} = org_name`
- **Enquiry Welcome (`smartark_lead_enquiry_received`)**:
  `... Thank you,\n{{3}} Admissions Team.` where `{{3}} = org_name`
- **Fee Due Reminder (`smartark_fee_due_reminder`)**:
  `... Thank you,\n{{5}} Accounts Team.` where `{{5}} = org_name`

### Resolution Pipeline
At trigger and dispatch time:
1. `orgContextService.vars()` resolves the tenant's identity:
   - Primary: `organizations.display_name`
   - Fallback: `organization_branding.app_name`
   - Legal Entity: `organizations.legal_name`
   - System Identifier: `organizations.slug`
2. `commsDispatcherService` injects `orgVars` into `buildAutomatedBatch`.
3. If no organization name is configured, it degrades gracefully to an empty string (`defaultsTo = ""`), never leaking a hardcoded competitor or platform tenant name.

---

## 3. Automated Test Verification

| Test Suite | Assertion Tested | Status |
|---|---|:---:|
| `orgBranding.test.ts` | No template body hardcodes a specific institution | PASS |
| `orgBranding.test.ts` | Templates that sign off use `{{org_name}}` | PASS |
| `orgBranding.test.ts` | Two organizations render two different sign-offs from one template | PASS |
| `orgBranding.test.ts` | Missing org name degrades to blank, never to a fallback tenant | PASS |
| `providerTemplates.test.ts` | `org_name` is always the LAST positional parameter across all templates | PASS |
| `whatsappMasterReadiness.test.ts` | Every template is multi-tenant capable with `org_name` anchored sign-off | PASS |
