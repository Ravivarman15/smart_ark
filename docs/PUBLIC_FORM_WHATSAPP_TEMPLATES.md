# Public Form WhatsApp Templates — AiSensy / Meta

Copy-paste ready. Two templates cover all four public forms: the form type is a
**parameter**, not a separate template, so adding a fifth form needs no new
Meta submission.

Prepared **2026-08-13**. Both are **READY_FOR_SUBMISSION** — neither has been
submitted, and neither can send until an operator flips its status after
approval. Nothing here is marked ACTIVE.

---

## Submission rules

Same structural rules that got the credential templates rejected twice — see
`AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md`:

1. A variable may appear **only once**.
2. Variables must **ascend with no gaps** — `{{1}}, {{2}}, {{3}}…`.
3. Declared parameter count must equal the highest `{{n}}` in the body.
4. Two variables must not sit adjacent.
5. Fill every sample value — Meta rejects empty preview parameters.
6. A rejected campaign name **can never be reused**.
7. No tenant name, URL, phone or address in the body.

Both templates below satisfy 1–4 and 7. Verified: no duplicates, no gaps,
ascending, declared count matches.

---

## Template 1 — super admin alert

**Campaign name:** `smartark_platform_lead_alert`
**Meta template name:** `smartark_platform_lead_alert`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION
**Audience:** every active platform user holding `platform.leads.notify`

**Exact body:**

```
New {{1}} received.

Name: {{2}}
Phone: {{3}}
Email: {{4}}
Organization: {{5}}

Please review the enquiry in the dashboard.

{{6}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `form_type` | Registry label for the form | Demo request |
| `{{2}}` | `name` | Who submitted it | Ravi Kumar |
| `{{3}}` | `phone` | Their number, or "Not provided" | 9876543210 |
| `{{4}}` | `email` | Their address | ravi@example.com |
| `{{5}}` | `organization_name` | Their institution, or "Not provided" | Example Institute |
| `{{6}}` | `platform_name` | Platform brand from `platform_settings` | Smart ARK |

**Example output:**

```
New Demo request received.

Name: Ravi Kumar
Phone: 9876543210
Email: ravi@example.com
Organization: Example Institute

Please review the enquiry in the dashboard.

Smart ARK
```

**A contact enquiry, same template:**

```
New Contact enquiry received.

Name: Priya S
Phone: Not provided
Email: priya@example.com
Organization: Not provided

Please review the enquiry in the dashboard.

Smart ARK
```

**Provider notes:**

- No parameter is ever empty: `present()` substitutes `Not provided`, because
  Meta rejects an empty positional parameter and the pipeline refuses to send
  rather than let one through.
- Deliberately plain. This is an internal operational alert; marketing language
  in it would push the template toward MARKETING and its own consent rules.
- One template serves all four form types — `{{1}}` carries the difference.

---

## Template 2 — submitter confirmation

**Campaign name:** `smartark_public_form_ack`
**Meta template name:** `smartark_public_form_ack`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION
**Audience:** the person who submitted the form, if they gave a phone number

**Exact body:**

```
Hi {{1}},

Thank you for contacting {{2}}.

We have received your {{3}} and our team will review it and get back to you.

Thank you.

{{4}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `name` | The submitter | Ravi Kumar |
| `{{2}}` | `platform_name` | Platform brand | Smart ARK |
| `{{3}}` | `form_type` | What they sent | demo request |
| `{{4}}` | `platform_name` | Sign-off | Smart ARK |

`{{2}}` and `{{4}}` receive the same value. That is allowed: Meta forbids
reusing a **placeholder**, not passing one value into two of them. Repeating
the value is what lets the message greet with the brand and sign off with it.

**Example output — demo:**

```
Hi Ravi Kumar,

Thank you for contacting Smart ARK.

We have received your demo request and our team will review it and get back to you.

Thank you.

Smart ARK
```

**Example output — career application:**

```
Hi Priya S,

Thank you for contacting Smart ARK.

We have received your career application and our team will review it and get back to you.

Thank you.

Smart ARK
```

**Provider notes:**

- No response-time promise. Nothing in this system measures or guarantees one,
  and a promise the software cannot keep is worse than none.
- The code posts exactly four parameters in this order, asserted by a build
  gate — see "Parameter contract" below.

---

## Parameter contract

Both templates' positional order is declared once, as data, in
`supabase/functions/_shared/publicForms.ts`:

```ts
export const WHATSAPP_TEMPLATES = {
  smartark_platform_lead_alert: {
    params: ["form_type", "name", "phone", "email", "organization_name", "platform_name"],
    status: "READY_FOR_SUBMISSION",
  },
  smartark_public_form_ack: {
    params: ["name", "platform_name", "form_type", "platform_name_signoff"],
    status: "READY_FOR_SUBMISSION",
  },
};
```

**Why it is declared rather than implied.** The submitted Meta body and the
array the code posts are two halves of one contract that used to live in two
files, and they had already drifted: the recommended `smartark_public_form_ack`
body used four placeholders while the function posted three. Meta would have
approved the template and the **first real send after approval** would have
failed on a count mismatch — the most expensive moment to discover it.

Three things now prevent that:

1. `public-form/index.ts` builds its array against this declaration.
2. It refuses to call the provider on a count mismatch, recording
   `parameter count mismatch: built 3, smartark_public_form_ack declares 4` —
   naming our bug instead of relaying a generic provider rejection.
3. A build gate (`src/test/security/publicFormNotifications.test.ts` §12b)
   parses the literal array at each call site and fails if it disagrees with
   the declaration. Verified by mutation: restoring the three-parameter version
   fails the suite with `expected 3 to be 4`.

Status lives in the same object, so a template cannot be marked sendable in one
place while its parameters are described in another.

## Category

**UTILITY** for both.

The argument for it: both are triggered by an action the recipient themselves
performed (submitting a form) or by an operational event within their own
organization (a new enquiry). Neither contains promotional content, neither
advertises anything, and neither is a login code.

Approval is **not guaranteed** and this document does not claim it is. Meta
reviews the wording as well as the shape.

---

## After approval

In `supabase/functions/_shared/publicForms.ts` — the same object that declares
the parameter order, so status and contract can never disagree:

```ts
export const WHATSAPP_TEMPLATES = {
  smartark_platform_lead_alert: {
    params: ["form_type", "name", "phone", "email", "organization_name", "platform_name"],
    status: "ACTIVE",            // was READY_FOR_SUBMISSION
  },
  smartark_public_form_ack: {
    params: ["name", "platform_name", "form_type", "platform_name_signoff"],
    status: "ACTIVE",
  },
};
```

Then `supabase functions deploy public-form`. That single edit is the entire
cutover; rolling back is the same edit in reverse.

Approve them **one at a time** if you can. The admin alert only ever reaches
your own staff, so it is the safe one to cut over first; the confirmation
reaches members of the public.

**Also required for admin WhatsApp to reach anyone** — no super admin has a
number on file yet:

```sql
UPDATE public.platform_users SET phone = '9XXXXXXXXX' WHERE email = '…';
```

Until then the ledger records `skipped — no WhatsApp number on file`, which is
truthful rather than a failure.

---

## Validation

```
duplicate parameters         : 0
parameter gaps               : 0
ordering errors              : 0
declared vs body mismatch    : 0   (6 = 6, and 4 = 4 for the corrected body)
empty parameters possible    : 0   (present() substitutes; the pipeline refuses otherwise)
hardcoded tenant branding    : 0
response-time promises       : 0
```

Both templates are structurally ready to submit. The parameter-count mismatch
that previously affected `smartark_public_form_ack` is fixed: the code posts
four parameters, the declaration says four, and a build gate holds them
together.

What remains is entirely outside this repository — Meta's review. Nothing here
claims approval is likely or guaranteed.
