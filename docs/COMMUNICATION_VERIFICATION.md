# ARK ERP — Communication Deployment Verification Report

> Objective: make **every existing communication module actually send** through
> the existing centralized engine (`message_queue` / `comms_*` / `send-aisensy` /
> `send-email`). **No duplicate services or tables were created.** This report is
> the audit + the live verification tooling to confirm it end-to-end.

---

## Executive finding

Every communication module is **already fully wired to the real engine.** None of
them are stubs — there is no "Not Implemented / Coming Soon" code to remove. The
modules return errors only because of **infrastructure that isn't provisioned**:
migrations not applied, edge functions not deployed, provider secrets/cron not set.

The unified send path (verified by code trace) is:

```
Send page → SendCampaignPanel → useCommsCampaigns
  → commsCampaignsService.launch()
      → commsTemplatesService.getByKey()      [comms_templates, builtin fallback]
      → renderMessage()                        [template param builder]
      → aisensyService.enqueueBulk()           [INSERT message_queue rows]
      → aisensyService.dispatchViaEdge()       [invoke send-aisensy]
          → send-aisensy edge fn → AiSensy (provider)
              → UPDATE message_queue (sent/failed/retry + provider_message_id)
              → UPDATE comms_campaign_recipients
              → UPDATE lead_whatsapp_logs
              → INSERT comms_audit
          → aisensy-webhook → message_queue.status: delivered / read
```

Credential modules use the same engine **behind a server-side login gate**:

```
Credential page → CredentialSendPanel
  → verify-credentials edge fn  (PROVES the login before sending)
  → renderMessage() → aisensyService.enqueue() → message_queue → send-aisensy
```

---

## PHASE 1 — Infrastructure audit (what the code requires)

Run each verification yourself (these need access to your Supabase project, which
the live **Communication & Credential Health** page now automates — see Phase 4).

| Dependency | Required object | Verify | Status* |
|---|---|---|---|
| **DB: queue** | `message_queue` (+ `retry_count`, `retry_at`, `template_key`, `campaign_id`, `read_at`) | `select to_regclass('public.message_queue')` | ⏳ verify |
| **DB: templates** | `comms_templates` | `select count(*) from comms_templates` (expect ≥ 20 after seed) | ⏳ verify |
| **DB: audit** | `comms_audit` | `select to_regclass('public.comms_audit')` | ⏳ verify |
| **DB: campaign recipients** | `comms_campaigns`, `comms_campaign_recipients` | `to_regclass(...)` | ⏳ verify |
| **DB: lead logs** | `lead_whatsapp_logs` | `to_regclass(...)` | ⏳ verify |
| **Views** | `communication_templates/queue/audit/logs` | apply `20260627_communication_center_aliases.sql` | ⏳ verify |
| **Functions** | `send-aisensy`, `send-email`, `verify-credentials`, `aisensy-webhook` | `supabase functions list` | ⏳ verify |
| **Secrets** | `AISENSY_API_KEY`, `AISENSY_PROJECT_NAME`, `AISENSY_DEFAULT_CAMPAIGN`, `BREVO_API_KEY`, `SENDER_EMAIL` | `supabase secrets list` | ⏳ verify |
| **Storage** | `payslips` bucket (salary-slip PDFs) | Supabase Storage | ⏳ verify |
| **Realtime** | publication on `message_queue` / `lead_whatsapp_logs` (for live dashboards) | Supabase → Database → Replication | ⏳ verify |
| **Cron** | scheduled `send-aisensy` (drain queued + due `retry_at`) every 1–2 min | pg_cron / Scheduled Functions | ⏳ verify |
| **Permissions** | RLS from `20260527_communication_module.sql`; menu/RBAC entries for comms pages | RBAC registry (4 registries) | ✅ present in code |

*Status is "⏳ verify" because live DB/secret state cannot be read from the repo —
the Phase 4 health page checks these at runtime.

---

## PHASE 2 — Module audit matrix

| Module (menu) | Service called | Template (`comms_templates` key) | Queue | Edge fn | Provider | Log tables | Retry | Audit | Delivery tracking |
|---|---|---|---|---|---|---|---|---|---|
| Send SMS To Inquiry | commsCampaigns.launch → aisensy.enqueueBulk | `inquiry_followup` | message_queue | send-aisensy | AiSensy | message_queue, comms_campaign_recipients, comms_audit | ✅ | ✅ | webhook |
| Send SMS To Student | ″ | `student_welcome` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send SMS To Staff | ″ | `staff_welcome` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send Staff ID / Password | CredentialSendPanel → verify-credentials → aisensy.enqueue | `staff_credentials` | message_queue | verify-credentials + send-aisensy | AiSensy | message_queue, comms_audit | ✅ | ✅ | webhook |
| Send Student ID / Password | ″ | `student_credentials` | ″ | ″ | ″ | ″ | ✅ | ✅ | **blocked at gate** (no student auth backend) |
| Send Upcoming Exam SMS | commsCampaigns.launch | `exam_reminder` | message_queue | send-aisensy | AiSensy | as above | ✅ | ✅ | webhook |
| Send Exam Marks SMS | ″ | `exam_result` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send Fee Status SMS | ″ | `fee_status` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send Fee Due Reminder SMS | ″ | `fee_due_reminder` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send Today Absent Attendance | ″ | `attendance_absent` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Send Student Birthday SMS | ″ | `birthday_wish` | ″ | ″ | ″ | ″ | ✅ | ✅ | webhook |
| Credential Health | commsHealth.snapshot + live tests | n/a (diagnostics) | reads message_queue | invokes send-aisensy/send-email | AiSensy/Brevo | reads | tests policy | — | reads |

`✅` = the code path exists and is correct. Live "does it actually deliver" is
confirmed per-module in Phase 8 once the backend is provisioned.

---

## PHASE 3 — Stub removal

**Result: there are no stub implementations.** Every "Send" module already calls
the real engine (Phase 2). The strings you saw ("deploy the function",
skipped/queued-but-not-sent) are **runtime graceful-degradation messages**, not
placeholder code — they appear only when the backend dependency is missing.

➡️ The correct fix is **provisioning (Phases 1/6/7)**, not rewriting modules.
Replacing graceful degradation with hard failures would only make the same
missing-backend produce crashes instead of actionable messages — so we keep the
degradation but the new health page makes the missing dependency explicit and
testable.

---

## PHASE 4 — Credential & System Health (REBUILT — shipped this phase)

`CredentialHealthPage` is rebuilt from a static list into a **live** dashboard:

- **Live tiles:** Pending / Sent / Delivered / Failed / Retrying / Template count,
  Latest successful WhatsApp, Average delivery time, Latest failure + reason.
- **A "migrations not applied" banner** appears automatically when `message_queue`
  is unreachable.
- **Real test buttons** (each executes a real request and shows PASS/FAIL + the
  returned provider/edge response):
  - **Test WhatsApp / AiSensy** → `send-aisensy` debug mode (posts ONE real
    message to AiSensy, no queue write) — proves AiSensy key + campaign.
  - **Test Email / Brevo** → `send-email` with `generic-notice` — proves Brevo.
  - **Test Queue / Edge** → nudges the `send-aisensy` drain — proves the function
    is deployed + DB reachable.
  - **Test Retry Engine** → runs the retry policy (`429/5xx` retry w/ backoff,
    `4xx` permanent, stop after max) — proves the retry logic.

New code (no duplicate engine): `services/commsHealth.service.ts` (read-only
diagnostics + probes), `aisensyService.debugSend()` (reuses send-aisensy),
`hooks/useCommsHealth.ts`.

---

## PHASE 5 — Template verification

- Every module resolves its message from a **`comms_templates` key** (table above)
  via `commsTemplatesService.getByKey()`, falling back to the `BUILTIN_TEMPLATES`
  registry pre-seed. **No module builds a raw message string.**
- The 25-template catalogue is complete (17 comms + 5 lead-domain + 8 added in the
  previous phase). `seedBuiltins()` upserts the registry into `comms_templates`.
- No duplicate templates: lead-domain templates live only in the Lead CRM registry;
  comms templates live only in `whatsappTemplates.ts` / `comms_templates`.

---

## PHASE 6 — Edge function audit

| Function | Purpose | Secrets needed | Retry | Logging |
|---|---|---|---|---|
| `send-aisensy` | Queue drainer + provider POST + retry/backoff + debug test mode | `AISENSY_API_KEY`, `AISENSY_PROJECT_NAME`, `AISENSY_DEFAULT_CAMPAIGN` | ✅ 429/5xx, backoff `[1,5,30]`, max 3 (lockstep with `retryPolicy.ts`) | console + `comms_audit` + `lead_whatsapp_logs` |
| `send-email` | Role-gated Brevo sender, registered templates only | `BREVO_API_KEY`, `SENDER_EMAIL` | provider-level | returns `{ok,status,messageId,error}` |
| `verify-credentials` | Proves staff login before credential send | (Supabase auth) | n/a | returns verify result |
| `aisensy-webhook` | Delivery receipts → `message_queue` sent/delivered/read | `AISENSY_WEBHOOK_SECRET` | n/a | updates queue/log |
| `lead-intake` | Public lead capture (Lead CRM) | — | n/a | lead tables |
| `sla-checker` | SLA breach alerts (Lead CRM) | — | n/a | lead tables |

Deploy/secret/HTTP verification is done live via the Phase 4 test buttons.

---

## PHASE 7 — Provider configuration

| Provider | Channel | Status | Proven by |
|---|---|---|---|
| **AiSensy** | WhatsApp (+ SMS-ready) | configured in code; secrets ⏳ | "Test WhatsApp / AiSensy" |
| **Brevo** | Email | configured in code; secrets ⏳ | "Test Email / Brevo" |
| Future SMS provider | SMS | `CommsChannel` already allows `sms`; no provider wired | — (Phase 3 of build plan) |

---

## PHASE 8 — End-to-end verification (how to run)

The repo cannot reach your live backend, so true end-to-end PASS/FAIL must be run
by you — the health page makes this a few clicks:

1. **Provision** (Phases 1/6/7): `supabase db push`, deploy the 4 functions, set
   secrets, schedule the drain cron.
2. Open **Communication & Credential Health**. The "migrations not applied" banner
   must be gone (queue reachable).
3. Click **Test Retry** → expect PASS (no backend needed).
4. Click **Test Queue / Edge** → expect PASS (`send-aisensy` reachable).
5. Enter a test number → **Test WhatsApp / AiSensy** → expect PASS + AiSensy 200.
6. Enter your email → **Test Email / Brevo** → expect PASS + Brevo messageId.
7. Per module: send to one test recipient, then confirm in SQL:
   ```sql
   select status, provider_message_id, last_error, retry_count, sent_at, delivered_at
   from message_queue order by created_at desc limit 5;
   select action, payload->>'template' from comms_audit order by created_at desc limit 5;
   ```

---

## Final deliverables

### 1. Infrastructure audit — see Phase 1 table.

### 2. Missing-deployment checklist
- [ ] `supabase db push` (apply `20260527_communication_module.sql`, lead WhatsApp migrations, `20260627_communication_center_aliases.sql`)
- [ ] `commsTemplatesService.seedBuiltins()` to populate `comms_templates`
- [ ] Schedule `send-aisensy` drain cron (1–2 min)
- [ ] Configure AiSensy delivery webhook → `aisensy-webhook`
- [ ] Confirm `payslips` storage bucket exists
- [ ] Enable realtime on `message_queue` / `lead_whatsapp_logs` (optional, for live dashboards)

### 3. Secrets checklist
- [ ] `AISENSY_API_KEY` · [ ] `AISENSY_PROJECT_NAME` · [ ] `AISENSY_DEFAULT_CAMPAIGN` · [ ] `AISENSY_WEBHOOK_SECRET`
- [ ] `BREVO_API_KEY` · [ ] `SENDER_EMAIL`

### 4. Functions-deployment checklist
- [ ] `supabase functions deploy send-aisensy`
- [ ] `supabase functions deploy send-email`
- [ ] `supabase functions deploy verify-credentials`
- [ ] `supabase functions deploy aisensy-webhook`

### 5. Working communication matrix — see Phase 2.

### 6. PASS / FAIL table (this change set, local toolchain)

| Item | Result |
|---|---|
| All modules wired to real engine (code) | ✅ PASS |
| No duplicate services/tables created | ✅ PASS |
| Templates sourced from `comms_templates` (no hardcoded) | ✅ PASS |
| Retry engine policy (429/5xx retry, 4xx permanent, backoff) | ✅ PASS (unit-tested) |
| Live health page + 4 real test probes | ✅ PASS (built) |
| `tsc --noEmit` | ✅ PASS |
| `eslint` (changed files) | ✅ PASS |
| `vitest` | ✅ PASS 32/32 |
| `vite build` | ✅ PASS |
| Live AiSensy delivery | 🚀 run via health page after deploy |
| Live Brevo email | 🚀 run via health page after deploy |
| Live queue drain + webhook delivery tracking | 🚀 run after cron + webhook configured |

### 7. Remaining blockers (all infrastructure, none code)
1. **Migrations not applied** → `message_queue` / `comms_*` absent ⇒ enqueue degrades to skipped.
2. **Edge functions not deployed** ⇒ queued rows never drain; credential verify errors.
3. **Secrets / cron not set** ⇒ even deployed functions can't reach providers / never auto-drain.
4. **AiSensy webhook not configured** ⇒ status stops at `sent` (no delivered/read).
5. **Student auth backend absent** ⇒ "Send Student ID/Password" stays blocked at the verify gate by design.

---

**Phase 9 (Communication Center UI) remains deferred** until the above live checks
pass — exactly as instructed.
