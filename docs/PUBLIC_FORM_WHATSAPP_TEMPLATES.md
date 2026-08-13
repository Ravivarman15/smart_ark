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

{{2}}
```

> ⚠️ **`{{2}}` appears twice — that is rule 1 and Meta will reject it.**
> The body actually submitted must use each parameter once. Use this instead:

**Exact body — submit this one:**

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
| `{{3}}` | `form_type` | What they sent, lowercased in context | demo request |
| `{{4}}` | `platform_name` | Sign-off | Smart ARK |

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
- Passing the same value into `{{2}}` and `{{4}}` is fine — Meta's rule is about
  the *body* using a placeholder once, not about distinct values.
- **The current code sends three parameters, not four.** See "Before you
  submit" below.

---

## Before you submit — one code change is required

`supabase/functions/public-form/index.ts` currently builds the confirmation
with **three** parameters:

```ts
// {{1}} name {{2}} platform_name {{3}} form_type
params: [ctx.clean.name, brand.orgName, def.label],
```

The four-parameter body above needs `brand.orgName` appended:

```ts
params: [ctx.clean.name, brand.orgName, def.label, brand.orgName],
```

**This change was not made** — the phase brief was explicit that no template may
be activated and no unapproved design shipped, and changing the parameter list
before deciding the final body would leave code and template disagreeing. Make
the edit at the same time you submit the four-parameter body, or submit a
three-parameter body that ends without a sign-off.

The admin alert (Template 1) needs no such change: its six parameters already
match the code exactly.

---

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

In `supabase/functions/public-form/index.ts`:

```ts
const WHATSAPP_TEMPLATE_STATUS: Record<string, string> = {
  smartark_platform_lead_alert: "ACTIVE",   // was READY_FOR_SUBMISSION
  smartark_public_form_ack: "ACTIVE",
};
```

Then `supabase functions deploy public-form`. That single edit is the entire
cutover; rolling back is the same edit in reverse.

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

One qualification, stated rather than buried: **the second template's parameter
count does not yet match the code** (3 sent, 4 in the recommended body). That is
the code change described above, and it is why Template 2 should be submitted
and cut over together rather than approved and forgotten.
