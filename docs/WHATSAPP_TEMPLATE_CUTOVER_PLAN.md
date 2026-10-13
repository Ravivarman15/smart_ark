# Smart ARK — WhatsApp Template Cutover & Rollback Plan

Controlled, zero-downtime cutover protocol for transitioning WhatsApp communications from
legacy single-tenant campaigns to approved multi-tenant `smartark_` templates.

Plan Date: 2026-10-12  
Architecture: State-governed `resolveCampaign()` routing with automatic legacy fallback  

---

## 1. Cutover Lifecycle Architecture

The system uses an explicit 4-state lifecycle model defined in `src/features/communication/constants/providerTemplates.ts`:

```
┌────────────────────────┐      Operator Submits      ┌──────────────────────┐
│  READY_FOR_SUBMISSION  │  ────────────────────────> │      SUBMITTED       │
└────────────────────────┘                            └──────────────────────┘
                                                                 │
                                                                 │ Meta Approves
                                                                 ▼
┌────────────────────────┐      Operator Flips        ┌──────────────────────┐
│         ACTIVE         │  <──────────────────────── │       APPROVED       │
└────────────────────────┘     (After Dry-Run Test)   └──────────────────────┘
      │ (Traffic routed to                                   │ (Traffic routed to
      │  smartark_ campaign)                                 │  legacyCampaign)
```

### The Safety Invariant
`resolveCampaign(templateKey)` routes to the organization-neutral `smartark_` campaign **ONLY when status === "ACTIVE"**.
For every other status (`READY_FOR_SUBMISSION`, `SUBMITTED`, `APPROVED`, `REJECTED`), `resolveCampaign()` returns `legacyCampaign`.
Production traffic cannot cut over accidentally. Cutover requires an explicit, deliberate operator edit.

---

## 2. Phase-by-Phase Cutover Sequences

### Phase 1: Already Cut Over & Active (Verified)
- `smartark_attendance_absent`: Cut over and verified across both ARK and ABC Academi.
- `smartark_fee_receipt`: Cut over and verified across both ARK and ABC Academi.
- `smartark_attendance_corrected`: Meta approved. Awaiting live correction event.

### Phase 2: Credential Template Cutover (High Priority)
**Problem:** Legacy `staff_credentials` returns HTTP 400 (does not exist at AiSensy). `smartark_staff_credentials1` and `smartark_student_credentials1` were rejected due to plaintext passwords.
**Solution:** `smartark_staff_account_ready` and `smartark_parent_account_ready`.

#### Cutover Steps:
1. **AiSensy Submission:**
   - Operator creates `smartark_staff_account_ready` (Category: UTILITY, 4 variables) using body from `docs/AISENSY_TEMPLATE_SUBMISSION_CATALOG.md` §3.1.
   - Operator creates `smartark_parent_account_ready` (Category: UTILITY, 4 variables) using body from `docs/AISENSY_TEMPLATE_SUBMISSION_CATALOG.md` §3.2.
2. **Meta Review:**
   - Await Meta approval notification in AiSensy dashboard (~5–30 minutes).
3. **Controlled Single-Recipient Test:**
   - Use `test-tenant` or explicitly designated test staff/parent phone.
   - Trigger a single test account creation.
   - Verify: 4 parameters received, sign-off is dynamic `org_name`, login link works, zero password sent.
4. **Activation:**
   - In `src/features/communication/constants/providerTemplates.ts`, update `status: "ACTIVE"`.
   - Update `CAMPAIGN_LEDGER` in `providerCampaigns.ts` to `existence: "VERIFIED"`.
   - Run `npx vitest run src/features/communication/testing/`.
   - Deploy code.
5. **Rollback:**
   - If issues arise, change status back to `"APPROVED"`. Email credentials (via Brevo) remain functional as parallel channel.

---

### Phase 3: Lead CRM & Enquiry Funnel Cutover
**Problem:** Four legacy campaigns (`lead_welcome`, `lead_assigned_counselor`, `lead_demo_scheduled_v2`, `demo_scheduled`) function correctly, but hardcode ARK Learning Arena's name for all tenants.
**Solution:** The 7 `smartark_lead_*` campaigns.

#### Cutover Steps:
1. **AiSensy Submission:**
   - Operator creates the 7 campaigns in AiSensy dashboard:
     - `smartark_lead_enquiry_received`
     - `smartark_lead_assigned`
     - `smartark_lead_followup_due`
     - `smartark_lead_sla_breach`
     - `smartark_lead_demo_scheduled`
     - `smartark_lead_demo_reminder`
     - `smartark_lead_admission_confirmed`
2. **Meta Approval:**
   - Wait for Meta approval in AiSensy dashboard.
3. **Batch Validation:**
   - Run test lead intake in test tenant (`54383101-e331-4195-abd8-897b3cdfa93e`).
   - Confirm AiSensy returns `HTTP 200` with valid `messageId`.
4. **Activation:**
   - Update `status: "ACTIVE"` for the 7 templates in `providerTemplates.ts`.
   - Update `CAMPAIGN_LEDGER` to `VERIFIED`.
   - Deploy code.
5. **Rollback:**
   - Revert `status` to `"READY_FOR_SUBMISSION"`. Traffic immediately returns to legacy campaigns.

---

### Phase 4: Academic Notifications Cutover
1. **Operator Submits:**
   - Submit the 12 academic utility templates in AiSensy as detailed in `docs/AISENSY_TEMPLATE_SUBMISSION_CATALOG.md` §5.
2. **Activation:**
   - Once approved, register in `PROVIDER_TEMPLATES` with `status: "ACTIVE"`.

---

## 3. Rollback Runbook

If any newly activated campaign encounters provider errors (e.g. HTTP 400 parameter count mismatch or carrier bounce):

1. **Immediate Circuit Breaker:**
   - Open `src/features/communication/constants/providerTemplates.ts`.
   - Change the template's `status` from `"ACTIVE"` to `"APPROVED"`.
   - This causes `resolveCampaign()` to fall back to `legacyCampaign` immediately on the next message enqueue.
2. **Queue Drain Safety:**
   - Any message already sitting in `message_queue` with the failing campaign name will either retry (transient) or fail permanently without corrupting database state.
   - If an event was disabled in settings, `send-aisensy` automatically cancels it with `event_disabled_after_enqueue`.
3. **Verification:**
   - Check `comms_audit` table:
     ```sql
     SELECT action, payload, created_at FROM comms_audit
     WHERE entity_type = 'queue' ORDER BY created_at DESC LIMIT 20;
     ```
