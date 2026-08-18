# Email delivery

## What "check the email status" found

Every figure below was read from the live database on 2026-08-18.

| Question | Answer |
|---|---|
| Emails recorded in `message_queue` | 108 — **all of them fee receipts** |
| Every other email path | no record at all |
| Organizations that received a welcome email | **0 of 2** |
| Billing emails ever delivered | **0** |
| Service-role call to `send-email` | **401 Unauthorized** (tested live) |
| Failed receipt rows | 9, all "Failed to send a request to the Edge Function" |
| Average receipt PDF | **4,873 KB** (payslips 5,454 KB) |
| Staff who could send any email | 11 of 30 |

The queue looked healthy — 99 sent, 9 failed — because it was only ever
measuring the one path that recorded anything.

## Five independent causes

### 1. Our own server code could not send email

`resolveCaller()` verifies the bearer token against GoTrue, which only knows
**user** tokens. A service-role key is a valid project JWT but not a user, so
verification fails and the caller is rejected.

`provisioning-worker` and `billing-lifecycle` both call `send-email` with a
service-role client. Every one of those calls was answered `401` — confirmed by
calling the live function directly.

That is why `organization_settings.welcome_email` reads `{"sent": false}` for
both organizations ever provisioned, and why no billing email — trial ending,
payment failed, invoice issued — has ever been delivered. Both callers treat
mail as best-effort and only increment a `skipped` counter, so nothing surfaced.

**Fix:** `isServiceRoleCaller(req)` in `_shared/auth.ts`. It compares the bearer
token to `SUPABASE_SERVICE_ROLE_KEY` and **fails closed** when that secret is
unset — an empty `=== ` empty comparison would admit every anonymous caller as
"internal".

### 2. Nine template ids were being sent that did not exist

`organization-ready`, plus `trial-ending`, `trial-expired`, `renewal-reminder`,
`payment-failed`, `subscription-activated`, `subscription-suspended`,
`subscription-restored` and `invoice`. None was in `KNOWN_TEMPLATES`, so every
send was rejected with `400 Unknown templateId`.

**Fix:** all nine registered, rendered through the same notice body as
`generic-notice` rather than nine bespoke layouts. `KNOWN_TEMPLATES` now
*derives* the notice ids from the map instead of restating them, so a new notice
cannot be added and left unregistered.

A tenth defect rode along: `billing-lifecycle` passed `billingUrl:
"/admin/billing"`. A relative href in an email resolves against the mail
client's own origin, so the button led nowhere from every inbox. The template
now **drops** a non-absolute CTA rather than rendering a broken button, and the
caller sends an absolute URL.

### 3. The role gate was one list for every template

`send-email` required `["management", "admin"]` for all mail. On the live system
that is 11 of 30 staff.

The sharp edge is fees. `is_fee_collector()` in the database resolves to
`(admin, management, coordinator)` and the fee-write RLS was widened to match —
so the database lets a **coordinator** take a payment, and the mailer then
refused to send the receipt. There are 4 coordinators. Teachers (15) fire the
parent automations by marking attendance or entering results, and were likewise
refused.

**Fix:** `TEMPLATE_SENDERS` — a per-template policy that lives beside the
templates.

| Template | Who may send |
|---|---|
| `fee-receipt` | admin, management, coordinator — *mirrors `is_fee_collector()`* |
| `generic-notice` | admin, management, coordinator, teacher |
| `salary-slip`, `staff-welcome`, `staff-password-reset` | admin, management |
| the nine operational notices | **internal only** — no human role at all |

### 4. A one-page receipt weighed 4.8 MB

```ts
pdf.addImage(canvas.toDataURL("image/png"), "PNG", …)
```

A full-page A4 raster at scale 2 is ~1520 × 2150 px. Encoded as **lossless PNG**
and embedded in a PDF created without compression, that is 4.8 MB for a logo, a
table and nine lines of text.

The size is not a tidiness problem, it is the delivery bug:

- the blob is attached to `send-email` as base64, adding ~33% — a **~6.5 MB
  upload from the browser on every fee collection**. A dropped upload is
  precisely the `FunctionsFetchError` that every failed row records.
- the same blob is uploaded to the private `receipts` bucket, which took no
  writes after 2026-08-06.

**Fix:** `src/lib/documentRaster.ts` — JPEG at quality 0.85 plus jsPDF's own
deflate. At scale 2 the bitmap is ~190 DPI, so JPEG artefacts are invisible in
print. All four document PDF builders (receipt, payslip, and both on-screen
download dialogs) go through it, so the downloaded file and the emailed file are
the same document.

### 5. Nothing was recorded, so nothing could be checked

Fee receipts were the only path that wrote a row, and it wrote it from the
frontend after the fact. Everything else sent — or silently failed to send —
with no trace.

**Fix:** the log lives in `sendBrevoEmail`, the one place edge functions talk to
Brevo, and **its context is a required parameter**. Optional would mean it can
be forgotten, and being forgotten is the entire defect.

Rows go to `message_queue` (`channel = 'email'`), reusing the existing comms
backbone rather than a parallel table. The queue drain filters `channel in
('whatsapp','sms')`, so an email row is a record, never work.

> A null tenant is **skipped, not guessed**. `message_queue.organization_id` is
> NOT NULL and the column default resolves to NULL under a service role once a
> second organization exists. Platform marketing enquiries legitimately belong
> to no tenant and already have their own ledger,
> `platform_form_notifications`.

## Retry

Two layers, both transient-only. A `400`/`403` fails identically every time;
retrying it just delays the same answer.

| Layer | Retries | Never retries |
|---|---|---|
| `emailService` (browser) | `FunctionsFetchError` — the request never arrived | any status **from** the function |
| `sendBrevoEmail` (server) | Brevo `429` and `5xx`, network errors | Brevo `4xx` |

A dropped request means the function never ran, so a retry cannot duplicate an
email.

## Narrowing a Phase-1 invariant, deliberately

"No edge function reads `organization_id` out of the request body" was absolute,
and it is what made `send-email` unusable from our own server-side code — a
service-role caller has no membership to derive a tenant from.

`send-email` is now the one exemption, and it is held to proof:

- the read happens **only** inside `if (internal)`, where `internal =
  isServiceRoleCaller(req)`
- a user caller's organization still comes from verified membership, exactly as
  before
- `phase1.test.ts` pins the exemption list to `["send-email"]` and requires the
  guard to be present in the file
- `phase6.test.ts` asserts `body.organizationId` is read **exactly once** and
  matches the guarded shape

## Gates

`src/test/security/emailDelivery.test.ts` — 24 tests. The one that matters most
sweeps every `.ts`/`.tsx` file under `src/` and `supabase/functions/` for
`templateId: "…"` and fails if the id is not in `KNOWN_TEMPLATES`. That is the
check that was missing; it catches all nine original failures.

## Deploying

`_shared/brevo.ts` changed, and edge functions bundle their imports at deploy
time. Every function that sends email must be redeployed or it keeps running the
old copy:

```
npx supabase functions deploy send-email
npx supabase functions deploy invite-staff
npx supabase functions deploy public-form
npx supabase functions deploy provisioning-worker
npx supabase functions deploy billing-lifecycle
```

Then deploy the frontend for the PDF size fix and the client retry.

**No migration.** Nothing in this work changes the database schema.
