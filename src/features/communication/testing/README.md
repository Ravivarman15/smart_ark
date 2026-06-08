# Communication (WhatsApp / AiSensy) — QA, Hardening & Wiring

This folder holds the **executable** verification for the communication module.
`communicationSeed.test.ts` (25 assertions) runs the real validation gate, retry
policy, dedupe, and template-resolution engines and hand-verifies them — so a
regression that would let a broken or unsendable message report "sent" fails the
build.

## Root causes found in the audit

1. **The queue never drained (headline).** `aisensyService.dispatchViaEdge()`
   invoked an edge function named **`send-aisensy`** that was *never deployed*.
   The only deployed function, `send-whatsapp`, is a *single-message proxy* — it
   does not read `message_queue`. There was no cron either. Net effect: every
   "Send" wrote `message_queue` rows that **sat forever** while the UI toasted
   "Queued N messages" → the silent-failure / fake-success the spec describes.
   **Fix:** built the real `supabase/functions/send-aisensy` queue drainer.
2. **No pre-send validation.** `enqueue`/`enqueueBulk` wrote whatever they were
   given — no phone check, no rejection of unresolved `{{variables}}`, no empty
   body check. **Fix:** `utils/commsValidation.ts` gate, wired into both methods;
   invalid recipients are reported, never queued.
3. **No dedupe.** Re-running fee/birthday/absent sends could double-message.
   **Fix:** in-batch `dropDuplicates` on a stable `dedupeKey` (template + phone +
   context).
4. **Rendered body was never persisted.** `payload` stored only the variable map,
   so nothing downstream had the final message text to send/preview. **Fix:**
   `buildRow` now persists the rendered body under `payload.__body`.
5. **`sendNow` never nudged dispatch** and the toast claimed success regardless.
   **Fix:** the enqueue hook calls `dispatchViaEdge` after a successful enqueue
   and the toast reflects queued / invalid / skipped honestly.
6. **No delivery webhook.** Delivered/read/failed were never written back. **Fix:**
   `supabase/functions/aisensy-webhook` ingests provider callbacks.

## What the test suite verifies (run: `npm run test`)

| Area | Assertions |
|------|-----------|
| Phone normalisation/validation | Indian formats → `+91…`; junk rejected |
| Enqueue gate | passes complete msg; rejects no-phone / bad-phone / missing-vars / empty-body; `in_app` needs no phone |
| De-duplication | key stable across phone formatting, distinguishes context; in-batch dupes dropped |
| Retry policy | backoff 1/5/30 min, ceiling 3; 4xx permanent vs 5xx/429/network transient; `planAfterFailure` |
| Template resolution | **all 11 communication types** render with no missing vars and no broken placeholders; CTA URLs substituted; a genuinely missing var is reported and blocks the gate |

## Live setup required (so the pipeline actually delivers)

These cannot be verified from the repo — they need the live Supabase project +
an AiSensy account. The code is in place; an operator must:

1. **Secrets** (Supabase → Edge Functions → Secrets):
   `AISENSY_API_KEY`, optionally `AISENSY_DEFAULT_CAMPAIGN` (defaults to
   `ark_broadcast_alert`), and `AISENSY_WEBHOOK_SECRET` for the webhook.
2. **Deploy** the new functions: `supabase functions deploy send-aisensy` and
   `supabase functions deploy aisensy-webhook`.
3. **AiSensy campaigns** — the drainer sends the fully-rendered body as a single
   `{{1}}` parameter, so create (and get Meta-approved) at least the broadcast
   campaign named in `AISENSY_DEFAULT_CAMPAIGN`. Per-template provider campaigns
   can be added later (set `provider_name` on the `comms_templates` row).
4. **Webhook** — in AiSensy, point the delivery-status callback at
   `https://<project>.functions.supabase.co/aisensy-webhook?secret=<secret>`.
5. **(Optional) cron** — schedule `send-aisensy` (e.g. every minute) so the queue
   drains even without a UI nudge and backed-off retries fire on time.

## Phase 2 — Credential verification (login proven before send)

The credential workflows are now **gated**: a credential is never queued until the
server-side `verify-credentials` edge function proves it can log in.

- **Staff** (`subject: "staff"`): resolves the profile → auth user, rotates to a
  fresh known temp password, then performs a **real `signInWithPassword`** with the
  anon key to PROVE the credential works. Only `verified: true` (with the
  login-proven username + password) lets `CredentialSendPanel` enqueue the message.
  Failures (`no_auth_account` / `orphaned_auth` / `login_failed` / `rotate_failed`)
  are reported per-recipient and never sent.
- **Student** (`subject: "student"`): **BLOCKED.** Key finding — this system has
  **no student authentication backend**. `student_app_access` only stores feature
  toggles (`mobile_enabled` / `login_enabled`); there is no student auth.users
  account, username, or password to log into. So student credential verification
  always returns `verified:false, reason:"no_student_auth_backend"` and nothing is
  sent (a password that cannot log in must never be delivered). A student/parent
  auth model must be built before this workflow can be completed.

`credentials.test.ts` verifies the client-side credential-health classification
(structural: no-auth-link / no-email / inactive / duplicate emails) that drives the
**Credential Health** page (`communication/credential-health`).

### Credential verification — live setup
`verify-credentials` cannot be exercised from the repo (needs the live auth
system). To activate: `supabase functions deploy verify-credentials` (it uses the
auto-provided `SUPABASE_ANON_KEY` for the login proof; `verify_jwt=true`, gated to
admin/management inside). Then "Send Staff ID / Password" verifies+sends; the
Credential Health page surfaces structural issues and offers a "Verify & repair"
(rotate + prove login) action.

## Manual / live-environment checks (NOT asserted here)

Actual WhatsApp delivery & receipts · webhook status writeback · **credential
login verification** (the spec's "verify login actually works" needs the auth
backend + `invite-staff` flow — currently credentials are passed at send-time,
not verified) · RBAC gating at runtime · realtime dashboard updates · mobile APK
layout. Verify these in the running app after the live setup above.
