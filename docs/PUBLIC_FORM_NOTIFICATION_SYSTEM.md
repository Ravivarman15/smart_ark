# Public Form Notification System

Project `vxyshcucwdbpxrhddaeh` · written **2026-08-13** · Phase 11A.

> **The defect this phase fixes.** Since Phase 3A the marketing site has
> inserted public form submissions straight into `platform_demo_requests` and
> `platform_enquiries` from the browser, under an anonymous INSERT policy.
> Storage worked. **Nobody was ever told.** No email, no WhatsApp, no console
> alert — while the visitor was shown "Request received" and, on the demo form,
> a promise of a reply "within one working day".

---

## 1. Architecture

```
            PUBLIC FORM  (marketing site, anonymous visitor)
                     │
                     ▼
        POST /functions/v1/public-form   ← verify_jwt = false
                     │
             validate + sanitise
                     │
                     ▼
              PERSIST the submission        ← the only step that can
        platform_demo_requests / _enquiries    fail the submission
                     │
        ┌────────────┴────────────────────────────────┐
        ▼                                             ▼
  platform_form_recipients()                    the submitter
  (ALL active capability holders)                     │
        │                                    ┌────────┴────────┐
   ┌────┴─────┐                              ▼                 ▼
   ▼          ▼                          Brevo email      AiSensy WhatsApp
 Brevo      AiSensy                      (ack)            (ack, gated)
 (per admin, (per admin with                │                 │
  individual) a number)                     └────────┬────────┘
   │          │                                      ▼
   └────┬─────┘                          platform_form_notifications
        ▼                                      (one row each)
 platform_form_notifications
```

**The order is not negotiable.** The submission is committed before a single
provider is contacted. A Brevo or AiSensy outage means *"saved, notification
failed, recorded"* — never *"please try again"*, because trying again would
store the enquiry twice.

### What was reused rather than rebuilt

| Need | Reused |
|---|---|
| Lead / enquiry storage | `platform_demo_requests`, `platform_enquiries` — both pre-existing, unchanged |
| Tenant-level enquiries | `lead-intake` → `leads` — **untouched**, Lead CRM not modified |
| Email transport | `_shared/brevo.ts` (`sendBrevoEmail`) |
| Email template registry | `_shared/email-templates.ts` — two templates added to the existing registry |
| WhatsApp transport | `send-aisensy`, `direct` mode |
| Super-admin identity | `platform_users` + `platform_role_capabilities` |
| Platform brand | `platform_settings.platform_branding` |
| HTML escaping | `esc()` in `_shared/email-templates.ts` |

**No second lead engine, no second communication engine, no second CRM, no
second registry.**

---

## 2. Form types

One event — `PUBLIC_FORM_SUBMITTED` — carrying a `form_type` and structured
data. The renderer selects wording; the pipeline is identical. Adding a fifth
form is a row in `_shared/publicForms.ts`, not a new code path.

| `form_type` | Label | Stored in | `kind` | Live on |
|---|---|---|---|---|
| `demo` | Demo request | `platform_demo_requests` | — | `/demo` |
| `contact` | Contact enquiry | `platform_enquiries` | `contact` | `/contact` |
| `career` | Career application | `platform_enquiries` | `careers` | `/contact` (topic = Careers; `/careers` links here) |
| `general_enquiry` | General enquiry | `platform_enquiries` | `general` | `/contact` (support / partner / press topics) |

Only `demo` collects scheduling preferences. A contact-form alert therefore
contains **no** "Preferred date" row at all — not even "Not provided", because
the question was never asked.

---

## 3. Recipient resolution

```sql
CREATE FUNCTION public.platform_form_recipients()
RETURNS TABLE (platform_user_id uuid, name text, email text, phone text, role text)
SECURITY DEFINER AS $$
  SELECT u.id, u.name, u.email, u.phone, u.role::text
    FROM public.platform_users u
    JOIN public.platform_role_capabilities c ON c.role = u.role
   WHERE u.is_active
     AND c.capability = 'platform.leads.notify'
   ORDER BY u.created_at;
$$;
```

**There is no `LIMIT` and there must never be one.** A CI assertion fails the
build if one appears.

### Why a capability and not a role list

Hardcoding `role IN ('owner','admin')` would make *people* dynamic but not
*roles* — adding a "growth" role later would still mean editing code. The
capability lives in `platform_role_capabilities`, which already exists and is
already what the console consults.

Seeded for **owner, admin, sales**. `auditor` is deliberately excluded:
read-only oversight is not inbound sales. Changing that set is one `INSERT`.

### Proven, not asserted

Executed in a rolled-back transaction against production, adding four
simulated platform users:

```
resolved            3        (owner + admin + sales)
whatsappable        1        (only one had a phone)
who                 Ravivarman R/owner | Sim Admin B/admin | Sim Admin C/sales
suspended_included  0        ← is_active = false, correctly excluded
auditor_included    0        ← lacks the capability, correctly excluded
```

One super admin became three with **no code change and no deploy**. The
transaction was rolled back; no platform user was created.

---

## 4. Super-admin fan-out

- **Email: one send per administrator.** Never a shared `To`, never `Cc`, never
  `Bcc`. A combined recipient list discloses every administrator's personal
  address to all the others and to anyone who later forwards the mail.
- **WhatsApp: one message per administrator who has a number.**
- **A missing detail for one never suppresses another.** Each loop records a
  `skipped` row with the reason and `continue`s; neither loop can throw.
- `reply-to` on the admin alert is the enquirer, so an admin can reply
  directly. Safe because the address was validated and stripped of control
  characters first.

Observed live (`submission e0ab3b89…`):

| Audience | Channel | Status | Reason |
|---|---|---|---|
| platform_super_admin | email | **sent** | — |
| platform_super_admin | whatsapp | skipped | no WhatsApp number on file |
| form_submitter | email | **sent** | — |
| form_submitter | whatsapp | skipped | template is READY_FOR_SUBMISSION, not ACTIVE |

Both emails were really delivered. Both skips are correct, expected states —
and the submission succeeded regardless.

---

## 5. Brevo

Unchanged credentials, unchanged client, unchanged secrets:
`BREVO_API_KEY` / `SENDER_EMAIL` remain Supabase secrets read only inside edge
functions. The browser never touches them, and the marketing bundle contains no
provider key of any kind — asserted by the test suite.

`send-email` was **not** reused: it requires an `admin`/`management` JWT, and a
public form has no session. `public-form` therefore calls `sendBrevoEmail`
directly, through the same shared client, with the same server-side secrets.

If the secrets are unset, `sendBrevoEmail` returns `status: "skipped"` rather
than throwing — recorded as `skipped` with "email provider not configured", not
as a failure. An unconfigured provider and a broken one need different
responses from an operator.

---

## 6. AiSensy

`send-aisensy`'s **`direct`** mode is reused. It documents that it "touches
NOTHING in the database — the caller owns its ledger row"; the ledger row is
ours.

### Why not `message_queue`

`message_queue.organization_id` is `NOT NULL` **by design** — the whole
tenant-isolation model rests on every queued message belonging to exactly one
organization. A platform marketing enquiry belongs to **no** organization.
Making that column nullable to accommodate a handful of platform rows would put
a hole in the isolation guarantee for every tenant message. So platform-scope
notifications get their own ledger, while the *sending* still goes through the
existing engine.

**Both WhatsApp templates are unapproved and cannot send.** The pipeline checks
the status, records `skipped` with the reason, and carries on. An unapproved
template must never take a form submission down with it.

---

## 7. Templates

Email (added to the existing registry in `_shared/email-templates.ts`):

| id | Audience | Subject |
|---|---|---|
| `platform-lead-alert` | Every active super admin | `New {{formLabel}} received — {{name}} — {{organization}}` |
| `public-form-ack` | The submitter | `Thank you for contacting {{platform_name}}` |

WhatsApp — see [`PUBLIC_FORM_WHATSAPP_TEMPLATES.md`](./PUBLIC_FORM_WHATSAPP_TEMPLATES.md).

| Campaign | Audience | Status |
|---|---|---|
| `smartark_platform_lead_alert` | Super admins | READY_FOR_SUBMISSION |
| `smartark_public_form_ack` | The submitter | READY_FOR_SUBMISSION |

No template promises a response time. "We reply within one working day" was
removed from both confirmation screens: nothing in this system measures or
guarantees that, and a promise the software cannot keep is worse than none. A CI
assertion fails the build if such a phrase reappears in a confirmation.

---

## 8. Variables

Only variables the pipeline can actually supply:

| Variable | Source | Present for |
|---|---|---|
| `name`, `email` | the form; both required | all |
| `phone` | the form; optional | all |
| `organization_name`, `institution_type`, `student_count` | the form | demo |
| `preferred_date`, `preferred_time` | the form | demo |
| `subject` | the form | contact, career, general |
| `message` | the form | all (required except demo) |
| `form_type` / label | the registry | all |
| `submitted_at` | the stored row's `created_at` | all |
| `source`, `utm` | query string at submit time | all |
| `platform_name` | `platform_settings.platform_branding` | all |

`{{demo_date}}` is **not** available to the contact or career forms, because
those forms do not collect it. Rendering it would produce an empty positional
parameter, which Meta rejects.

`present()` guarantees no recipient ever sees `undefined`, `null` or
`[object Object]`; `collectedFields()` omits a field entirely rather than
printing "Not provided" for a question that was never asked.

---

## 9–10. Queue and audit

`platform_form_notifications` — one row per (submission, recipient, channel):

```
form_type · submission_id · submission_table · audience · recipient_ref
recipient_name · channel · template · provider · status · error
provider_message_id · created_at · sent_at
```

`status ∈ {pending, sent, failed, skipped}`. `error` carries the **provider's
own words** — "Brevo said 400 sender not verified" is actionable, "email
failed" is not.

**It deliberately stores no message body.** A career application may carry
personal detail; the submission row already holds it under existing retention
rules, and a second copy would double the exposure for no operational gain. A
CI assertion fails the build if a `body`/`message`/`payload`/`resume` column is
added.

RLS: readable by `is_platform_admin()` only. There is **no anon policy of any
kind** — a visitor must never learn who was alerted, or that anyone was. Writes
come from the service role, so the ledger cannot be forged from a session.

---

## 11. Failure handling

| Failure | Submission | Visitor sees | Recorded |
|---|---|---|---|
| Validation | rejected | the specific reason | — |
| Rate limit | rejected | "we already have your recent submission" | — |
| **Database insert fails** | **failed** | "please try again" | server log |
| Recipient resolution fails | **saved** | success | ledger row, `failed` |
| Brevo fails | **saved** | success | ledger row, `failed`, provider text |
| Brevo unconfigured | **saved** | success | ledger row, `skipped` |
| AiSensy fails | **saved** | success | ledger row, `failed` |
| Template unapproved | **saved** | success | ledger row, `skipped` |
| One admin has no email/phone | **saved** | success | that row `skipped`; others sent |

The visitor is never shown a notification failure. A CI assertion strips JSX
comments from both confirmation blocks and fails if the words "Brevo",
"AiSensy", "WhatsApp", "notification", "failed" or "error" appear in what they
read.

The returned `notified` object is **counts only** — never a name, address or
number — and a count increments only when a send actually succeeded. (An early
version incremented the WhatsApp counter even when the send was skipped; that
was found by reading the live response against the ledger and fixed.)

---

## 12. Idempotency

```
UNIQUE (submission_id, recipient_ref, channel)
```

The slot is **claimed before the provider call**. If the insert is rejected with
`23505`, this recipient has already been told on this channel and the send is
skipped. The database decides, not a prior `SELECT` — two concurrent retries
would both pass a read-then-write check.

Verified against production: re-inserting the exact key returned

```
ERROR: 23505 duplicate key value violates unique constraint
       "platform_form_notifications_idem"
DETAIL: Key (submission_id, recipient_ref, channel)=(e0ab3b89…, 16c7fd53…, email)
```

A visitor double-clicking Submit creates two *submissions*, which is a
different problem, addressed by the rate limit below.

---

## 13. Security

The endpoint is unauthenticated, which is why every control below exists.

| Control | Implementation |
|---|---|
| Payload ceiling | 16 KB, measured on the raw text **before** `JSON.parse` |
| Field allow-list | only registry-declared fields survive; `organization_id`, `status`, `assigned_to` are dropped, not defended against |
| Recipients | resolved server-side; the body may name a form type and its own fields and **nothing else** |
| Rate limit | ≥5 submissions from one email in 10 minutes → HTTP 429, evidenced by the submission table itself |
| Email validation | RFC-length bounded, and **rejects `\r`/`\n`** — header injection |
| HTML injection | angle brackets stripped on input; `esc()` on render |
| WhatsApp injection | braces stripped, so a visitor typing `{{2}}` cannot reach the provider's substitution |
| Control characters | mapped to a space |
| Phone | normalised or `null` — never a guess |
| Empty parameters | refused before the provider is called |
| Response | counts only; no recipient identity crosses the boundary |
| Secrets | none in the bundle; asserted by CI against key-shaped patterns, not vendor names |

Verified live — `<script>x</script>` in the name field was stored as
`QA Harness scriptx/script`, and a `\r\n`-bearing message did not produce a
header.

---

## 14. Multi-tenancy

These forms are on the **platform** marketing site and belong to no tenant, so
**no organization branding is loaded at all**. The function does not query
`organizations` or `organization_branding`; a CI assertion fails the build if it
starts to. That is the structural guarantee that a visitor is never signed off
in a customer institute's name, and that one tenant's identity can never appear
on another's mail.

Organization-specific public forms are a **separate, pre-existing path** and
were not modified: `PublicLeadFormPage` (`/leads/apply/<slug>`) and the
`lead-intake` webhook resolve the tenant from the slug, write to `leads` with an
explicit `organization_id`, and already notify through Lead CRM. Phase 11A does
not touch Lead CRM.

---

## 15. Operator configuration

**Required before WhatsApp alerts can work:**

1. Give each super admin a mobile number:
   ```sql
   UPDATE public.platform_users SET phone = '9XXXXXXXXX' WHERE email = '…';
   ```
   Until then they get email only — recorded as `skipped`, not as an error.

2. Optional — a deep link on the alert button:
   ```bash
   supabase secrets set PLATFORM_CONSOLE_URL=https://<your-console-domain>
   ```
   Absent, the button is simply omitted.

**To add a super admin** (the whole point of the phase): insert a
`platform_users` row with `is_active = true` and a role holding
`platform.leads.notify`. They receive the next submission. No deploy.

**To change which roles are notified:**
```sql
INSERT INTO public.platform_role_capabilities (role, capability)
VALUES ('customer_success', 'platform.leads.notify');
```

---

## 16. Template submission instructions

See [`PUBLIC_FORM_WHATSAPP_TEMPLATES.md`](./PUBLIC_FORM_WHATSAPP_TEMPLATES.md)
for the copy-paste bodies.

After Meta approves a campaign, flip its entry in
`WHATSAPP_TEMPLATE_STATUS` in `supabase/functions/public-form/index.ts` from
`READY_FOR_SUBMISSION` to `ACTIVE` and redeploy. That single edit is the entire
cutover; nothing else changes. Rolling back is the same edit in reverse.

**Do not mark either template ACTIVE before approval.** The gate exists so an
unapproved template cannot be sent and cannot break a submission.

---

## 17. Rollback

| To undo | How |
|---|---|
| The whole feature | `supabase/rollback/20261004_phase11a_public_form_notifications_rollback.sql` |
| The frontend | revert `marketing.service.ts`; the anon INSERT policies are still in place, so direct-insert would resume (unnotified, as before) |
| The function | delete the `public-form` deployment; nothing else calls it |
| Anything sent | nothing can be un-sent — two test emails went to `qa-harness+…@example.com`, a reserved documentation domain |

The rollback keeps `platform_users.phone` if any operator has entered a number:
a rollback of a notification feature is not a reason to discard data a human
supplied.

---

## 18. What is not done

1. **Both WhatsApp templates are unapproved**, so no WhatsApp message has been
   or can be sent. Email is fully live.
2. **No super admin has a phone number yet**, so even after approval the admin
   WhatsApp fan-out sends nothing until §15 step 1 is done.
3. **No console dashboard page was built** for `platform_form_notifications`.
   The submissions themselves already surface through the existing platform
   read policies on `platform_demo_requests` / `platform_enquiries`; the
   delivery ledger is currently queryable but not rendered.
4. **The demo form's date/time preference is captured but not booked** — there
   is no calendar integration, and the confirmation deliberately does not imply
   one.
