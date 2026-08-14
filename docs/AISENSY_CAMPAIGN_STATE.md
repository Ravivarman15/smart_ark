# WhatsApp campaigns — what works, what does not, and what to create

Measured 2026-08-14 from `message_queue` and `lead_whatsapp_logs` across both
live tenants (`ark`, `abc-academi`). The machine-readable copy of this table is
`src/features/communication/constants/providerCampaigns.ts`; a build gate keeps
the two in step, so treat that file as the source and this document as its
explanation.

---

## The finding

> **`fee_receipt` was not the only template working — but it was the only one
> anybody had checked.**

Three separate causes were producing three different kinds of silence:

| # | Cause | Symptom | Affected |
|---|---|---|---|
| 1 | The campaign does not exist at AiSensy | `HTTP 400: Campaign does not exist.` | `staff_credentials`, `inquiry_followup` |
| 2 | Nothing drains the queue | rows sit at `queued` forever, no error anywhere | every template, intermittently |
| 3 | The approved Meta body names one tenant | delivers fine, to the wrong institution's name | the entire Lead/Enquiry funnel |

Only the first produces an error message. The second produces nothing at all,
and the third produces a *successful* send — which is why the funnel looked
healthy.

---

## 1. Campaigns that do not exist

`resolveCampaign()` falls back to a `legacyCampaign` whenever the
organization-neutral replacement is not yet ACTIVE. That fallback is what
actually sends for most templates, and **its existence was never verified.**

### `staff_credentials` — 6 failures, 0 successes, ever

```
HTTP 400: Campaign does not exist.
```

2026-07-31 → 2026-08-12, both tenants. **No staff member has ever received
their login over WhatsApp.** The Brevo welcome email that `invite-staff` sends
is the only channel that has ever worked for this flow.

The Automation Center reported this as `PROVIDER_PENDING`, with the reason
"Sends today via the legacy provider campaign" — a reassuring sentence about a
campaign that does not exist. It now reports `PROVIDER_MISSING`, and
`validateEnqueue` refuses to queue the message at all rather than burning a
provider call to earn the same 400.

**To fix it, a human must create the campaign in AiSensy.** No code change can
conjure it. See §4 for the body — and note that the obvious body is the one Meta
has already rejected twice.

### `inquiry_followup` — `HTTP 400: Campaign does not exist.` (2026-06-26)

Still listed as a *wired* module in `deploymentRegistry.ts`.

---

## 2. The queue had no drain schedule

`message_queue` is a queue. `send-aisensy` is its drainer. **Nothing has ever
run the drainer on a schedule.**

It could not: `send-aisensy` was `verify_jwt = true`, so the platform rejected
any caller without a user session — and `pg_cron` has none. A queued message
therefore only ever left the building as a side effect of somebody clicking
something in the app.

Anything enqueued by an edge function, a webhook or a background flow simply
waited. Measured across one morning:

```
2026-08-13  1 × parent_credentials     a parent's portal login
2026-08-13  3 × smartark_fee_receipt   fee receipts for three families
2026-08-14  5 × smartark_fee_receipt   queued within five minutes of each other
```

Every one had a valid phone number, a rendered body, and a `scheduled_at` in the
past. Nothing reported an error, because nothing had tried.

**Fixed by:**

- `supabase/config.toml` → `verify_jwt = false` for `send-aisensy`
- the gate moved inside the function: `x-cron-key` matching `CRON_SECRET`, **or**
  a resolvable authenticated caller (the `provisioning-worker` pattern), failing
  closed when `CRON_SECRET` is unset
- `20261006_phase11c_whatsapp_drain_schedule.sql` registers
  `whatsapp-queue-drain` at `*/5 * * * *`

The job is created **inactive**. Enabling it transmits every currently-queued
message, so that is an operator's decision:

```sql
select template, status, recipient_phone, created_at
  from message_queue where status = 'queued' order by created_at;

update cron.job set active = true where jobname = 'whatsapp-queue-drain';
```

---

## 3. The Lead/Enquiry funnel delivers the wrong institution's name

This one sends successfully, which is why it survived so long.

`send-aisensy` posts `{ campaignName, templateParams }`. **Meta renders its own
approved body.** The body in this repository never reaches WhatsApp for any
template with a positional spec.

`lead_welcome` posts exactly two parameters — `student_name` and `course_name`.
The institution's name is not among them, so it is **static text inside the
approved Meta body**, and that text is ARK's.

The local body in `leadWhatsappTemplates.ts` *does* contain `{{org_name}}`,
which is what makes this so easy to miss: the previews are right, the audit rows
are right, the `__body` stored in `message_queue` is right. Only the thing
WhatsApp actually delivers is wrong.

`abc-academi` has sent zero lead messages, so no prospect has been thanked by
the wrong company yet. The next tenant to run an enquiry campaign is the one who
finds out.

| Campaign | Delivered | Takes `org_name`? |
|---|---|---|
| `lead_welcome` | 17 (to 2026-07-29) | **no** |
| `lead_assigned_counselor` | 14 (to 2026-07-17) | **no** |
| `lead_demo_scheduled_v2` | 3 (2026-06-30) | **no** |
| `lead_followup_reminder` | never fired | **no** |
| `sla_breach_alert` | never fired | **no** |
| `lead_admission_completed_v2` | never fired | **no** |
| `lead_demo_reminder_v2` | never fired | **no** |

---

## 4. Templates to create in AiSensy

Everything below is **UTILITY**, English. Copy the body verbatim — the parameter
order is a contract with `templateParams.ts` and its `send-aisensy` mirror, and
both are gated by `providerCampaigns.test.ts`.

### Why these bodies look the way they do

Meta has rejected two of this project's templates. Both times the cause was
recorded, and every body below is written against those findings:

1. **A parameter used twice, and parameters out of ascending order.**
   `smartark_staff_credentials` ran `1, 6, 2, 3, 4, 5, 6`. Every body below uses
   each parameter exactly once, in sequence.
2. **A plaintext password.** Meta routes any template carrying one to the
   *Authentication* category, where free-form Role / Email / Portal fields are
   not permitted. `smartark_staff_credentials1` and
   `smartark_student_credentials1` were rejected for this on 2026-08-13 and
   **both names are burned** — a rejected name cannot be resubmitted.
3. **Marketing register in a UTILITY template.** "Welcome to", "We look forward
   to", trailing exclamation marks. A recategorised template is a rejected
   template. The gate `no replacement body uses the register that gets a UTILITY
   template reclassified` enforces this in CI.

Every body also opens on static text, because a template that begins with a
parameter is a documented rejection trigger, and names the organization **only
in the sign-off**, because naming it twice is fault (1) above.

The shape below is the one Meta **already approved** for
`smartark_attendance_absent`. It is not varied, because it is the only evidence
we have about what this reviewer accepts.

---

### Lead / Enquiry funnel — 7 templates

#### `smartark_lead_enquiry_received`
*Replaces `lead_welcome`. Highest priority: it fires on the **public** enquiry
form, so the wrong institution name goes to someone who has never heard of us.*

`{{1}}` student_name · `{{2}}` course_name · `{{3}}` org_name

```
Dear {{1}},

We have received your enquiry for {{2}}.

Our admissions team will review your details and contact you shortly with the information you requested.

Thank you,
{{3}}
```

#### `smartark_lead_assigned`
`{{1}}` counselor_name · `{{2}}` student_name · `{{3}}` course_name · `{{4}}` mobile_number · `{{5}}` org_name

```
Dear {{1}},

A new enquiry has been assigned to you.

Student: {{2}}
Course: {{3}}
Contact: {{4}}

Please respond within your agreed follow-up window and update the enquiry record once you have made contact.

Thank you,
{{5}}
```

#### `smartark_lead_followup_due`
`{{1}}` counselor_name · `{{2}}` student_name · `{{3}}` course_name · `{{4}}` org_name

```
Dear {{1}},

A follow-up is pending on the enquiry from {{2}} for {{3}}.

This enquiry is still awaiting your response. Please contact them and update the enquiry record.

Thank you,
{{4}}
```

#### `smartark_lead_sla_breach`
`{{1}}` counselor_name · `{{2}}` student_name · `{{3}}` course_name · `{{4}}` org_name

```
Dear {{1}},

The enquiry from {{2}} for {{3}} has passed its agreed response time.

Please contact them at the earliest and record the outcome against the enquiry.

Thank you,
{{4}}
```

#### `smartark_lead_demo_scheduled`
`{{1}}` student_name · `{{2}}` course_name · `{{3}}` demo_date · `{{4}}` demo_time · `{{5}}` faculty_name · `{{6}}` org_name

```
Dear {{1}},

Your demo session for {{2}} is confirmed.

Date: {{3}}
Time: {{4}}
Faculty: {{5}}

Please arrive ten minutes before the scheduled time. To reschedule, reply to this message or contact the office.

Thank you,
{{6}}
```

#### `smartark_lead_demo_reminder`
`{{1}}` student_name · `{{2}}` course_name · `{{3}}` demo_date · `{{4}}` demo_time · `{{5}}` org_name

```
Dear {{1}},

This is a reminder of your demo session for {{2}}.

Date: {{3}}
Time: {{4}}

To reschedule, reply to this message or contact the office.

Thank you,
{{5}}
```

#### `smartark_lead_admission_confirmed`
`{{1}}` parent_name · `{{2}}` student_name · `{{3}}` course_name · `{{4}}` org_name

```
Dear {{1}},

The admission of {{2}} for {{3}} is now complete.

The enrolment record has been created. Fee and schedule details will be shared with you separately.

Thank you,
{{4}}
```

---

### Credentials — still unresolved, and not by accident

`staff_credentials` does not exist and `smartark_staff_credentials1` /
`smartark_student_credentials1` are rejected with their names burned. There is
no body that both carries a password and passes review, so **the shape has to
change, not the wording.**

The replacement is the set-password-link flow described in
`AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md` §5: the message carries no secret at
all, only a one-time link. That is a product change with a token table and an
expiry policy behind it, so it is named here rather than smuggled in.

**Until then:** staff and parent credentials go out by **email**, which works.
The WhatsApp attempt is now refused up front with the reason, instead of being
queued, drained, and failed silently.

---

## After approval — the cutover

For each approved campaign, in `providerTemplates.ts`:

1. set `status: "ACTIVE"`
2. update the matching local body in `leadWhatsappTemplates.ts` /
   `whatsappTemplates.ts` to the approved text

Step 2 is not optional and not a matter of tidiness: the local body is what the
preview shows, what the email carries, and what lands in
`message_queue.__body` and `lead_whatsapp_logs.message_body` as the record of
what was sent. Flipping the status alone leaves the audit trail describing a
message that was never delivered.

The gate `cutover is atomic — the local body follows the approved one` fails the
build if step 1 happens without step 2.

Then update the campaign's ledger entry in `providerCampaigns.ts` from
`UNVERIFIED` to `VERIFIED` **once a real message has gone through it**, citing
the date. Not before — the whole point of that file is that it records evidence
rather than intent.
