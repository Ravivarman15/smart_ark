# AiSensy / Meta WhatsApp Template Submission

Prepared **2026-08-13** from the repository as it stands. Nothing in the
application, database, scheduler or provider configuration was changed to
produce this document, and no template status was altered — all five remain
`READY_FOR_SUBMISSION`.

Sources audited: `src/features/communication/constants/providerTemplates.ts`,
`src/features/leads/utils/templateParams.ts`,
`supabase/functions/send-aisensy/index.ts` (the Deno mirror),
`src/features/communication/constants/automationEvents.ts` (the canonical
registry), `supabase/functions/_shared/commsTemplates.json` and
`src/features/communication/utils/whatsappTemplates.ts`, plus the two existing
review documents.

Tenant names below are the **real** `organizations.display_name` values read
from the live database: `ARK Learning Arena` and **`ABC Academi`**. The earlier
submission draft said "ABC Academy", which is not this tenant's name.

> **Read §Cutover blockers before activating anything.** The five templates are
> safe and correct to *submit* today. Three of them are **not** safe to switch
> to `ACTIVE` yet, for reasons that have nothing to do with Meta.

---

## Submission Rules

Structural rules — Meta rejects on these before it ever reads your wording.
Both credential templates were rejected on rules 1 and 2.

1. **A variable may appear only once.** `{{6}}` twice in one body is an instant
   rejection.
2. **Variables must ascend with no gaps.** `1, 6, 2, 3…` is a rejection; so is
   `1, 2, 4`.
3. **The declared parameter count must equal the highest `{{n}}` in the body.**
4. **Never edit an approved, in-use template.** Re-review can suspend sending on
   the whole number. Every template here is a *new* one; the legacy ones stay
   live.
5. **A rejected campaign name can never be reused.** That is why the credential
   campaigns carry a `1` suffix. If one is rejected again, the next attempt
   needs *another new name* — not an edit.
6. **Fill every sample value.** Meta rejects templates submitted with empty
   preview parameters.
7. **Two variables must not sit adjacent** (`{{1}} {{2}}` with nothing between).
   None of these do.
8. **Category matters.** UTILITY for transactional account/attendance/payment
   notices. Anything that reads like a login code risks being pushed to
   Authentication — see the Credential Template Review.
9. **Do not put a tenant's name, URL, phone or address in the body.** The
   organization name is `{{org_name}}`, always the **final** parameter.

### The rule specific to this codebase

`send-aisensy` posts `{ campaignName, templateParams }` and **Meta renders its
own approved body**. The body stored in this repository never reaches WhatsApp —
it is used only for email, the queue payload and on-screen previews. Two
consequences:

- Editing a body in the repo does **not** change the WhatsApp message. Only a
  newly approved Meta template does.
- Conversely, the *wording* you submit to Meta does not have to match the repo
  byte-for-byte — **only the parameter order must match.** That matters for the
  trailing-variable risk noted under each template.

---

## Template 1

**Campaign name:** `smartark_attendance_absent`
**Meta template name:** `smartark_attendance_absent`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION

**Exact body:**

```
Dear {{1}},

This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
{{6}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `parent_name` | Guardian being addressed | Mr. Kumar |
| `{{2}}` | `student_name` | Student marked absent | Arjun |
| `{{3}}` | `class` | Class / standard | 9th Standard |
| `{{4}}` | `section` | Section; `-` when the student has none | A |
| `{{5}}` | `attendance_date` | Date of the absence | 10 Aug 2026 |
| `{{6}}` | `org_name` | Organization sign-off | ARK Learning Arena |

**ARK preview:**

```
Dear Mr. Kumar,

This is to inform you that Arjun (Class 9th Standard - A) was marked ABSENT on 10 Aug 2026.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
ARK Learning Arena
```

**ABC Academi preview:**

```
Dear Mr. Kumar,

This is to inform you that Arjun (Class 9th Standard - A) was marked ABSENT on 10 Aug 2026.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
ABC Academi
```

**Provider notes:**

- Legacy campaign: `ark_attendance_absent` (stays live and untouched).
- ERP event: `attendance_absent`. Sent synchronously on Submit Attendance via
  `attendanceWhatsapp.service.ts`, not through the queue.
- Parameter order is identical in `providerTemplates.ts`, `templateParams.ts`
  and the Deno mirror — verified programmatically.
- `section` is never empty: the send path substitutes `-`, because Meta rejects
  an empty positional parameter.
- **`org_name` is present in the payload at send time** (the service spreads
  `...orgVars`). Activation is a pure status flip.
- Cutover: set `status: "ACTIVE"` in `providerTemplates.ts` and deploy the
  frontend. `resolveCampaign()` returns the legacy campaign until then.
- Risk: the body **ends with a variable**. See the note at the end of this
  document.

---

## Template 2

**Campaign name:** `smartark_attendance_corrected`
**Meta template name:** `smartark_attendance_corrected`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION

**Exact body:**

```
Dear {{1}},

This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.

Thank you.

{{4}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `parent_name` | Guardian being addressed | Mr. Kumar |
| `{{2}}` | `student_name` | Student whose record was corrected | Arjun |
| `{{3}}` | `attendance_date` | Date corrected | 10 Aug 2026 |
| `{{4}}` | `org_name` | Organization sign-off | ARK Learning Arena |

**ARK preview:**

```
Dear Mr. Kumar,

This is to inform you that the attendance for Arjun on 10 Aug 2026 has been corrected to PRESENT.

Thank you.

ARK Learning Arena
```

**ABC Academi preview:**

```
Dear Mr. Kumar,

This is to inform you that the attendance for Arjun on 10 Aug 2026 has been corrected to PRESENT.

Thank you.

ABC Academi
```

**Provider notes:**

- Legacy campaign: `ark_attendance_corrected` (stays live).
- ERP event: `attendance_corrected`, same synchronous path as Template 1.
- **`org_name` is present in the payload at send time.** Activation is a pure
  status flip.
- Risk: body ends with a variable.

---

## Template 3

**Campaign name:** `smartark_staff_credentials1`
**Meta template name:** `smartark_staff_credentials1`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION

**Exact body:**

```
Dear {{1}},

Your staff portal account has been created.

Role: {{2}}
Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `staff_name` | Staff member | Priya S |
| `{{2}}` | `role` | Designation / role label | Teacher |
| `{{3}}` | `login_email` | Login identifier (login-proven username wins over the profile email) | priya@example.com |
| `{{4}}` | `password` | Temporary password — supplied at trigger time, never stored | Tmp#4821 |
| `{{5}}` | `login_url` | Portal login page (platform URL, not tenant-specific) | https://smart-ark.vercel.app/login |
| `{{6}}` | `org_name` | Organization sign-off | ARK Learning Arena |

**ARK preview:**

```
Dear Priya S,

Your staff portal account has been created.

Role: Teacher
Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ARK Learning Arena
```

**ABC Academi preview:**

```
Dear Priya S,

Your staff portal account has been created.

Role: Teacher
Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ABC Academi
```

**Provider notes:**

- Legacy campaign: `staff_credentials` (stays live).
- The `1` suffix exists because `smartark_staff_credentials` was **rejected** and
  a rejected name cannot be reused.
- Structure re-verified below: no duplicates, no gaps, ascending, 6 declared = 6
  used.
- **Category risk is real.** See the Credential Template Review.
- ⚠️ **`org_name` is NOT in the payload at send time.** `staffCredentials.service.ts`
  builds `{staff_name, role, login_email, password, login_url}` and
  `CredentialSendPanel.tsx` adds `branch_name`, not `org_name`. Activating this
  campaign as-is would post an **empty `{{6}}`**. This is a code change, not a
  status flip — see Cutover blockers.
- Confirm `{{5}}`'s example against the real production login URL before
  submitting: `login_url` comes from `VITE_PUBLIC_APP_URL`, which is not set in
  the local `.env` and falls back to the browser origin.
- Risk: body ends with a variable.

---

## Template 4

**Campaign name:** `smartark_student_credentials1`
**Meta template name:** `smartark_student_credentials1`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION

**Exact body:**

```
Dear {{1}},

The Parent Portal account for {{2}} has been created.

Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `parent_name` | Guardian being addressed | Mr. Kumar |
| `{{2}}` | `student_name` | Child, or a joined list for multi-child parents | Arjun |
| `{{3}}` | `login_email` | Parent Portal login identifier | kumar@example.com |
| `{{4}}` | `password` | Temporary password | Tmp#4821 |
| `{{5}}` | `login_url` | Parent Portal login page | https://smart-ark.vercel.app/parent |
| `{{6}}` | `org_name` | Organization sign-off | ARK Learning Arena |

**ARK preview:**

```
Dear Mr. Kumar,

The Parent Portal account for Arjun has been created.

Login Email: kumar@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark.vercel.app/parent

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ARK Learning Arena
```

**ABC Academi preview:**

```
Dear Mr. Kumar,

The Parent Portal account for Arjun has been created.

Login Email: kumar@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark.vercel.app/parent

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ABC Academi
```

**Provider notes:**

- Legacy campaign: `parent_credentials` (stays live). Note the ERP template key
  is `student_credentials` while the legacy provider campaign is
  `parent_credentials` — that mismatch is pre-existing and intentional.
- The `1` suffix exists for the same reason as Template 3.
- ⚠️ **`org_name` is NOT in the payload at send time** —
  `parentCredentials.service.ts` builds `{parent_name, student_name,
  login_email, password, login_url}`.
- ⚠️ **The `username` alias is missing from the new spec.** The legacy
  `parent_credentials` builder reads `val(p, "login_email", "username")`; the
  new `smartark_student_credentials1` builder reads `login_email` only. The
  canonical `student_credentials` template still names the field `username`, so
  a send composed through that key would post an **empty `{{3}}`**.
- ⚠️ The canonical `student_credentials` body carries **no `login_url`** at all
  (`variables: [parent_name, branch_name, student_name, username, password]`),
  so `{{5}}` would also be empty on that path.
- Same Meta category risk as Template 3.
- Risk: body ends with a variable.

---

## Template 5

**Campaign name:** `smartark_fee_receipt`
**Meta template name:** `smartark_fee_receipt`
**Category:** UTILITY
**Language:** English
**Status:** READY_FOR_SUBMISSION

**Exact body:**

```
Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).
Receipt No: {{4}}
Amount Paid: ₹{{5}}
Pending Balance: ₹{{6}}
Thank you. — {{7}}
```

**Variables:**

| Parameter | Variable | Meaning | Example |
|---|---|---|---|
| `{{1}}` | `parent_name` | Payer / guardian | Mr. Kumar |
| `{{2}}` | `student_name` | Student the fee is for | Arjun |
| `{{3}}` | `class` | Class / standard | 9th Standard |
| `{{4}}` | `receipt_no` | Receipt number | RCP-2026-0417 |
| `{{5}}` | `amount_paid` | Amount received, `en-IN` formatted, no ₹ (the ₹ is in the body) | 12,400 |
| `{{6}}` | `pending_balance` | Balance still due, same formatting | 3,600 |
| `{{7}}` | `org_name` | Organization sign-off | ARK Learning Arena |

**ARK preview:**

```
Dear Mr. Kumar, we have received a fee payment for Arjun (Class 9th Standard).
Receipt No: RCP-2026-0417
Amount Paid: ₹12,400
Pending Balance: ₹3,600
Thank you. — ARK Learning Arena
```

**ABC Academi preview:**

```
Dear Mr. Kumar, we have received a fee payment for Arjun (Class 9th Standard).
Receipt No: RCP-2026-0417
Amount Paid: ₹12,400
Pending Balance: ₹3,600
Thank you. — ABC Academi
```

**Provider notes:**

- Legacy campaign: `fee_receipt` (stays live).
- ERP event: `fee_paid`, executed by `feeReceiptDelivery.service.ts` — a
  **legacy working flow that is deliberately not migrated**. Approving this
  campaign does not change that execution path.
- ⚠️ **`org_name` is NOT in the payload at send time.** The service sets
  `branch_name: orgVars.org_name` but never `org_name`, so `{{7}}` would post
  empty.
- Minor: the new builder drops the legacy aliases (`batch_name` for `class`,
  `amount` for `amount_paid`, `amount_pending` for `pending_balance`). Harmless
  today — the current call site uses the canonical keys — but it removes a
  safety net for any future call site.
- The ₹ sign is **in the template body, not in the parameter.** Do not let the
  sample value include ₹, or the rendered message reads "₹₹12,400".
- Risk: body ends with a variable.

---

## Credential Template Review

### Current template

Templates 3 and 4 above. Both are UTILITY, six parameters, organization named
**only in the sign-off**:

```
staff  : [staff_name, role, login_email, password, login_url, org_name]
student: [parent_name, student_name, login_email, password, login_url, org_name]
```

### Previous rejection cause

The originally submitted bodies were shaped like:

```
Dear {{1}}, ... Your {{6}} staff portal account has been created.
Role: {{2}}  Login Email: {{3}}  Temporary Password: {{4}}  Portal: {{5}}
Thank you, {{6}}
```

Parameter sequence as written: **1, 6, 2, 3, 4, 5, 6**. Two hard structural
violations at once:

| # | Rule | Violation |
|---|---|---|
| 1 | A variable may appear only once | `{{6}}` appeared **twice** |
| 2 | Variables must ascend with no gaps | `{{6}}` came before `{{2}}` |

Meta rejects on these *before* assessing wording — which is why rewording and
resubmitting kept failing. Both are now fixed, and
`src/test/security/commsAutomation.test.ts` fails the build if either is
reintroduced.

### Structural validation

Both credential templates, re-verified against the current source for this
document:

| Check | staff | student |
|---|---|---|
| Duplicate `{{n}}` | none | none |
| Gaps in the sequence | none | none |
| Out-of-order parameters | none | none |
| Undeclared parameters (used in body, not declared) | none | none |
| Declared-but-unused parameters | none | none |
| Declared count vs highest `{{n}}` | 6 = 6 | 6 = 6 |
| `org_name` in final position | yes | yes |
| Tenant branding in body | none | none |
| App builder == Deno mirror == declared order | yes | yes |

**Structurally these are ready.** Nothing about their shape should trigger
another rejection.

### Likely Meta risk

**Genuine, and unresolved by the structural fix.** The message contains a
password. Meta's **Authentication** category exists for codes used to log in,
and Meta increasingly routes password-shaped content there. An Authentication
template is heavily constrained — fixed phrasings, typically a copy-code button,
and **no free-form fields for a role, an email address or a portal URL**. Our
message cannot fit that format: an Authentication template cannot carry
`Role:` and `Login Email:`.

So the two categories pull in opposite directions. Submit as **UTILITY** — the
message is triggered by an account-provisioning action the institution
performed, carries no promotional content, and is not a one-time passcode for a
login the user just attempted. But do not treat approval as likely.

**Prediction, stated plainly: this is the least likely of the five to be
approved, and the reason is the password, not the structure.**

### Recommended fallback if rejected

**Do not submit a third password-bearing design.** If a well-formed UTILITY
template is rejected again, the template is not the problem — sending a password
over WhatsApp is. Change the flow.

**Set-password link (recommended). Kept separate from the five above — this is
NOT part of this submission batch.**

```
Dear {{1}},

Your account at {{2}} is ready.

Set your password using the secure link below. The link expires in 24 hours.

{{3}}
```

`params: [name, org_name, setup_url]` — note `org_name` is **not** last here,
because there is no legacy positional order to preserve for a template that has
never existed. If you prefer to keep the platform-wide convention, use
`[name, setup_url, org_name]` and move the sign-off to the end.

Why it is better on both axes:

- It is straightforwardly UTILITY — an account notification with a link, a shape
  Meta approves routinely.
- No password ever travels over WhatsApp or sits in a WhatsApp backup.
- The link is single-use and expiring, so an intercepted message ages out.
- The recipient chooses their own password, so there is no temporary password to
  leak or forget to rotate.
- It removes the residual risk noted below.

Supabase already provides the primitive (`generateLink` / recovery links) and
the app already has a login route to land on. **This is a flow change and has
not been made** — the current credential workflow is untouched by this task.

**Second fallback, if a link flow is not acceptable:** send the username over
WhatsApp and the password over email, which is what `invite-staff` already does.
The WhatsApp template then carries no secret at all.

### Residual risk in the current design

The queue row is written to `message_queue` with the rendered `__body`
**before** the provider call, and `send-aisensy` redacts the secret-bearing keys
on the way out. Between enqueue and drain a temporary password exists in the
queue table in plaintext. For an immediate credential send that window is
seconds; if the queue backs up it is longer. `comms_audit` and analytics never
receive it. The set-password-link flow removes this window entirely.

---

## Cutover blockers

These do not affect **submission**. They affect **activation**, and all three
are code issues in this repository, not Meta issues.

### 1. `val` is not defined in the Deno mirror — all five campaigns would throw

`supabase/functions/send-aisensy/index.ts` defines its local accessor as
`tVal`, but every one of the five `smartark_*` parameter builders calls `val(…)`
— **29 call sites of an identifier that does not exist in that file and is not
imported.**

Because they are arrow-function bodies, the reference resolves at *call* time,
not at module load. The function deploys cleanly and works today precisely
because no `smartark_*` campaign is `ACTIVE`. The moment one is activated and a
row of that campaign reaches the drain loop, it throws
`ReferenceError: val is not defined`.

The existing parity gate did not catch this: it validates the *body placeholder
structure* in `providerTemplates.ts`, not identifier resolution inside the Deno
file.

**This must be fixed and `send-aisensy` redeployed before any status reaches
`ACTIVE`.** It was not fixed here — this task is explicitly submission-only.

### 2. `org_name` is missing from three send-site payloads

The new templates take the organization name as a parameter, so the payload must
carry `org_name`. Audited per send site:

| Campaign | Send site | `org_name` in payload |
|---|---|---|
| `smartark_attendance_absent` | `attendanceWhatsapp.service.ts` (`...orgVars`) | **yes** |
| `smartark_attendance_corrected` | same | **yes** |
| `smartark_staff_credentials1` | `staffCredentials.service.ts`, `CredentialSendPanel.tsx` | **no** |
| `smartark_student_credentials1` | `parentCredentials.service.ts`, `CredentialSendPanel.tsx` | **no** |
| `smartark_fee_receipt` | `feeReceiptDelivery.service.ts` (sets `branch_name` only) | **no** |

An empty positional parameter is exactly what the attendance code already
defends against with its `-` fallback for `section`. Three campaigns would post
an empty final parameter and either fail provider validation or send a message
with no sign-off at all.

### 3. `smartark_student_credentials1` has two further empty-parameter paths

The canonical `student_credentials` template declares
`[parent_name, branch_name, student_name, username, password]` — it names the
login field `username` and has **no `login_url`**. The new builder reads
`login_email` with no `username` alias (the legacy `parent_credentials` builder
*does* have that alias). A send composed through the `student_credentials` key
would post empty `{{3}}` and empty `{{5}}`.

---

## The trailing-variable risk

**All five bodies end with a variable** (`…Thank you,\n{{6}}`,
`…Thank you. — {{7}}`). Meta's template editor commonly flags a body that
terminates in a parameter, and it is a documented cause of rejection for
otherwise well-formed templates.

I cannot verify from this repository whether your WhatsApp Business account will
enforce it — only a submission tells you. It is listed here because your
credential templates have already been rejected twice and a third avoidable
rejection burns another campaign name.

**Cheap mitigation:** add trailing text after the final parameter, e.g.

```
Thank you,
{{6}} Team
```

**This can be done in the AiSensy editor alone.** Because Meta renders its own
body and only the *parameter order* is contractual, changing the surrounding
wording at submission time does not break the application. It does make the
repo's local body (used for email and previews) diverge from the WhatsApp text,
which should be reconciled in a later code change.

My recommendation: submit **Template 1 exactly as written first**. If it is
approved, the trailing variable is not an issue for your account and you can
submit the rest verbatim. If it is rejected for that reason, apply the trailing
text to all five before resubmitting under new names.

---

## Migration tracker

| Legacy campaign | New campaign | Status | Serving production today | Activation |
|---|---|---|---|---|
| `ark_attendance_absent` | `smartark_attendance_absent` | READY_FOR_SUBMISSION | **LEGACY** | status flip + Deno `val` fix |
| `ark_attendance_corrected` | `smartark_attendance_corrected` | READY_FOR_SUBMISSION | **LEGACY** | status flip + Deno `val` fix |
| `staff_credentials` | `smartark_staff_credentials1` | READY_FOR_SUBMISSION | **LEGACY** | + `org_name` in payload |
| `parent_credentials` | `smartark_student_credentials1` | READY_FOR_SUBMISSION | **LEGACY** | + `org_name`, `username` alias, `login_url` |
| `fee_receipt` | `smartark_fee_receipt` | READY_FOR_SUBMISSION | **LEGACY** | + `org_name` in payload |

Lifecycle: `READY_FOR_SUBMISSION → SUBMITTED → APPROVED → (test send verified) → ACTIVE`.
`resolveCampaign()` returns the **legacy** campaign for every status except
`ACTIVE`, so submission and approval change nothing in production until a human
edits `providerTemplates.ts`. Rollback is setting the status back to `APPROVED`
and deploying.

---

## Final Validation

Checked programmatically against the current source, across all five
submission-ready templates:

```
duplicate parameters        : 0
missing parameters          : 0
parameter gaps              : 0
parameter ordering errors    : 0
undeclared variables        : 0
declared-but-unused variables: 0
hardcoded tenant branding   : 0
hardcoded URLs in bodies    : 0
hardcoded phone numbers     : 0
org_name in final position  : 5 / 5
Deno mirror parameter-order mismatch : 0
```

**One qualification on the last line, so it is not read as more than it is.**
The parameter *order* in the Deno mirror is identical to the app builder and to
the declared `params` for all five — verified by parsing all three files. The
mirror is nevertheless **not functional**, because it calls an undefined `val`
(Cutover blocker 1). Order parity and working code are different claims, and
only the first is proven.

---

## READY TO SUBMIT

Submit these to AiSensy now, as new templates, verbatim:

1. **`smartark_attendance_absent`** — UTILITY, English, 6 parameters. Submit
   this one **first** as the trailing-variable probe.
2. **`smartark_attendance_corrected`** — UTILITY, English, 4 parameters.
3. **`smartark_fee_receipt`** — UTILITY, English, 7 parameters. Keep ₹ out of
   the sample values.

All three are structurally valid, organization-neutral, and carry no content
Meta is likely to object to.

## DO NOT SUBMIT YET

4. **`smartark_staff_credentials1`** — and
5. **`smartark_student_credentials1`**

**Why not:** their *structure* is correct and would pass the checks that failed
last time. The problem is content, not shape: both send a plaintext password,
which is the Authentication-category risk described above. You have already
burned two campaign names on this design, and each rejection burns another —
`smartark_staff_credentials1` cannot be edited and resubmitted if it fails.

**What I recommend instead:** hold both until the three above come back. If they
are approved, you will know your trailing-variable and UTILITY assumptions hold,
and the only remaining variable in the credential templates is the password
itself. At that point choose deliberately:

- submit the password design once, accepting it may be rejected and the name
  lost; **or**
- skip it and implement the set-password-link flow, which is better security and
  a far more likely approval.

**Also blocking their usefulness even if approved:** neither send site supplies
`org_name`, and the student template has two further empty-parameter paths
(`username` alias, missing `login_url`). Approving them today would produce
templates that cannot be activated without code changes that have not been made.

---

### Nothing was changed

No template status was altered. `providerTemplates.ts`, `templateParams.ts`,
`send-aisensy`, the scheduler, the database, ARK data and automation settings
are untouched. No function was deployed, no cron enabled, no WhatsApp message
sent. The three cutover blockers above are reported, not fixed.

Related: [`AISENSY_MULTITENANT_TEMPLATE_SUBMISSION.md`](./AISENSY_MULTITENANT_TEMPLATE_SUBMISSION.md) ·
[`AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md`](./AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md) ·
[`AISENSY_MULTITENANT_TEMPLATE_CATALOG.md`](./AISENSY_MULTITENANT_TEMPLATE_CATALOG.md)
