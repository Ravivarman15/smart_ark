# ARK ERP — Enterprise Communication Center

> Status: **Phase 1 delivered & verified locally.** Decision taken: **reuse the
> existing engine** (`comms_*` + `message_queue`), do **not** duplicate it into
> new `communication_*` physical tables. Backend deployment state: **unknown** —
> this doc gives the exact checklist to confirm and finish it.

---

## 1. The key finding

The centralized engine the spec asks us to "build" **already exists** and is
production-grade. It is *not* a Lead-CRM-only system — the Lead CRM is just one
caller of it.

| Spec name (requested) | Already implemented as | Where |
|---|---|---|
| `CommunicationService` | `aisensyService.enqueue()` (channel: `whatsapp \| sms \| in_app`, provider-aware) | `features/communication/services/aisensy.service.ts` |
| `communication_templates` | `comms_templates` (versioned, category, variables, provider, active) | migration `20260527_communication_module.sql` |
| `communication_queue` | `message_queue` (status lifecycle, `retry_count`, `retry_at`, template/campaign links) | same |
| `communication_audit` | `comms_audit` | same |
| `communication_logs` | `lead_whatsapp_logs` + `comms_campaign_recipients` | `20260619/20260620` + comms module |
| Bulk engine | `comms_campaigns` + `comms_campaign_recipients` | comms module |
| Queue + retry engine | `send-aisensy` edge function + `retryPolicy.ts` | `supabase/functions/send-aisensy`, `features/communication/utils/retryPolicy.ts` |
| Template parameter builder | `renderMessage()` + `buildTemplateParams()` | `whatsappTemplates.ts`, leads `templateParams.ts` |

**The Lead CRM (`leadWhatsappService`) is a ~50-line wrapper** over
`aisensyService` + `commsAuditService`. Every other module should call the same
service the same way.

### Why "reuse" not "rebuild"
Creating new `communication_queue` / `communication_logs` tables and migrating
the Lead CRM onto them would **duplicate a working system and risk breaking the
live Lead CRM** — the opposite of the stated quality requirements. Instead,
Phase 1 adds read-only **views** that expose the requested `communication_*`
names over the existing tables (zero data movement, zero risk).

---

## 2. Why the Send modules "only return errors" (diagnosis)

The code is wired correctly and **degrades gracefully** when its backend is
absent — which produces exactly the reported symptoms:

1. **Migrations not applied.** When `message_queue` / `comms_*` don't exist,
   `aisensyService.enqueue()` returns `{ queued: 0, skipped: 1 }` and pages show
   `skipped`. (See `isMissingTable` guards throughout the services.)
2. **Edge functions not deployed.** `credentialsService.verify()` returns
   `"Deploy the verify-credentials edge function."`; `dispatchViaEdge()` resolves
   to `{ dispatched: false }`.
3. **Provider secrets / drain cron missing.** Even with tables + functions, no
   `AISENSY_*` / Brevo secrets and no cron means rows sit in `message_queue` at
   `status='queued'` and never send.

> This is an **infrastructure / deployment** gap, not an architecture gap.

---

## 3. Deployment checklist (run in order)

### 3a. Apply migrations
```bash
supabase db push          # or: supabase migration up
```
Confirm these exist:
```sql
select to_regclass('public.message_queue'),
       to_regclass('public.comms_templates'),
       to_regclass('public.comms_audit'),
       to_regclass('public.lead_whatsapp_logs');
-- after 20260627 aliases:
select to_regclass('public.communication_queue'),
       to_regclass('public.communication_templates');
```

### 3b. Seed templates (single source of truth = TS registry)
From the app (Management), call `commsTemplatesService.seedBuiltins()` — it
upserts all 25 `BUILTIN_TEMPLATES` into `comms_templates` and is safe to re-run.
(Phase 2 wires a "Sync builtins" button into the Template Manager.)

### 3c. Deploy edge functions
```bash
supabase functions deploy send-aisensy
supabase functions deploy send-email
supabase functions deploy verify-credentials
supabase functions deploy aisensy-webhook
```

### 3d. Set secrets
```bash
supabase secrets set AISENSY_API_KEY=...        AISENSY_CAMPAIGN_API=... \
                     AISENSY_PROJECT_NAME=...    AISENSY_WEBHOOK_SECRET=... \
                     BREVO_API_KEY=...
```

### 3e. Schedule the drain cron
A scheduled invocation of `send-aisensy` (e.g. every 1–2 min) to drain queued
rows and process `retry_at` due rows. Configure in Supabase Scheduled Functions
/ pg_cron.

### 3f. Configure the AiSensy webhook
Point the AiSensy delivery webhook at the `aisensy-webhook` function so
`sent → delivered → read` and `provider_message_id` flow back into the queue/log.

---

## 4. PASS / FAIL matrix

Honest status. "Local" = verifiable in this repo now. "Deploy" = requires the
checklist above and cannot be asserted from code alone.

| # | Capability | Status | Evidence / how to verify |
|---|---|---|---|
| 1 | Single centralized engine (reuse) | ✅ Local | `aisensy.service.ts`; Lead CRM + comms both call it |
| 2 | Channels whatsapp / sms / in_app | ✅ Local | `CommsChannel` type; enqueue `channel` field |
| 3 | Email channel | ⚠️ Partial | `send-email` fn exists; not yet a first-class `CommsChannel`. Phase 2 |
| 4 | 25 supported templates | ✅ Local | `BUILTIN_TEMPLATES` (20 here + 5 lead-domain in `leadWhatsappTemplates.ts`) |
| 5 | No hardcoded message strings | ⚠️ Partial | comms module is template-driven; fee/lead have own registries (consolidate Phase 2) |
| 6 | Template parameter builder | ✅ Local | `renderMessage()`, `buildTemplateParams()` |
| 7 | Queue → retry → send → log → audit | ✅ Local (logic) / 🚀 Deploy (live) | `aisensy.service.ts` + `send-aisensy` fn; live send needs §3 |
| 8 | Delivery statuses (queued…cancelled) | ✅ Local | `QueueStatus` + status writes; webhook fills sent/delivered/read on deploy |
| 9 | Retry: 429/5xx only, 4xx never, backoff | ✅ Local | `retryPolicy.ts` (`classifyFailure`, `planAfterFailure`); 32 unit tests pass |
| 10 | Credential send (staff/student, WA/email/both) | ⚠️ Partial / 🚀 Deploy | `credentials.service.ts` + `CredentialSendPanel`; live verify needs `verify-credentials` fn |
| 11 | Communication dashboard | ⚠️ Partial | `commsAnalytics.service` + KPI/analytics components exist; unified page is Phase 2 |
| 12 | Template Manager UI | ❌ Phase 2 | service (`commsTemplates.service`) + picker/preview exist; no CRUD page yet |
| 13 | Bulk (1–20000) queue, progress, pause/resume/cancel | ⚠️ Partial | `enqueueBulk` + `comms_campaigns`; progress UI is Phase 2 |
| 14 | Message preview before send | ✅ Local | `TemplatePreview.tsx`, `renderMessage()` |
| 15 | Credential Health (connections, test buttons) | ⚠️ Partial | `CredentialHealthPage` + `credentialHealth.ts`; provider/queue probes + test buttons Phase 2 |
| 16 | Never silently fail (log + audit + last_error) | ✅ Local | `safeInsert`, `comms_audit`, `last_error`/`provider_response` columns |
| 17 | `communication_*` naming | ✅ Local | views in `20260627_communication_center_aliases.sql` |
| 18 | Lead CRM unaffected | ✅ Local | no Lead CRM files changed; typecheck + build + tests green |

**Toolchain (this change set):**
`tsc --noEmit` ✅ · `eslint` ✅ · `vitest` ✅ 32/32 · `vite build` ✅ 18.97s.

---

## 5. What changed in Phase 1 (inventory)

### Modified files
- `src/features/communication/utils/whatsappTemplates.ts` — added 8 templates to
  complete the 25-template catalogue (`attendance_present`, `holiday_notice`,
  `salary_slip`, `payroll_approved`, `task_assigned`, `task_reminder`,
  `certificate_ready`, `class_cancelled`).

### New migrations
- `supabase/migrations/20260627_communication_center_aliases.sql` — additive,
  idempotent, guarded views: `communication_templates`, `communication_queue`,
  `communication_audit`, `communication_logs`.

### New services / edge functions
- **None.** Phase 1 deliberately reuses `aisensyService`, `commsAuditService`,
  `commsTemplatesService`, `credentialsService`, and the `send-aisensy` /
  `send-email` / `verify-credentials` edge functions unchanged.

### Templates added (8)
`attendance_present`, `holiday_notice`, `salary_slip`, `payroll_approved`,
`task_assigned`, `task_reminder`, `certificate_ready`, `class_cancelled`.
(The other 17 of the 25 already existed: `inquiry_followup`, `student_welcome`,
`staff_welcome`, `staff_credentials`, `student_credentials`, `exam_reminder`,
`exam_result`, `fee_status`, `fee_due_reminder`, `attendance_absent`,
`birthday_wish`, `payment_received`, `parent_credentials`, `password_reset`,
`account_activated`, `account_disabled`, `live_class_notification`; plus the
5 lead-domain templates owned by the Lead CRM.)

---

## 6. Phased plan for the rest (proposed)

Each phase is independently shippable and keeps the Lead CRM untouched.

- **Phase 2 — Surface (UI on the existing engine)**
  - Template Manager page: list/create/edit/version/activate `comms_templates`,
    plus a "Sync builtins" button (`seedBuiltins()`) and live preview.
  - Unified Communication Dashboard: KPIs (queued/sent/delivered/read/failed/
    retrying/skipped), success rate, daily/monthly volume, failure reasons,
    provider response time — backed by `commsAnalytics.service` + `comms_audit`.
  - Credential Health rebuild: AiSensy/Brevo/queue/retry/cron probes + Test
    WhatsApp / Test Email / Test Queue / Test Retry buttons.
  - Bulk progress UI: progress bar + pause/resume/cancel over `comms_campaigns`.

- **Phase 3 — Email as a first-class channel**
  - Add `email` to `CommsChannel`; route email enqueues to `send-email`; one
    `communication_preferences` table (per-recipient channel opt-in) if needed.

- **Phase 4 — Consolidate template sources**
  - Migrate fee (`FEE_WA_TEMPLATES`) and lead registries to reference
    `comms_templates` keys so "every message from one registry" is literally true
    — done carefully so the Lead CRM keeps working throughout.

- **Phase 5 — Module wiring**
  - Exam (auto on publish), Fee (receipt/reminder), Attendance, Staff (salary
    slip/payroll approved), Tasks, Certificates, Live Class — each only supplies
    variables; the engine builds params + enqueues.
