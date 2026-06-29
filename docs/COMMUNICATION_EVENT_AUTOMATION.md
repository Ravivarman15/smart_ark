# Communication Event Automation — Phase 2

Turns ARK into an **event-driven** communication system: the operator performs a business action and
the ERP decides **who** to notify, **which template/variables**, **which channel** (WhatsApp / Email
/ both) and **when** (immediate / scheduled / quiet-hours-deferred), with **duplicate protection**
and a **daily scheduler** — all governed by a Management-configurable rule set.

**Reuses the existing engine.** No new queue, no duplicate services. New code is thin orchestration
+ one config table + one cron edge function.

---

## Architecture / flow

```
Business action (approve payroll, save attendance, …)            Daily cron (08:00)
        │                                                                │
        ▼                                                                ▼
commsDispatcher.dispatch(eventKey, { recipients, resolve })   comms-scheduler edge fn
        │                                                       │  (or in-app "Run now"
        ▼                                                       ▼   → runScheduledJobs)
  comms_automation_settings  ──►  smart rules (automationRules)
   (enabled? channel? timing?)     • shouldDispatch (enabled)
                                   • resolveChannels (wa/email/both)
                                   • isWithinQuietHours → defer scheduledAt
                                   • partitionDuplicates ◄── context_ids queued today
        │ fresh recipients
        ▼
  buildAutomatedBatch (Phase 1)  ── resolve vars → renderMessage → validateEnqueue
        │ validated EnqueueInput[]                         (skips bad rows, never throws)
        ▼
  aisensyService.enqueueBulk ─► message_queue ─► send-aisensy ─► AiSensy ─► aisensy-webhook
        │ (email channel)                                    + retry engine (retryPolicy)
        ▼
  send-email edge fn (Brevo)                          comms_audit (entity 'automation')
        │
        ▼
  Communication Timeline  ◄── reads message_queue per recipient
```

**Smart rules** (every event supports): enable/disable, channel (WhatsApp/Email/Both),
immediate vs scheduled, quiet hours (deferred, never dropped), priority, retry (inherited from the
queue's retry engine), and duplicate protection (one message per recipient per event per day).

---

## What ships in Phase 2

| Piece | File | Notes |
|---|---|---|
| Config table | `supabase/migrations/20260628_comms_automation.sql` | `comms_automation_settings` + seeded disabled rows + guarded pg_cron snippet |
| Scheduler | `supabase/functions/comms-scheduler/index.ts` | daily cron; enqueues birthdays/demos; reuses message_queue |
| Event registry | `constants/automationEvents.ts` | 19 events — source of truth |
| Settings service | `services/commsAutomationSettings.service.ts` (+ `useAutomationSettings`) | read/upsert, missing-table-safe |
| Smart rules | `utils/automationRules.ts` | pure, unit-tested |
| Dispatcher | `services/commsDispatcher.service.ts` | `dispatch()` + `runScheduledJobs()` |
| Timeline | `services/commsTimeline.service.ts` (+ `useCommsTimeline`, `<CommunicationTimeline>`) | per-recipient history over message_queue |
| Settings page | `pages/AutomationSettingsPage.tsx` | Management matrix + "Run scheduler now" |
| Timeline page | `pages/CommunicationTimelinePage.tsx` | recipient search → history |

**Triggers wired now:** the scheduler events (birthday, fee-due via in-app "Run now"; birthday +
demo via the edge fn) and **payroll approved** (`usePayrollApproval.ts`, WhatsApp, gated).

**Safety:** every operational trigger is gated by `dispatch()` reading the event setting — disabled
by default and missing-table-safe — so wiring is **inert** until the migration is applied AND the
event is enabled in Automation Settings. It can never break the business mutation (best-effort
try/catch).

---

## Deploy notes (operator)

1. Apply `20260628_comms_automation.sql` (creates the config table + seeds disabled rows).
2. `supabase functions deploy comms-scheduler`.
3. Enable the 08:00 cron: uncomment the `cron.schedule(...)` block in the migration with your
   project URL + key (requires `pg_cron` + `pg_net`). Until then, use **"Run scheduler now"** on
   the Automation Settings page.
4. In **Communication → Communication Automation**, enable the events you want and set channel /
   quiet hours / template per event.

No data migration. The engine (`message_queue`, `comms_*`, `send-aisensy`, `send-email`, retry,
webhook) is unchanged.

---

## Remaining operational triggers — ready-to-apply pattern

The scheduler + payroll triggers are wired. To wire the rest, add one gated call at the operational
mutation's success seam (reusing the feature's own data). Pattern:

```ts
import { commsDispatcherService } from "@/features/communication/services";

// after the business mutation succeeds (best-effort — never block the action):
try {
  await commsDispatcherService.dispatch("attendance_absent", {
    recipients,                 // RecipientCandidate[] you already have
    resolve: (c) => ({ /* template vars from c.meta */ }),
    actorId,
  });
} catch { /* automation is best-effort */ }
```

| Event | Seam (hook/service) | Recipients |
|---|---|---|
| attendance_absent / _present | attendance save mutation | the marked students' parents |
| fee_paid | fee collection success | the paying student/parent |
| exam_published | marks-publish mutation | students with results |
| admission_completed | admission completion | the admitted student/parent |
| live_class_created / class_cancelled | live-class mutations | assigned students |
| staff_credentials / student_credentials | account-create flow | the new account |
| task_assigned | task-assign mutation | the assignee |
| certificate_ready | certificate-generate | the student/parent |

Several of these features already have a messaging service (`fees/feeMessaging`,
`live-classes/liveClassMessaging`, `leads/leadWhatsapp`); prefer routing the new dispatch through the
canonical template keys (see `docs/AISENSY_TEMPLATES.md` §C reconciliation) so one intent uses one
AiSensy template.

---

## Build report

### PASS / FAIL
| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS (0 errors) |
| `eslint` (changed files) | ✅ PASS (0 errors/warnings) |
| `vitest` (full suite) | ✅ PASS — 285/285 (incl. 8 new rules + 4 new dispatcher; RBAC route/registry gates green) |
| `vite build` | ✅ PASS (built in 19.7s) |
| Reuses engine — no new queue/duplicate services | ✅ |
| New infra additive + inert until deployed | ✅ |
| Lead CRM untouched | ✅ |
| RBAC registered (catalog + menu + routes) | ✅ |

### New files
- `supabase/migrations/20260628_comms_automation.sql`, `supabase/functions/comms-scheduler/index.ts`
- `src/features/communication/constants/automationEvents.ts`
- `src/features/communication/services/{commsAutomationSettings,commsDispatcher,commsTimeline}.service.ts`
- `src/features/communication/utils/automationRules.ts`
- `src/features/communication/hooks/{useAutomationSettings,useCommsTimeline}.ts`
- `src/features/communication/components/CommunicationTimeline.tsx`
- `src/features/communication/pages/{AutomationSettingsPage,CommunicationTimelinePage}.tsx`
- `src/features/communication/testing/{automationRules,commsDispatcher}.test.ts`
- `docs/COMMUNICATION_EVENT_AUTOMATION.md`

### Modified files
- `src/features/communication/types/communication.types.ts` (automation types + `automation` audit entity)
- `src/features/communication/utils/commsAutomation.ts` (per-recipient context_id + contextType override)
- `services/index.ts`, `hooks/index.ts`, `pages/index.ts`, `components/index.ts` (exports)
- `src/core/constants/queryKeys.ts`, `src/core/navigation/menu.config.ts`, `src/features/rbac/constants/catalog.ts`, `src/App.tsx`
- `src/features/payroll/hooks/usePayrollApproval.ts` (gated payroll_approved dispatch)
- `docs/AISENSY_TEMPLATES.md` (regenerated — used-only)
