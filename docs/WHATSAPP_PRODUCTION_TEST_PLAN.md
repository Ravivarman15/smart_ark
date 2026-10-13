# Smart ARK — WhatsApp Production Test Plan & Verification Protocol

Controlled protocol for testing and verifying WhatsApp communications in production
without modifying ARK protected data or initiating unauthorized broadcasts.

Protocol Date: 2026-10-12  
Designated Test Organization: `testing` (ID: `54383101-e331-4195-abd8-897b3cdfa93e`)  
Protected Production Reference: `ark` (ID: `126a6dd8-6f7e-4b81-9b82-58a9a3b77674` — STRICTLY READ-ONLY)  

---

## 1. Non-Negotiable Test Boundaries

1. **ZERO Modification of Production ARK Data**:
   - Never use ARK as a test tenant.
   - Never insert dummy students, test attendances, or mock fee payments into the ARK organization.
   - Use the designated testing tenant `54383101-e331-4195-abd8-897b3cdfa93e` for end-to-end tests.
2. **ZERO Unapproved Live Dispatches**:
   - An automated test must NEVER post real WhatsApp messages to customer or parent phone numbers.
   - Live sends require an explicitly designated operator phone number and written operator sign-off.
3. **ZERO Background Cron Flushes**:
   - Do NOT activate `comms-scheduler` in `pg_cron` during testing.
   - Do NOT drain the historical production queue to "test" worker speed.

---

## 2. Multi-Stage Verification Hierarchy

| Stage | Scope | Environment | Safety Gate |
|---|---|---|---|
| **Level A: Static Contract Audit** | Parameter arity, ordering, no gaps, Deno mirror parity | Local | `npx vitest run src/features/communication/testing/` |
| **Level B: Pure Unit Logic** | `shouldDispatch`, `validateEnqueue`, secret redaction | Local | Vitest in-memory mocks |
| **Level C: Tenant Isolation** | Multi-tenant branding, settings independence | Local | `whatsappMasterReadiness.test.ts` |
| **Level D: Dry-Run Provider Probe** | `send-aisensy` debug probe with test payload | Edge Function | `POST /send-aisensy { debug: { ... } }` (Never touches queue) |
| **Level E: Controlled Live Send** | 1 approved template, 1 verified test phone, 1 tenant | Production Edge | Operator approval mandatory |
| **Level F: Webhook Delivery Receipt** | Delivery receipt webhook verification | Provider | `lead_whatsapp_logs` / `comms_audit` confirmation |

---

## 3. Controlled Live Verification Protocol (Step-by-Step)

When the operator decides to verify a newly approved campaign (e.g. `smartark_staff_account_ready` or `smartark_attendance_absent`):

### Step 1: Pre-Flight Checklist
- [ ] Tenant selected is `testing` (`54383101-e331-4195-abd8-897b3cdfa93e`).
- [ ] Recipient phone number belongs exclusively to the test operator.
- [ ] Campaign is confirmed APPROVED in the AiSensy dashboard.
- [ ] Operator has executed `node scripts/ark-baseline.mjs` to establish baseline integrity.

### Step 2: Edge Function Debug Probe (Dry Run)
Before queueing any message, test AiSensy API acceptance directly using the Edge Function `debug` mode. This invokes AiSensy server-to-server without touching `message_queue`.

Execute via curl or Postman:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/send-aisensy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-or-jwt>" \
  -d '{
    "debug": {
      "campaignName": "smartark_attendance_absent",
      "destination": "919876543210",
      "templateParams": [
        "Test Parent",
        "Test Student",
        "Class 10",
        "A",
        "12 Oct 2026",
        "Testing Academy"
      ],
      "userName": "Test Operator"
    }
  }'
```

**Evaluation:**
- `responseStatus: 200`: AiSensy accepted parameters and matched campaign.
- `responseStatus: 400`: Parameter mismatch or campaign does not exist. Do not proceed to queue send!

### Step 3: Controlled Single-Message Queue Send
Once debug probe succeeds:
1. In the Communication Center or via `aisensyService.enqueue()`, enqueue exactly ONE message in the `testing` tenant.
2. Verify row created in `message_queue`:
   ```sql
   SELECT id, organization_id, template, recipient_phone, status, payload
   FROM message_queue
   WHERE organization_id = '54383101-e331-4195-abd8-897b3cdfa93e'
   ORDER BY created_at DESC LIMIT 1;
   ```
3. Trigger a manual single-row drain via `send-aisensy`:
   ```bash
   curl -X POST https://<project-ref>.supabase.co/functions/v1/send-aisensy \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <jwt>" \
     -d '{ "limit": 1 }'
   ```
4. Verify results:
   - Recipient device receives the message.
   - Message text displays the test organization name ("Testing Academy"), NOT "ARK Learning Arena".
   - `message_queue.status` transitions from `queued` -> `processing` -> `sent`.
   - `message_queue.provider_message_id` is populated.
   - `comms_audit` has a corresponding `send` record stamped with `organization_id`.
   - If a credential row was sent, verify that `password` was redacted from `message_queue.payload`.

---

## 4. Post-Test Verification
Run the baseline comparison script:
```bash
node scripts/ark-baseline.mjs
```
Confirm:
- ARK student count unchanged.
- ARK attendance count unchanged.
- ARK fee records unchanged.
- ARK message queue unchanged.
- Zero cross-tenant contamination.
